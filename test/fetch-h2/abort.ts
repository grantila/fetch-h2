import {
	AbortController,
	AbortError,
	fetch,
} from "../../index";

import { Server } from "../lib/server-common";
import { makeServer as makeServerHttp1 } from "../lib/server-http1";
import { makeServer as makeServerHttp2 } from "../lib/server-http2";
import { ensureStatusSuccess } from "../lib/utils";

type Protocols = "http1" | "http2";
const protos: Array< Protocols > = [ "http1", "http2" ];

async function makeServer( proto: Protocols )
: Promise< { server: Server; port: number | null; } >
{
	if ( proto === "http1" )
		return makeServerHttp1( );
	else if ( proto === "http2" )
		return makeServerHttp2( );
	return < any >void 0;
}

const testProtos = protos.map( proto => ( {
	makeServer: ( ) => makeServer( proto ),
	proto: proto === "http1" ? "http" : "http2",
	version: proto,
} ) );

describe( "abort", ( ) =>
{
	describe( "AbortController", ( ) =>
	{
		it( "should create proper signal and trigger abort once", async ( ) =>
		{
			const controller = new AbortController( );

			const signal = controller.signal;

			const spy = jest.fn( );

			signal.on( "abort", spy );

			expect( signal.aborted ).toBe( false );
			controller.abort( );
			expect( signal.aborted ).toBe( true );
			controller.abort( );
			expect( signal.aborted ).toBe( true );

			expect( spy.mock.calls.length ).toBe( 1 );
		} );

		it( "should be destructable", async ( ) =>
		{
			const { signal, abort } = new AbortController( );

			const spy = jest.fn( );

			signal.on( "abort", spy );

			expect( signal.aborted ).toBe( false );
			abort( );
			expect( signal.aborted ).toBe( true );
			abort( );
			expect( signal.aborted ).toBe( true );

			expect( spy.mock.calls.length ).toBe( 1 );
		} );

		it( "signal.onaborted should trigger once", async ( ) =>
		{
			const { signal, abort } = new AbortController( );

			const spy = jest.fn( );

			signal.onabort = spy;

			expect( signal.aborted ).toBe( false );
			abort( );
			expect( signal.aborted ).toBe( true );
			abort( );
			expect( signal.aborted ).toBe( true );

			expect( spy.mock.calls.length ).toBe( 1 );
		} );
	} );

	testProtos.forEach( ( { proto, makeServer, version } ) =>
	describe( `fetch (${version})`, ( ) =>
	{
		it( "should handle pre-aborted", async ( ) =>
		{
			const { signal, abort } = new AbortController( );

			const { server, port } = await makeServer( );

			abort( );

			const awaitFetch =
				fetch( `${proto}://localhost:${port}/delay/100`, { signal } );

			await expect( awaitFetch ).rejects.toThrowError( AbortError );

			await server.shutdown( );
		} );

		it( "should handle abort on request", async ( ) =>
		{
			const { signal, abort } = new AbortController( );

			const { server, port } = await makeServer( );

			setTimeout( abort, 20 );

			const awaitFetch =
				fetch( `${proto}://localhost:${port}/delay/100`, { signal } );

			await expect( awaitFetch ).rejects.toThrowError( AbortError );

			await server.shutdown( );
		} );

		it( "should handle abort on body", async ( ) =>
		{
			const { signal, abort } = new AbortController( );

			const { server, port } = await makeServer( );

			setTimeout( abort, 50 );

			const response = ensureStatusSuccess(
				await fetch( `${proto}://localhost:${port}/slow/100`, { signal } )
			);

			const awaitBody = response.arrayBuffer( );

			await expect( awaitBody ).rejects.toThrowError( AbortError );

			await server.shutdown( );
		} );
	} ) );
} );
