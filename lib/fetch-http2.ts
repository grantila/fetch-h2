import {
	constants as h2constants,
	IncomingHttpHeaders as IncomingHttp2Headers,
	ClientHttp2Stream,
} from "http2";

import { syncGuard } from "callguard";

import { AbortController } from "./abort";
import {
	AbortError,
	RetryError,
	FetchInit,
} from "./core";
import { SimpleSessionHttp2 } from "./simple-session";
import {
	FetchExtra,
	handleSignalAndTimeout,
	make100Error,
	makeAbortedError,
	makeIllegalRedirectError,
	makeRedirectionError,
	makeRedirectionMethodError,
	makeTimeoutError,
	setupFetch,
} from "./fetch-common";
import { GuardedHeaders } from "./headers";
import { Request } from "./request";
import { Response, StreamResponse } from "./response";
import {
	arrayify,
	isRedirectStatus,
	parseLocation,
	pipeline,
	ParsedLocation,
} from "./utils";
import { hasGotGoaway } from "./utils-http2";

const {
	// Responses
	HTTP2_HEADER_STATUS,
	HTTP2_HEADER_LOCATION,
	HTTP2_HEADER_SET_COOKIE,

	// Error codes
	NGHTTP2_NO_ERROR,
} = h2constants;

// This is from nghttp2.h, but undocumented in Node.js
const NGHTTP2_ERR_START_STREAM_NOT_ALLOWED = -516;

interface FetchExtraHttp2 extends FetchExtra
{
	raceConditionedGoaway: Set< string >; // per origin
}

