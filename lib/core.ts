'use strict'

import {
	SessionOptions,
	SecureClientSessionOptions,
	ClientHttp2Session,
} from 'http2'

import { URL } from 'url'

import { RawHeaders, Headers } from './headers'
import { CookieJar } from './cookie-jar'

export type Method =
	'ACL' |
	'BIND' |
	'CHECKOUT' |
	'CONNECT' |
	'COPY' |
	'DELETE' |
	'GET' |
	'HEAD' |
	'LINK' |
	'LOCK' |
	'M-SEARCH' |
	'MERGE' |
	'MKACTIVITY' |
	'MKCALENDAR' |
	'MKCOL' |
	'MOVE' |
	'NOTIFY' |
	'OPTIONS' |
	'PATCH' |
	'POST' |
	'PROPFIND' |
	'PROPPATCH' |
	'PURGE' |
	'PUT' |
	'REBIND' |
	'REPORT' |
	'SEARCH' |
	'SUBSCRIBE' |
	'TRACE' |
	'UNBIND' |
	'UNLINK' |
	'UNLOCK' |
	'UNSUBSCRIBE';

export type StorageBodyTypes =
	Buffer | NodeJS.ReadableStream;

export type BodyTypes =
	StorageBodyTypes | string;

export type ModeTypes =
	'cors' |
	'no-cors' |
	'same-origin';

export type CredentialsTypes =
	'omit' |
	'same-origin' |
	'include';

export type CacheTypes =
	'default' |
	'no-store' |
	'reload' |
	'no-cache' |
	'force-cache' |
	'only-if-cached';

export type RedirectTypes =
	'follow' |
	'error' |
	'manual';

export type SpecialReferrerTypes =
	'no-referrer' |
	'client';

export type ReferrerTypes =
	SpecialReferrerTypes |
	string;

export type ReferrerPolicyTypes =
	'no-referrer' |
	'no-referrer-when-downgrade' |
	'origin' |
	'origin-when-cross-origin' |
	'unsafe-url';

export type ResponseTypes =
	'basic' |
	'cors' |
	'error';

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

export interface PushMessage
{
	url: string;
	method: Method;
	statusCode: number;
	headers: Headers;
}

export interface RequestInit
{
	method: Method;
	headers: RawHeaders | Headers;
	body: BodyTypes | IBody;
	mode: ModeTypes;
	credentials: CredentialsTypes;
	cache: CacheTypes;
	redirect: RedirectTypes;
	referrer: ReferrerTypes;
	referrerPolicy: ReferrerPolicyTypes;
	integrity: string;
}

export interface FetchInit extends RequestInit
{
	signal: Signal;

	// This is a helper (just like node-fetch), not part of the Fetch API.
	// Must not be used if signal is used.
	// In milliseconds.
	timeout: number;

	// Callback for push messages
	onPush: ( message: PushMessage ) => void;
}

export interface ResponseInit
{
	status: number;
	statusText: string;
	headers: RawHeaders | Headers;
}

export class AbortError extends Error
{
	constructor( message: string )
	{
		super( message );
		Object.setPrototypeOf( this, AbortError.prototype );
	}
}

export interface SimpleSession
{
	get(
		url: string | URL,
		options?: SessionOptions | SecureClientSessionOptions
	): Promise< ClientHttp2Session >;

	userAgent( ): string;
	accept( ): string;

	cookieJar: CookieJar;
}
