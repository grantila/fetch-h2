'use strict'

import { Body, JsonBody } from './lib/body'
import { RawHeaders, Headers } from './lib/headers'
import { Request } from './lib/request'
import { Response } from './lib/response'
import { AbortError, PushMessage } from './lib/core'
import { Context, ContextOptions } from './lib/context'


const defaultContext = new Context( );

const fetch = defaultContext.fetch.bind( defaultContext );
const disconnect = defaultContext.disconnect.bind( defaultContext );
const disconnectAll = defaultContext.disconnectAll.bind( defaultContext );
function context( opts?: ContextOptions )
{
	return new Context( opts );
}

export {
	context,
	fetch,
	disconnect,
	disconnectAll,

	// Re-export
	Body,
	JsonBody,
	Headers,
	Request,
	Response,
	AbortError,
	PushMessage,
}
