import { ClientRequest } from "http";
import { ClientHttp2Session } from "http2";

import { CookieJar } from "./cookie-jar";
import { Headers, RawHeaders } from "./headers";


export type Method =
	"ACL" |
	"BIND" |
	"CHECKOUT" |
	"CONNECT" |
	"COPY" |
	"DELETE" |
	"GET" |
	"HEAD" |
	"LINK" |
	"LOCK" |
	"M-SEARCH" |
	"MERGE" |
	"MKACTIVITY" |
	"MKCALENDAR" |
	"MKCOL" |
	"MOVE" |
	"NOTIFY" |
	"OPTIONS" |
	"PATCH" |
	"POST" |
	"PROPFIND" |
	"PROPPATCH" |
	"PURGE" |
	"PUT" |
	"REBIND" |
	"REPORT" |
	"SEARCH" |
	"SUBSCRIBE" |
	"TRACE" |
	"UNBIND" |
	"UNLINK" |
	"UNLOCK" |
	"UNSUBSCRIBE";

export type StorageBodyTypes =
	Buffer | NodeJS.ReadableStream;

export type BodyTypes =
	StorageBodyTypes | string;

export type ModeTypes =
	"cors" |
	"no-cors" |
	"same-origin";

export type CredentialsTypes =
	"omit" |
	"same-origin" |
	"include";

export type CacheTypes =
	"default" |
	"no-store" |
	"reload" |
	"no-cache" |
	"force-cache" |
	"only-if-cached";

export type RedirectTypes =
	"follow" |
	"error" |
	"manual";

export type SpecialReferrerTypes =
	"no-referrer" |
	"client";

export type ReferrerTypes =
	SpecialReferrerTypes |
	string;

export type ReferrerPolicyTypes =
	"no-referrer" |
	"no-referrer-when-downgrade" |
	"origin" |
	"origin-when-cross-origin" |
	"unsafe-url";

export type ResponseTypes =
	"basic" |
	"cors" |
	"error";

export type HttpProtocols = "http1" | "http2";

export type HttpVersion = 1 | 2;

export interface IBody
{
	readonly bodyUsed: boolean;
	arrayBuffer( ): Promise< ArrayBuffer >;
	formData( ): Promise< any /* FormData */ >;
	json( ): Promise< any >;
	text( ): Promise< string >;
	readable( ): Promise< NodeJS.ReadableStream >;
}

export interface Signal
{
	readonly aborted: boolean;
	onabort: ( ) => void;
}

export interface RequestInitWithoutBody
{
	method: Method;
	headers: RawHeaders | Headers;
	mode: ModeTypes;
	credentials: CredentialsTypes;
	cache: CacheTypes;
	redirect: RedirectTypes;
	referrer: ReferrerTypes;
	referrerPolicy: ReferrerPolicyTypes;
	integrity: string;
	allowForbiddenHeaders: boolean;
}

export interface RequestInit extends RequestInitWithoutBody
{
	body: BodyTypes | IBody;
	json: any;
}

export interface RequestInitWithUrl extends RequestInit
{
	url: string;
}

export type OnTrailers = ( headers: Headers ) => void;

export interface FetchInit extends RequestInit
{
	signal: Signal;

	// This is a helper (just like node-fetch), not part of the Fetch API.
	// Must not be used if signal is used.
	// In milliseconds.
	timeout: number;

	// Callback for trailing headers
	onTrailers: OnTrailers;
}

export interface ResponseInit
{
	status: number;
	statusText: string;
	headers: RawHeaders | Headers;
	allowForbiddenHeaders: boolean;
}

export class FetchError extends Error
{
	constructor( message: string )
	{
		super( message );
		Object.setPrototypeOf( this, FetchError.prototype );
	}
}

export class AbortError extends Error
{
	constructor( message: string )
	{
		super( message );
		Object.setPrototypeOf( this, AbortError.prototype );
	}
}

export class TimeoutError extends Error
{
	constructor( message: string )
	{
		super( message );
		Object.setPrototypeOf( this, TimeoutError.prototype );
	}
}

export type DecodeFunction =
	( stream: NodeJS.ReadableStream ) => NodeJS.ReadableStream;

export interface Decoder
{
	name: string;
	decode: DecodeFunction;
}

export type PerOrigin< T > = ( origin: string ) => T;

export function getByOrigin< T >(
	val: T | PerOrigin< T >,
	origin: string
)
: T
{
	return typeof val === "function"
		? ( < PerOrigin< T > >val )( origin )
		: val;
}

export function parsePerOrigin< T >(
	val: T | PerOrigin< T > | void,
	_default: T
)
: T | PerOrigin< T >
{
	if ( val == null )
	{
		return _default;
	}

	if ( typeof val === "function" )
		return ( origin: string ) =>
		{
			const ret = ( < PerOrigin< T > >val )( origin );
			if ( ret == null )
				return _default;
			return ret;
		};

	return val;
}

export interface Http1Options
{
	keepAlive: boolean | PerOrigin< boolean >;
	keepAliveMsecs: number | PerOrigin< number >;
	maxSockets: number | PerOrigin< number >;
	maxFreeSockets: number | PerOrigin< number >;
	timeout: void | number | PerOrigin< void | number >;
}

export interface SimpleSession
{
	protocol: HttpProtocols;

	cookieJar: CookieJar;

	userAgent( ): string;
	accept( ): string;

	contentDecoders( ): ReadonlyArray< Decoder >;
}

export interface SimpleSessionHttp1Request
{
	req: ClientRequest;
	cleanup: ( ) => void;
}

export interface SimpleSessionHttp2Session
{
	session: ClientHttp2Session;
	cleanup: ( ) => void;
}

export interface SimpleSessionHttp1 extends SimpleSession
{
	get( url: string ): SimpleSessionHttp1Request;
}

export interface SimpleSessionHttp2 extends SimpleSession
{
	get( url: string ): Promise< SimpleSessionHttp2Session >;
}
