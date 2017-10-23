'use strict'

import { Body, JsonBody, StreamBody, DataBody } from './lib/body'
import { RawHeaders, Headers } from './lib/headers'
import { Request } from './lib/request'
import { Response } from './lib/response'
import { AbortError, PushMessage, FetchInit } from './lib/core'
import { Context, ContextOptions } from './lib/context'


const defaultContext = new Context( );

const fetch =
	( input: string | Request, init?: Partial< FetchInit > ) =>
		defaultContext.fetch( input, init );
const disconnect =
	( url: string ) =>
		defaultContext.disconnect( url );
const disconnectAll =
	( ) =>
		defaultContext.disconnectAll( );

function context( opts?: ContextOptions )
{
	const ctx = new Context( opts );
	return {
		fetch: ctx.fetch.bind( ctx ) as typeof fetch,
		disconnect: ctx.disconnect.bind( ctx ) as typeof disconnect,
		disconnectAll: ctx.disconnectAll.bind( ctx ) as typeof disconnectAll,
	};
}

export {
	context,
	fetch,
	disconnect,
	disconnectAll,

	// Re-export
	Body,
	JsonBody,
	StreamBody,
	DataBody,
	Headers,
	Request,
	Response,
	AbortError,
	PushMessage,
}
