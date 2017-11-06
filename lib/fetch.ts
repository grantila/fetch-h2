'use strict'

import { constants as h2constants } from 'http2'
import { URL } from 'url'

import { Finally } from 'already'
import { syncGuard } from 'callguard'

import { arrayify } from './utils'
import {
	Method,
	FetchInit,
	AbortError,
	TimeoutError,
	SimpleSession,
} from './core'
import { Request } from './request'
import { H2StreamResponse, Response } from './response'
import { RawHeaders, Headers, GuardedHeaders } from './headers'
import { BodyInspector } from './body'


const {
	// Required for a request
	HTTP2_HEADER_METHOD,
	HTTP2_HEADER_SCHEME,
	HTTP2_HEADER_PATH,

	// Methods
	HTTP2_METHOD_GET,
	HTTP2_METHOD_HEAD,

	// Requests
	HTTP2_HEADER_USER_AGENT,
	HTTP2_HEADER_ACCEPT,
	HTTP2_HEADER_COOKIE,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_CONTENT_LENGTH,

	// Responses
	HTTP2_HEADER_STATUS,
	HTTP2_HEADER_LOCATION,
	HTTP2_HEADER_SET_COOKIE,

	// Error codes
	NGHTTP2_NO_ERROR,
} = h2constants;

const isRedirectStatus: { [ status: string ]: boolean; } = {
    "300": true,
    "301": true,
    "302": true,
    "303": true,
    "305": true,
    "307": true,
    "308": true,
};

function ensureNotCircularRedirection( redirections: ReadonlyArray< string > )
: void
{
	const urls = [ ...redirections ];
	const last = urls.pop( );

	for ( let i = 0; i < urls.length; ++i )
		if ( urls[ i ] === last )
		{
			const err = new Error( "Redirection loop detected" );
			( < any >err ).urls = urls.slice( i );
			throw err;
		}
}

interface FetchExtra
{
	redirected: Array< string >;
	timeoutAt: number;
}

