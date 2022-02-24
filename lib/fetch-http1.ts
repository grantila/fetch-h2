import { IncomingMessage } from "http";
import { constants as h2constants } from "http2";
import { Socket } from "net";

import { once } from "already";
import { syncGuard } from "callguard";

import { AbortController } from "./abort";
import { FetchInit } from "./core";
import { SimpleSessionHttp1 } from "./simple-session";
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

const {
	// Responses, these are the same in HTTP/1.1 and HTTP/2
	HTTP2_HEADER_LOCATION: HTTP1_HEADER_LOCATION,
	HTTP2_HEADER_SET_COOKIE: HTTP1_HEADER_SET_COOKIE,
} = h2constants;


export async function fetchImpl(
	session: SimpleSessionHttp1,
	input: Request,
	init: Partial< FetchInit > = { },
	extra: FetchExtra
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
		redirect,
		redirected,
		request,
		signal,
		signalPromise,
		timeoutAt,
		timeoutInfo,
		url,
	} = await setupFetch( session, input, init, extra );

	const { req, cleanup: socketCleanup } = session.get( url );

	const doFetch = async ( ): Promise< Response > =>
	{
		for ( const [ key, value ] of Object.entries( headersToSend ) )
		{
			if ( value != null )
				req.setHeader( key, value );
		}

		const response = new Promise< Response >( ( resolve, reject ) =>
		{
			const guard = syncGuard( reject, { catchAsync: true } );

			req.once( "error", reject );

			req.once( "aborted", guard( ( ) =>
			{
				reject( makeAbortedError( ) );
			} ) );

			req.once( "continue", guard( ( ) =>
			{
				reject( make100Error( ) );
			} ) );

			req.once( "information", guard( ( res: any ) =>
			{
				resolve( new Response(
					null, // No body
					{ status: res.statusCode }
				) );
			} ) );

			req.once( "timeout", guard( ( ) =>
			{
				reject( makeTimeoutError( ) );
				req.abort( );
			} ) );

			req.once( "upgrade", guard(
				(
					_res: IncomingMessage,
					_socket: Socket,
					_upgradeHead: Buffer
				) =>
				{
					reject( new Error( "Upgrade not implemented!" ) );
					req.abort( );
				} )
			);

			req.once( "response", guard( ( res: IncomingMessage ) =>
			{
				res.once( "end", socketCleanup );

				const {
					signal: bodySignal = void 0,
					abort: bodyAbort = void 0,
				} = signal ? new AbortController( ) : { };

				if ( signal )
				{
					const abortHandler = ( ) =>
					{
						( < ( ) => void >bodyAbort )( );
						req.abort( );
						res.destroy( );
					};

					if ( signal.aborted )
					{
						// No reason to continue, the request is aborted
						abortHandler( );
						return;
					}

					signal.addEventListener( "abort", once( abortHandler ) );
					res.once( "end", ( ) =>
					{
						signal.removeEventListener( "abort", abortHandler );
					} );
				}

				const { headers, statusCode } = res;

				res.once( "end", guard( ( ) =>
				{
					if ( !onTrailers )
						return;

					try
					{
						const { trailers } = res;
						const headers = new GuardedHeaders( "response" );

						Object.keys( trailers ).forEach( key =>
						{
							if ( trailers[ key ] != null )
								headers.set( key, "" + trailers[ key ] );
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

				const location = parseLocation(
					headers[ HTTP1_HEADER_LOCATION ],
					url
				);

				const isRedirected = isRedirectStatus[ "" + statusCode ];

				if ( headers[ HTTP1_HEADER_SET_COOKIE ] )
				{
					const setCookies =
						arrayify( headers[ HTTP1_HEADER_SET_COOKIE ] );

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
							res,
							headers,
							redirect === "manual"
								? false
								: extra.redirected.length > 0,
							{
								status: res.statusCode,
								statusText: res.statusMessage,
							},
							bodySignal,
							1,
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

				res.destroy( );

				if ( isRelative )
				{
					resolve(
						fetchImpl(
							session,
							request.clone( locationUrl ),
							{ signal, onTrailers },
							{
								redirected: redirected.concat( url ),
								timeoutAt,
							}
						)
					);
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

		if ( endStream )
			req.end( );
		else
			await request.readable( )
			.then( readable =>
			{
				pipeline( readable, req )
				.catch ( _err =>
				{
					// TODO: Implement error handling
				} );
			} );

		return response;
	};

	return handleSignalAndTimeout(
		signalPromise,
		timeoutInfo,
		cleanup,
		doFetch,
		socketCleanup
	);
}

export function fetch(
	session: SimpleSessionHttp1,
	input: Request,
	init?: Partial< FetchInit >,
	extra?: FetchExtra
)
: Promise< Response >
{
	extra = {
		timeoutAt: extra?.timeoutAt,
		redirected: extra?.redirected ?? [ ],
	};

	return fetchImpl( session, input, init, extra );
}
