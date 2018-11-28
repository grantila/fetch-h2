'use strict'

import {
	constants as h2constants,
	ClientHttp2Stream,
	IncomingHttpHeaders,
} from 'http2'

import {
	createGunzip,
	createInflate,
} from 'zlib'

const {
	HTTP2_HEADER_LOCATION,
	HTTP2_HEADER_STATUS,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_CONTENT_ENCODING,
	HTTP2_HEADER_CONTENT_LENGTH,
} = h2constants;


import {
	BodyTypes,
	ResponseInit,
	ResponseTypes,
	Decoder,
	DecodeFunction,
} from './core'

import {
	Headers,
	GuardedHeaders,
	ensureHeaders,
} from './headers'

import {
	Body,
} from './body'

interface Extra
{
	redirected: boolean;
	type: ResponseTypes;
	url: string;
}

export class Response extends Body
{
	readonly headers: Headers;
	readonly ok: boolean;
	readonly redirected: boolean;
	readonly status: number;
	readonly statusText: string;
	readonly type: ResponseTypes;
	readonly url: string;
	readonly useFinalURL: boolean;

	constructor(
		body?: BodyTypes | Body,
		init?: Partial< ResponseInit >,
		extra?
	)
	{
		super( );

		const headers = ensureHeaders( init.headers );

		if ( body )
		{
			const contentType = headers.get( HTTP2_HEADER_CONTENT_TYPE );
			const contentLength = headers.get( HTTP2_HEADER_CONTENT_LENGTH );

			const length =
				contentLength == null
				? null
				: parseInt( contentLength );

			if ( contentType )
				this.setBody( body, contentType, null, length );
			else
				this.setBody( body, null, null, length );
		}

		const _extra = < Extra >( extra || { } );

		const type = _extra.type || 'basic';
		const redirected = !!_extra.redirected || false;
		const url = _extra.url || '';

		Object.defineProperties( this, {
			headers: {
				enumerable: true,
				value: headers,
			},
			ok: {
				enumerable: true,
				get: ( ) => this.status >= 200 && this.status < 300,
			},
			redirected: {
				enumerable: true,
				value: redirected,
			},
			status: {
				enumerable: true,
				value: init.status,
			},
			statusText: {
				enumerable: true,
				value: init.statusText,
			},
			type: {
				enumerable: true,
				value: type,
			},
			url: {
				enumerable: true,
				value: url,
			},
			useFinalURL: {
				enumerable: true,
				value: undefined,
			},
		} );
	}

	// Creates a clone of a Response object.
	clone( ): Response
	{
		const { headers, status, statusText } = this;
		return new Response( this, { headers, status, statusText } );
	}

	// Returns a new Response object associated with a network error.
	static error( ): Response
	{
		const headers = new GuardedHeaders( 'immutable' );
		const status = 521;
		const statusText = "Web Server Is Down";
		return new Response(
			null, { headers, status, statusText }, { type: 'error' } );
	}

	// Creates a new response with a different URL.
	static redirect( url: string, status?: number )
	{
		status = status || 302;

		const headers = {
			[ HTTP2_HEADER_LOCATION ]: url,
		};

		return new Response( null, { headers, status } )
	}

}

function makeHeadersFromH2Headers( headers: IncomingHttpHeaders ): Headers
{
	const out = new GuardedHeaders( 'response' );

	for ( let key of Object.keys( headers ) )
	{
		if ( key.startsWith( ':' ) )
			// We ignore pseudo-headers
			continue;

		const value = headers[ key ];
		if ( Array.isArray( value ) )
			value.forEach( val => out.append( key, val ) );
		else
			out.set( key, value );
	}

	return out;
}

function makeInit( inHeaders: IncomingHttpHeaders ): Partial< ResponseInit >
{
	const status = parseInt( '' + inHeaders[ HTTP2_HEADER_STATUS ] );
	const statusText = ''; // Not supported in H2
	const headers = makeHeadersFromH2Headers( inHeaders );

	return { status, statusText, headers };
}

function makeExtra(
	url: string,
	headers: IncomingHttpHeaders,
	redirected: boolean
)
: Extra
{
	const type = 'basic'; // TODO: Implement CORS

	return { redirected, type, url };
}

function handleEncoding(
	contentDecoders: ReadonlyArray< Decoder >,
	stream: NodeJS.ReadableStream,
	headers: IncomingHttpHeaders
)
: NodeJS.ReadableStream
{
	const contentEncoding = headers[ HTTP2_HEADER_CONTENT_ENCODING ] as string;

	if ( !contentEncoding )
		return stream;

	const decoders: { [ name: string ]: DecodeFunction; } = {
		gzip: ( stream: NodeJS.ReadableStream ) =>
			stream.pipe( createGunzip( ) ),
		deflate: ( stream: NodeJS.ReadableStream ) =>
			stream.pipe( createInflate( ) ),
	};

	contentDecoders.forEach( decoder =>
	{
		decoders[ decoder.name ] = decoder.decode;
	} );

	const decoder = decoders[ contentEncoding ];

	if ( !decoder )
		// We haven't asked for this encoding, and we can't handle it.
		// Pushing raw encoded stream through...
		return stream;

	return decoder( stream );
}

export class H2StreamResponse extends Response
{
	constructor(
		contentDecoders: ReadonlyArray< Decoder >,
		url: string,
		stream: ClientHttp2Stream,
		headers: IncomingHttpHeaders,
		redirected: boolean
	)
	{
		super(
			handleEncoding(
				contentDecoders,
				< NodeJS.ReadableStream >stream,
				headers
			),
			makeInit( headers ),
			makeExtra( url, headers, redirected )
		);
	}
}
