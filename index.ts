'use strict'

import { Body, JsonBody, StreamBody, DataBody } from './lib/body'
import { RawHeaders, Headers } from './lib/headers'
import { Request } from './lib/request'
import { Response } from './lib/response'
import {
	AbortError,
	TimeoutError,
	FetchInit,
	OnTrailers,
	DecodeFunction,
	Decoder,
} from './lib/core'
import { Context, ContextOptions, PushHandler } from './lib/context'
import { CookieJar } from './lib/cookie-jar'


const defaultContext = new Context( );

const setup =
	( opts: ContextOptions ) =>
		defaultContext.setup( opts );
const fetch =
	( input: string | Request, init?: Partial< FetchInit > ) =>
		defaultContext.fetch( input, init );
const disconnect =
	( url: string ) =>
		defaultContext.disconnect( url );
const disconnectAll =
	( ) =>
		defaultContext.disconnectAll( );
const onPush =
	( handler: PushHandler ) =>
		defaultContext.onPush( handler );

function context( opts?: Partial< ContextOptions > )
{
	const ctx = new Context( opts );
	return {
		setup: ctx.setup.bind( ctx ) as typeof setup,
		fetch: ctx.fetch.bind( ctx ) as typeof fetch,
		disconnect: ctx.disconnect.bind( ctx ) as typeof disconnect,
		disconnectAll: ctx.disconnectAll.bind( ctx ) as typeof disconnectAll,
		onPush: ctx.onPush.bind( ctx ) as typeof onPush,
	};
}

export {
	setup,
	context,
	fetch,
	disconnect,
	disconnectAll,
	onPush,

	// Re-export
	Body,
	JsonBody,
	StreamBody,
	DataBody,
	Headers,
	Request,
	Response,
	AbortError,
	TimeoutError,
	OnTrailers,
	ContextOptions,
	DecodeFunction,
	Decoder,
	CookieJar,
}
