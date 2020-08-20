import { constants as h2constants } from "http2";
import { URL } from "url";

import { Finally, rethrow } from "already";

import { BodyInspector } from "./body";
import { AbortError, Decoder, FetchInit, TimeoutError } from "./core";
import { SimpleSession } from "./simple-session";
import { Headers, RawHeaders } from "./headers";
import { Request } from "./request";
import { Response } from "./response";
import { arrayify, hasBuiltinBrotli } from "./utils";

const {
	// Required for a request
	HTTP2_HEADER_METHOD,
	HTTP2_HEADER_SCHEME,
	HTTP2_HEADER_PATH,
	HTTP2_HEADER_AUTHORITY,

	// Methods
	HTTP2_METHOD_GET,
	HTTP2_METHOD_HEAD,

	// Requests
	HTTP2_HEADER_USER_AGENT,
	HTTP2_HEADER_ACCEPT,
	HTTP2_HEADER_COOKIE,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_CONTENT_LENGTH,
	HTTP2_HEADER_ACCEPT_ENCODING,
} = h2constants;


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

export interface FetchExtra
{
	redirected: Array< string >;
	timeoutAt?: number;
}

export interface TimeoutInfo
{
	promise: Promise< Response >;
	clear: ( ) => void;
}


interface AcceptEncodings
{
	name: string;
	score: number;
}

const makeDefaultEncodings = ( mul = 1 ) =>
	hasBuiltinBrotli( )
	? [
		{ name: "br", score: 1.0 * mul },
		{ name: "gzip", score: 0.8 * mul },
		{ name: "deflate", score: 0.5 * mul },
	]
	: [
		{ name: "gzip", score: 1.0 * mul },
		{ name: "deflate", score: 0.5 * mul },
	];

const defaultEncodings = makeDefaultEncodings( );
const fallbackEncodings = makeDefaultEncodings( 0.8 );

const stringifyEncoding = ( acceptEncoding: AcceptEncodings ) =>
	`${acceptEncoding.name};q=${acceptEncoding.score}`;

const stringifyEncodings = ( accepts: ReadonlyArray< AcceptEncodings > ) =>
	accepts
	.map( acceptEncoding => stringifyEncoding( acceptEncoding ) )
	.join( ", " );

function getEncodings( contentDecoders: ReadonlyArray< Decoder > ): string
{
	if ( contentDecoders.length === 0 )
		return stringifyEncodings( defaultEncodings );

	const makeScore = ( index: number ) =>
		1 - ( index / ( contentDecoders.length ) ) * 0.2;

	return stringifyEncodings(
		[
			...contentDecoders.map( ( { name }, index ) =>
				( { name, score: makeScore( index ) } )
			),
			...fallbackEncodings,
		]
	);
}