async function fetchImpl(
	session: SimpleSession,
	input: string | Request,
	init: Partial< FetchInit > = { },
	extra: FetchExtra
)
: Promise< Response >
{
	const { redirected } = extra;
	ensureNotCircularRedirection( redirected );

	const req = new Request( input, init );

	const { url, method, redirect } = req;

	const { signal, onTrailers } = init;

	const {
		protocol,
		host,
		pathname, search, hash
	} = new URL( url );
	const path = pathname + search + hash;

	const endStream =
		method === HTTP2_METHOD_GET || method === HTTP2_METHOD_HEAD;

	const headers = new Headers( req.headers );

	const cookies = ( await session.cookieJar.getCookies( url ) )
		.map( cookie => cookie.cookieString( ) );

	if ( headers.has( HTTP2_HEADER_COOKIE ) )
		cookies.push( ...arrayify( headers.get( HTTP2_HEADER_COOKIE ) ) );

	const headersToSend: RawHeaders = {
		// Set required headers
		[ HTTP2_HEADER_METHOD ]: method,
		[ HTTP2_HEADER_SCHEME ]: protocol.replace( /:.*/, '' ),
		[ HTTP2_HEADER_PATH ]: path,

		// Set default headers
		[ HTTP2_HEADER_ACCEPT ]: session.accept( ),
		[ HTTP2_HEADER_USER_AGENT ]: session.userAgent( ),
	};

	if ( cookies.length > 0 )
		headersToSend[ HTTP2_HEADER_COOKIE ] = cookies.join( '; ' );

	for ( let [ key, val ] of headers.entries( ) )
		if ( key !== HTTP2_HEADER_COOKIE )
			headersToSend[ key ] = val;

	const inspector = new BodyInspector( req );

	if (
		!endStream &&
		inspector.length != null &&
		!req.headers.has( HTTP2_HEADER_CONTENT_LENGTH )
	)
		headersToSend[ HTTP2_HEADER_CONTENT_LENGTH ] = '' + inspector.length;

	if ( !endStream && !req.headers.has( 'content-type' ) && inspector.mime )
		headersToSend[ HTTP2_HEADER_CONTENT_TYPE ] = inspector.mime;

	function timeoutError( )
	{
		return new TimeoutError(
			`${method} ${url} timed out after ${init.timeout} ms` );
	}

	const timeoutAt = extra.timeoutAt || (
		'timeout' in init
			// Setting the timeoutAt here at first time allows async cookie
			// jar to not take part of timeout for at least the first request
			// (in a potential redirect chain)
			? Date.now( ) + init.timeout
			: null
	);

	function setupTimeout( )
	: { promise: Promise< Response >; clear: Function; }
	{
		if ( !timeoutAt )
			return null;

		const now = Date.now( );
		if ( now >= timeoutAt )
			throw timeoutError( );

		let timerId;

		return {
			clear: ( ) =>
			{
				if ( timerId )
					clearTimeout( timerId );
			},
			promise: new Promise( ( resolve, reject ) =>
			{
				timerId = setTimeout( ( ) =>
					{
						timerId = null;
						reject( timeoutError( ) )
					},
					timeoutAt - now
				);
			} )
		};

	}

	const timeoutInfo = setupTimeout( );

	function abortError( )
	{
		return new AbortError( `${method} ${url} aborted` );
	}

	if ( signal && signal.aborted )
		throw abortError( );

	const signalPromise: Promise< Response > =
		signal
		?
			new Promise< Response >( ( resolve, reject ) =>
			{
				signal.onabort = ( ) =>
				{
					reject( abortError( ) );
				};
			} )
		: null;

	function cleanup( )
	{
		if ( timeoutInfo && timeoutInfo.clear )
			timeoutInfo.clear( );

		if ( signal )
			signal.onabort = null;
	}

	function doFetch( ): Promise< Response >
	{
		return session.get( url )
		.then( async h2session =>
		{
			const stream = h2session.request( headersToSend, { endStream } );

			const response = new Promise< Response >( ( resolve, reject ) =>
			{
				const guard = syncGuard( reject, { catchAsync: true } );

				stream.on( 'aborted', guard( ( ...whatever ) =>
				{
					reject( new AbortError( "Request aborted" ) );
				} ) );

				stream.on( 'error', guard( ( err: Error ) =>
				{
					reject( err );
				} ) );

				stream.on( 'frameError', guard( ( ...whatever ) =>
				{
					reject( new Error( "Request failed" ) );
				} ) );

				stream.on( 'streamClosed', guard( errorCode =>
				{
					// We'll get an 'error' event if there actually is an
					// error, but not if we got NGHTTP2_NO_ERROR.
					// In case of an error, the 'error' event will be awaited
					// instead, to get (and propagate) the error object.
					if ( errorCode === NGHTTP2_NO_ERROR )
						reject(
							new AbortError( "Stream prematurely closed" ) );
				} ) );

				stream.on( 'timeout', guard( ( ...whatever ) =>
				{
					reject( new TimeoutError( "Request timed out" ) );
				} ) );

				stream.on( 'trailers', guard( ( _headers, flags ) =>
				{
					if ( !onTrailers )
						return;
					try
					{
						const headers = new GuardedHeaders( 'response' );

						Object.keys( _headers ).forEach( key =>
						{
							if ( Array.isArray( _headers[ key ] ) )
								( < Array< string > >_headers[ key ] )
									.forEach( value =>
										headers.append( key, value ) );
							else
								headers.set( key, '' + _headers[ key ] );
						} );

						onTrailers( headers );
					}
					catch ( err )
					{
						// TODO: Implement #8
						console.warn( "Trailer handling failed", err );
					}
				} ) );

				// ClientHttp2Stream events

				stream.on( 'continue', guard( ( ...whatever ) =>
				{
					reject( new Error(
						"Request failed with 100 continue. " +
						"This can't happen unless a server failure" ) );
				} ) );

				stream.on( 'headers', guard( ( headers, flags ) =>
				{
					const code = headers[ HTTP2_HEADER_STATUS ];
					reject( new Error(
						`Request failed with a ${code} status. ` +
						"Any 1xx error is unexpected to fetch() and " +
						"shouldn't happen." ) );
				} ) );

				stream.on( 'response', guard( headers =>
				{
					if ( signal && signal.aborted )
					{
						// No reason to continue, the request is aborted
						stream.destroy( );
						return;
					}

					const status = '' + headers[ HTTP2_HEADER_STATUS ];
					const location = '' + headers[ HTTP2_HEADER_LOCATION ];

					const isRedirected = isRedirectStatus[ status ];

					if ( headers[ HTTP2_HEADER_SET_COOKIE ] )
					{
						const setCookies =
							arrayify( headers[ HTTP2_HEADER_SET_COOKIE ] );

						session.cookieJar.setCookies( setCookies, url );
					}

					delete headers[ 'set-cookie' ];
					delete headers[ 'set-cookie2' ];

					if ( isRedirected && !location )
						return reject(
							new Error( "Server responded illegally with a " +
								"redirect code but missing 'location' header"
							)
						);

					if ( !isRedirected || redirect === 'manual' )
						return resolve(
							new H2StreamResponse(
								url,
								stream,
								headers,
								redirect === 'manual'
									? false
									: extra.redirected.length > 0
							)
						);

					if ( redirect === 'error' )
						return reject(
							new Error( `URL got redirected to ${location}` ) );

					// redirect is 'follow'

					// We don't support re-sending a non-GET/HEAD request (as
					// we don't want to [can't, if its' streamed] re-send the
					// body). The concept is fundementally broken anyway...
					if ( !endStream )
						return reject( new Error(
							`URL got redirected to ${location}, which ` +
							`'fetch-h2' doesn't support for ${method}` ) );

					stream.destroy( );
					resolve(
						fetchImpl(
							session,
							req.clone( location ),
							{ },
							{
								timeoutAt,
								redirected: redirected.concat( url )
							}
						)
					);
				} ) );
			} )

			if ( !endStream )
				await req.readable( )
				.then( readable =>
				{
					readable.pipe( stream );
				} );

			return response;
		} );
	}

	return Promise.race(
		[
			signalPromise,
			timeoutInfo && timeoutInfo.promise,
			doFetch( ),
		]
		.filter( promise => promise )
	)
	.then( ...Finally( cleanup ) );
}

export function fetch(
	session: SimpleSession,
	input: string | Request,
	init?: Partial< FetchInit >
)
: Promise< Response >
{
	const timeoutAt = null;

	return fetchImpl( session, input, init, { timeoutAt, redirected: [ ] } );
}
