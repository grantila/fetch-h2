import {
	CacheTypes,
	CredentialsTypes,
	Method,
	ModeTypes,
	RedirectTypes,
	ReferrerPolicyTypes,
	ReferrerTypes,
	RequestInit,
	RequestInitWithoutBody,
	RequestInitWithUrl,
} from "./core";

import { Body, JsonBody } from "./body";
import { GuardedHeaders, Headers } from "./headers";


const defaultInit: Partial< RequestInit > = {
	cache: "default",
	credentials: "omit",
	method: "GET",
	mode: "same-origin",
	redirect: "manual",
	referrer: "client",
};

export class Request extends Body implements RequestInitWithoutBody
{
	// @ts-ignore
	public readonly method: Method;
	// @ts-ignore
	public readonly url: string;
	// @ts-ignore
	public readonly headers: Headers;
	// @ts-ignore
	public readonly referrer: ReferrerTypes;
	// @ts-ignore
	public readonly referrerPolicy: ReferrerPolicyTypes;
	// @ts-ignore
	public readonly mode: ModeTypes;
	// @ts-ignore
	public readonly credentials: CredentialsTypes;
	// @ts-ignore
	public readonly redirect: RedirectTypes;
	// @ts-ignore
	public readonly integrity: string;
	// @ts-ignore
	public readonly cache: CacheTypes;

	private _url: string;
	private _init: Partial< RequestInit >;

	constructor( input: string | Request, init?: Partial< RequestInitWithUrl > )
	{
		super( );

		const { url: overwriteUrl } = init || ( { } as RequestInitWithUrl );

		// TODO: Consider throwing a TypeError if the URL has credentials
		this._url =
			input instanceof Request
			? ( overwriteUrl || input._url )
			: ( overwriteUrl || input );

		if ( input instanceof Request )
		{
			if ( input.hasBody( ) )
				// Move body to this request
				this.setBody( input );

			const newInit: Partial< RequestInit > = Object.assign(
				{ },
				input,
				init
			);
			init = newInit;

			// TODO: Follow MDN:
			//       If this object exists on another origin to the
			//       constructor call, the Request.referrer is stripped out.
			//       If this object has a Request.mode of navigate, the mode
			//       value is converted to same-origin.
		}

		this._init = Object.assign( { }, defaultInit, init );

		const headers = new GuardedHeaders(
			this._init.mode === "no-cors"
				? "request-no-cors"
				: "request",
			this._init.headers
		);

		if ( this._init.body && this._init.json )
			throw new Error( "Cannot specify both 'body' and 'json'" );

		if ( !this.hasBody( ) && this._init.body )
		{
			if ( headers.has( "content-type" ) )
				this.setBody( this._init.body, headers.get( "content-type" ) );
			else
				this.setBody( this._init.body );
		}
		else if ( !this.hasBody( ) && this._init.json )
		{
			this.setBody( new JsonBody( this._init.json ) );
		}

		Object.defineProperties( this, {
			cache: {
				enumerable: true,
				value: this._init.cache,
			},
			credentials: {
				enumerable: true,
				value: this._init.credentials,
			},
			headers: {
				enumerable: true,
				value: headers,
			},
			integrity: {
				enumerable: true,
				value: this._init.integrity,
			},
			method: {
				enumerable: true,
				value: this._init.method,
			},
			mode: {
				enumerable: true,
				value: this._init.mode,
			},
			redirect: {
				enumerable: true,
				value: this._init.redirect,
			},
			referrer: {
				enumerable: true,
				value: this._init.referrer,
			},
			referrerPolicy: {
				enumerable: true,
				value: this._init.referrerPolicy,
			},
			url: {
				enumerable: true,
				value: this._url,
			},
		} );
	}

	public clone( newUrl?: string ): Request
	{
		return new Request( this, { url: newUrl } );
	}
}
