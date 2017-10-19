'use strict'

import {
	Method,
	BodyTypes,
	ModeTypes,
	CredentialsTypes,
	CacheTypes,
	RedirectTypes,
	SpecialReferrerTypes,
	ReferrerTypes,
	ReferrerPolicyTypes,
	RequestInit,
} from './core'

import { Headers, GuardedHeaders } from './headers'
import { Body, JsonBody } from './body'


const defaultInit: Partial< RequestInit > = {
	method: 'GET',
	mode: 'same-origin',
	credentials: 'omit',
	cache: 'default',
	redirect: 'manual',
	referrer: 'client',
};

export class Request extends Body
{
	private _url: string;
	private _init: Partial< RequestInit >;

	readonly method: Method;
	readonly url: string;
	readonly headers: Headers;
	readonly referrer: ReferrerTypes;
	readonly referrerPolicy: ReferrerPolicyTypes;
	readonly mode: ModeTypes;
	readonly credentials: CredentialsTypes;
	readonly redirect: RedirectTypes;
	readonly integrity: string;
	readonly cache: CacheTypes;

	constructor( input: string | Request, init?: Partial< RequestInit > )
	{
		super( );

		// TODO: Consider throwing a TypeError if the URL has credentials
		this._url =
			input instanceof Request
			? input._url
			: input;

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
			input = input._url;
			init = newInit;

			// TODO: Follow MDN:
			//       If this object exists on another origin to the
			//       constructor call, the Request.referrer is stripped out.
			//       If this object has a Request.mode of navigate, the mode
			//       value is converted to same-origin.
		}

		this._init = Object.assign( { }, defaultInit, init );

		const headers = new GuardedHeaders(
			this._init.mode === 'no-cors'
				? 'request-no-cors'
				: 'request',
			this._init.headers
		);

		if ( this._init.body )
		{
			if ( headers.has( 'content-type' ) )
				this.setBody( this._init.body, headers.get( 'content-type' ) );
			else
				this.setBody( this._init.body );
		}

		Object.defineProperties( this, {
			method: {
				enumerable: true,
				value: this._init.method,
			},
			url: {
				enumerable: true,
				value: this._url,
			},
			headers: {
				enumerable: true,
				value: headers,
			},
			referrer: {
				enumerable: true,
				value: this._init.referrer,
			},
			referrerPolicy: {
				enumerable: true,
				value: this._init.referrerPolicy,
			},
			mode: {
				enumerable: true,
				value: this._init.mode,
			},
			credentials: {
				enumerable: true,
				value: this._init.credentials,
			},
			redirect: {
				enumerable: true,
				value: this._init.redirect,
			},
			integrity: {
				enumerable: true,
				value: this._init.integrity,
			},
			cache: {
				enumerable: true,
				value: this._init.cache,
			},
		} );
	}

	clone( newUrl?: string ): Request
	{
		const ret = new Request( this );
		if ( newUrl )
			ret._url = newUrl;
		return ret;
	}
}
