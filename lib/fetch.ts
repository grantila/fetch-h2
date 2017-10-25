'use strict'

import { constants as h2constants } from 'http2'
import { URL } from 'url'

import AbortController from 'abort-controller'
import { Finally } from 'already'
import { syncGuard } from 'callguard'

import { arrayify } from './utils'
import { Method, FetchInit, AbortError, SimpleSession } from './core'
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

	const { signal, onPush } = init;

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
		.map( cookie => cookie.cookieString( ) )
		.join( '; ' );

	const headersToSend: RawHeaders = {
		// Set required headers
		[ HTTP2_HEADER_METHOD ]: method,
		[ HTTP2_HEADER_SCHEME ]: protocol.replace( /:.*/, '' ),
		[ HTTP2_HEADER_PATH ]: path,

		// Set default headers
		[ HTTP2_HEADER_ACCEPT ]: session.accept( ),
		[ HTTP2_HEADER_USER_AGENT ]: session.userAgent( ),
		[ HTTP2_HEADER_COOKIE ]: cookies,
	};

	for ( let [ key, val ] of headers.entries( ) )
	{
		if ( key === HTTP2_HEADER_COOKIE && headersToSend[ key ] )
			( headersToSend[ key ] as string[] ).push( ...arrayify( val ) );
		else
			headersToSend[ key ] = val;
	}

	const inspector = new BodyInspector( req );

	if (
		!endStream &&
		inspector.length != null &&
		!req.headers.has( HTTP2_HEADER_CONTENT_LENGTH )
	)
		headersToSend[ HTTP2_HEADER_CONTENT_LENGTH ] = '' + inspector.length;

	if ( !endStream && !req.headers.has( 'content-type' ) && inspector.mime )
		headersToSend[ HTTP2_HEADER_CONTENT_TYPE ] = inspector.mime;

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

	function cleanupSignals( )
	{
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

				stream.on( 'aborted', guard( ( ...undocumented ) =>
				{
					console.error( "Not yet handled 'aborted'", undocumented );
				} ) );

				stream.on( 'error', guard( ( err: Error ) =>
				{
					reject( err );
				} ) );

				stream.on( 'frameError', guard( ( ...undocumented ) =>
				{
					console.error("Not yet handled 'frameError'", undocumented );
				} ) );

				stream.on( 'streamClosed', guard( errorCode =>
				{
					// We'll get an 'error' event if there actually is an
					// error, but not if we got NGHTTP2_NO_ERROR.
					// In case of an error, the 'error' event will be awaited
					// instead, to get (and propagate) the error object.
					if ( errorCode === NGHTTP2_NO_ERROR )
						reject( new Error( "Stream prematurely closed" ) );
				} ) );

				stream.on( 'timeout', guard( ( ...undocumented ) =>
				{
					console.error("Not yet handled 'timeout'", undocumented );
				} ) );

				stream.on( 'trailers', guard( ( headers, flags ) =>
				{
					console.error("Not yet handled 'trailers'", headers, flags);
				} ) );

				// ClientHttp2Stream events

				stream.on( 'continue', guard( ( ...undocumented ) =>
				{
					console.error("Not yet handled 'continue'", undocumented);
				} ) );

				stream.on( 'headers', guard( ( headers, flags ) =>
				{
					console.error("Not yet handled 'headers'", headers, flags);
				} ) );

				stream.on( 'push', guard( ( _headers, flags ) =>
				{
					if ( !onPush )
					{
						// TODO: Signal context-specific/global
						//       onhandled-push-handler.
						//       Ugly console.log for now.
						console.log(
							"No onPush handler registered, " +
							"will drop the PUSH_PROMISE" );
						return;
					}

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
					const url = '' + _headers[ HTTP2_HEADER_PATH ];
					const method = < Method >_headers[ HTTP2_HEADER_METHOD ];
					const statusCode =
						parseInt( '' + _headers[ HTTP2_HEADER_STATUS ] );

					try
					{
						onPush( { url, headers, method, statusCode } );
					}
					catch ( err )
					{
						console.error(
							"onPush callback threw error, goodbye!",
							err
						);
						// Stop throwing in callbacks you lunatic
						process.exit( 1 );
					}
				} ) );

				stream.on( 'response', guard( headers =>
				{
					if ( signal && signal.aborted )
					{
						// No reason to continue, the request is aborted
						stream.destroy( );
						return;
					}

					const status =
						parseInt( '' + headers[ HTTP2_HEADER_STATUS ] );
					const location = '' + headers[ HTTP2_HEADER_LOCATION ];

					const isRedirected = isRedirectStatus[ '' + status ];

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
							{ redirected: redirected.concat( url ) }
						)
					);
				} ) );
			} )

			if ( !endStream )
				await req.readable( )
				.then( readable =>
				{
					readable.pipe( stream );
					return stream;
				} )

			return response;
		} );
	}

	return Promise.race(
		[
			signalPromise,
			doFetch( ),
		]
		.filter( promise => promise )
	)
	.then( ...Finally( cleanupSignals ) );
}

export function fetch(
	session: SimpleSession,
	input: string | Request,
	init?: Partial< FetchInit >
)
: Promise< Response >
{
	if ( init && init.signal && 'timeout' in init )
		throw new Error(
			"Cannot provide both 'timeout' and 'signal' to fetch()" );

	if ( init && 'timeout' in init )
	{
		const timeout = init.timeout;

		const newInit: Partial< FetchInit > = Object.assign( { }, init );
		delete newInit.timeout;

		const abortController = new AbortController( );
		newInit.signal = abortController.signal;
		let timerId = setTimeout( ( ) =>
			{
				timerId = null;
				abortController.abort( );
			}, timeout );

		return fetch( session, input, newInit )
		.then( ...Finally( ( ) =>
		{
			if ( timerId )
				clearTimeout( timerId );
		} ) );
	}

	return fetchImpl( session, input, init, { redirected: [ ] } );
}