async function fetchImpl(
	session: SimpleSessionHttp2,
	input: Request,
	init: Partial< FetchInit > = { },
	extra: FetchExtraHttp2
)
: Promise< Response >
{
	const {
		cleanup,
		contentDecoders,
		endStream,
		headersToSend,
		integrity,
		method,
		onTrailers,
		origin,
		redirect,
		redirected,
		request,
		signal,
		signalPromise,
		timeoutAt,
		timeoutInfo,
		url,
	} = await setupFetch( session, input, init, extra );

	const { raceConditionedGoaway } = extra;

	const streamPromise = session.get( );

	async function doFetch( ): Promise< Response >
	{
		const { session: ph2session, cleanup: socketCleanup } = streamPromise;
		const h2session = await ph2session;

		const tryRetryOnGoaway =
			( resolve: ( value: Promise< Response > ) => void ) =>
		{
			// This could be due to a race-condition in GOAWAY.
			// As of current Node.js, the 'goaway' event is emitted on the
			// session before this event (at least frameError, probably
			// 'error' too) is emitted, so we will know if we got it.
			if (
				!raceConditionedGoaway.has( origin ) &&
				hasGotGoaway( h2session )
			)
			{
				// Don't retry again due to potential GOAWAY
				raceConditionedGoaway.add( origin );

				// Since we've got the 'goaway' event, the
				// context has already released the session,
				// so a retry will create a new session.
				resolve(
					fetchImpl(
						session,
						request,
						{ signal, onTrailers },
						{
							raceConditionedGoaway,
							redirected,
							timeoutAt,
						}
					)
				);

				return true;
			}
			return false;
		};

		let stream: ClientHttp2Stream;
		let shouldCleanupSocket = true;
		try
		{
			stream = h2session.request( headersToSend, { endStream } );
		}
		catch ( err: any )
		{
			if ( err.code === "ERR_HTTP2_GOAWAY_SESSION" )
			{
				// Retry with new session
				throw new RetryError( err.code );
			}
			throw err;
		}

		const response = new Promise< Response >( ( resolve, reject ) =>
		{
			const guard = syncGuard( reject, { catchAsync: true } );

			stream.on( "aborted", guard( ( ..._whatever ) =>
			{
				reject( makeAbortedError( ) );
			} ) );

			stream.on( "error", guard( ( err: Error ) =>
			{
				if (
					err &&
					( < any >err ).code === "ERR_HTTP2_STREAM_ERROR" &&
					err.message &&
					err.message.includes( "NGHTTP2_REFUSED_STREAM" )
				)
				{
					if ( tryRetryOnGoaway( resolve ) )
						return;
				}
				reject( err );
			} ) );

			stream.on( "frameError", guard(
				( _type: number, code: number, _streamId: number ) =>
				{
					if (
						code === NGHTTP2_ERR_START_STREAM_NOT_ALLOWED &&
						endStream
					)
					{
						if ( tryRetryOnGoaway( resolve ) )
							return;
					}

					reject( new Error( "Request failed" ) );
				} )
			);

			stream.on( "close", guard( ( ) =>
			{
				if ( shouldCleanupSocket )
					socketCleanup( );

				// We'll get an 'error' event if there actually is an
				// error, but not if we got NGHTTP2_NO_ERROR.
				// In case of an error, the 'error' event will be awaited
				// instead, to get (and propagate) the error object.
				if ( stream.rstCode === NGHTTP2_NO_ERROR )
					reject(
						new AbortError( "Stream prematurely closed" ) );
			} ) );

			stream.on( "timeout", guard( ( ..._whatever ) =>
			{
				reject( makeTimeoutError( ) );
			} ) );

			stream.on( "trailers", guard(
				( _headers: IncomingHttp2Headers, _flags: any ) =>
			{
				if ( !onTrailers )
					return;
				try
				{
					const headers = new GuardedHeaders( "response" );

					Object.keys( _headers ).forEach( key =>
					{
						if ( Array.isArray( _headers[ key ] ) )
							( < Array< string > >_headers[ key ] )
								.forEach( value =>
									headers.append( key, value ) );
						else
							headers.set( key, "" + _headers[ key ] );
					} );

					onTrailers( headers );
				}
				catch ( err )
				{
					// TODO: Implement #8
					// tslint:disable-next-line
					console.warn( "Trailer handling failed", err );
				}
			} ) );

			// ClientHttp2Stream events

			stream.on( "continue", guard( ( ..._whatever ) =>
			{
				reject( make100Error( ) );
			} ) );

			stream.on( "response", guard( ( headers: IncomingHttp2Headers ) =>
			{
				const {
					signal: bodySignal = void 0,
					abort: bodyAbort = void 0,
				} = signal ? new AbortController( ) : { };

				if ( signal )
				{
					const abortHandler = ( ) =>
					{
						( < ( ) => void >bodyAbort )( );
						stream.destroy( );
					};

					if ( signal.aborted )
					{
						// No reason to continue, the request is aborted
						abortHandler( );
						return;
					}

					signal.once( "abort", abortHandler );
					stream.once( "close", ( ) =>
					{
						signal.removeListener( "abort", abortHandler );
					} );
				}

				const status = "" + headers[ HTTP2_HEADER_STATUS ];
				const location = parseLocation(
					headers[ HTTP2_HEADER_LOCATION ],
					url
				);

				const isRedirected = isRedirectStatus[ status ];

				if ( session.cookieJar && headers[ HTTP2_HEADER_SET_COOKIE ] )
				{
					const setCookies =
						arrayify( headers[ HTTP2_HEADER_SET_COOKIE ] );

					session.cookieJar.setCookies( setCookies, url );
				}

				if ( !input.allowForbiddenHeaders )
				{
					delete headers[ "set-cookie" ];
					delete headers[ "set-cookie2" ];
				}

				if ( isRedirected && !location )
					return reject( makeIllegalRedirectError( ) );

				if ( !isRedirected || redirect === "manual" )
					return resolve(
						new StreamResponse(
							contentDecoders,
							url,
							stream,
							headers,
							redirect === "manual"
								? false
								: extra.redirected.length > 0,
							{ },
							bodySignal,
							2,
							input.allowForbiddenHeaders,
							integrity
						)
					);

				const { url: locationUrl, isRelative } =
					location as ParsedLocation;

				if ( redirect === "error" )
					return reject( makeRedirectionError( locationUrl ) );

				// redirect is 'follow'

				// We don't support re-sending a non-GET/HEAD request (as
				// we don't want to [can't, if its' streamed] re-send the
				// body). The concept is fundementally broken anyway...
				if ( !endStream )
					return reject(
						makeRedirectionMethodError( locationUrl, method )
					);

				if ( !location )
					return reject( makeIllegalRedirectError( ) );

				if ( isRelative )
				{
					shouldCleanupSocket = false;
					stream.destroy( );
					resolve( fetchImpl(
						session,
						request.clone( locationUrl ),
						init,
						{
							raceConditionedGoaway,
							redirected: redirected.concat( url ),
							timeoutAt,
						}
					) );
				}
				else
				{
					resolve( session.newFetch(
						request.clone( locationUrl ),
						init,
						{
							timeoutAt,
							redirected: redirected.concat( url ),
						}
					) );
				}
			} ) );
		} );

		if ( !endStream )
			await request.readable( )
			.then( readable =>
			{
				pipeline( readable, stream )
				.catch ( _err =>
				{
					// TODO: Implement error handling
				} );
			} );

		return response;
	}

	return handleSignalAndTimeout(
		signalPromise,
		timeoutInfo,
		cleanup,
		doFetch,
		streamPromise.cleanup
	);
}

export function fetch(
	session: SimpleSessionHttp2,
	input: Request,
	init?: Partial< FetchInit >,
	extra?: FetchExtra
)
: Promise< Response >
{
	const http2Extra: FetchExtraHttp2 = {
		timeoutAt: extra?.timeoutAt,
		redirected: extra?.redirected ?? [ ],
		raceConditionedGoaway: new Set< string>( ),
	};

	return fetchImpl( session, input, init, http2Extra );
}