export async function setupFetch(
	session: SimpleSession,
	request: Request,
	init: Partial< FetchInit > = { },
	extra: FetchExtra
)
{
	const { redirected } = extra;

	ensureNotCircularRedirection( redirected );

	const { url, method, redirect, integrity } = request;

	const { signal, onTrailers } = init;

	const {
		origin,
		protocol,
		host,
		pathname, search, hash,
	} = new URL( url );
	const path = pathname + search + hash;

	const endStream =
		method === HTTP2_METHOD_GET || method === HTTP2_METHOD_HEAD;

	const headers = new Headers( request.headers );

	const cookies = ( await session.cookieJar.getCookies( url ) )
		.map( cookie => cookie.cookieString( ) );

	const contentDecoders = session.contentDecoders( );

	const acceptEncoding = getEncodings( contentDecoders );

	if ( headers.has( HTTP2_HEADER_COOKIE ) )
		cookies.push( ...arrayify( headers.get( HTTP2_HEADER_COOKIE ) ) );

	if ( !headers.has( "host" ) )
		headers.set( "host", host );

	const headersToSend: RawHeaders = {
		// Set required headers
		...( session.protocol === "http1" ? { } : {
			[ HTTP2_HEADER_METHOD ]: method,
			[ HTTP2_HEADER_SCHEME ]: protocol.replace( /:.*/, "" ),
			[ HTTP2_HEADER_PATH ]: path,
		} ),

		// Set default headers
		[ HTTP2_HEADER_ACCEPT ]: session.accept( ),
		[ HTTP2_HEADER_USER_AGENT ]: session.userAgent( ),
		[ HTTP2_HEADER_ACCEPT_ENCODING ]: acceptEncoding,
	};

	if ( cookies.length > 0 )
		headersToSend[ HTTP2_HEADER_COOKIE ] = cookies.join( "; " );

	for ( const [ key, val ] of headers.entries( ) )
	{
		if ( key === "host" && session.protocol === "http2" )
			// Convert to :authority like curl does:
			// https://github.com/grantila/fetch-h2/issues/9
			headersToSend[ HTTP2_HEADER_AUTHORITY ] = val;
		else if ( key !== HTTP2_HEADER_COOKIE )
			headersToSend[ key ] = val;
	}

	const inspector = new BodyInspector( request );

	if (
		!endStream &&
		inspector.length != null &&
		!request.headers.has( HTTP2_HEADER_CONTENT_LENGTH )
	)
		headersToSend[ HTTP2_HEADER_CONTENT_LENGTH ] = "" + inspector.length;

	if (
		!endStream &&
		!request.headers.has( "content-type" ) &&
		inspector.mime
	)
		headersToSend[ HTTP2_HEADER_CONTENT_TYPE ] = inspector.mime;

	function timeoutError( )
	{
		return new TimeoutError(
			`${method} ${url} timed out after ${init.timeout} ms` );
	}

	const timeoutAt = extra.timeoutAt || (
		( "timeout" in init && typeof init.timeout === "number" )
			// Setting the timeoutAt here at first time allows async cookie
			// jar to not take part of timeout for at least the first request
			// (in a potential redirect chain)
			? Date.now( ) + init.timeout
			: void 0
	);

	function setupTimeout( ): TimeoutInfo | null
	{
		if ( !timeoutAt )
			return null;

		const now = Date.now( );
		if ( now >= timeoutAt )
			throw timeoutError( );

		let timerId: NodeJS.Timeout | null;

		return {
			clear: ( ) =>
			{
				if ( timerId )
					clearTimeout( timerId );
			},
			promise: new Promise( ( _resolve, reject ) =>
			{
				timerId = setTimeout( ( ) =>
					{
						timerId = null;
						reject( timeoutError( ) );
					},
					timeoutAt - now
				);
			} ),
		};

	}

	const timeoutInfo = setupTimeout( );

	function abortError( )
	{
		return new AbortError( `${method} ${url} aborted` );
	}

	if ( signal && signal.aborted )
		throw abortError( );

	let abortHandler: ( ( ) => void ) | undefined;

	const signalPromise: Promise< Response > | null =
		signal
		?
			new Promise< Response >( ( _resolve, reject ) =>
			{
				signal.once( "abort", abortHandler = ( ) =>
				{
					reject( abortError( ) );
				} );
			} )
		: null;

	function cleanup( )
	{
		timeoutInfo?.clear?.( );
		timeoutInfo?.promise?.catch( _err => { } );

		if ( signal && abortHandler )
			signal.removeListener( "abort", abortHandler );
	}

	return {
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
	};
}

export function handleSignalAndTimeout(
	signalPromise: Promise< Response > | null,
	timeoutInfo: TimeoutInfo | null,
	cleanup: ( ) => void,
	fetcher: ( ) => Promise< Response >,
	onError: ( ) => void
)
{
	return Promise.race(
		[
			< Promise< any > >signalPromise,
			< Promise< any > >( timeoutInfo && timeoutInfo.promise ),
			fetcher( ).catch( rethrow( onError ) ),
		]
		.filter( promise => promise )
	)
	.then( ...Finally( cleanup ) );
}

export function make100Error( )
{
	return new Error(
		"Request failed with 100 continue. " +
		"This can't happen unless a server failure"
	);
}

export function makeAbortedError( )
{
	return new AbortError( "Request aborted" );
}

export function makeTimeoutError( )
{
	return new TimeoutError( "Request timed out" );
}

export function makeIllegalRedirectError( )
{
	return new Error(
		"Server responded illegally with a " +
		"redirect code but missing 'location' header"
	);
}

export function makeRedirectionError( location: string | null )
{
	return new Error( `URL got redirected to ${location}` );
}

export function makeRedirectionMethodError(
	location: string | null, method: string
)
{
	return new Error(
		`URL got redirected to ${location}, which ` +
		`'fetch-h2' doesn't support for ${method}`
	);
}
