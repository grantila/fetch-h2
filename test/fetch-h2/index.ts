import { defer, delay } from "already";
import { expect } from "chai";
import { createHash } from "crypto";
import * as from2 from "from2";
import { buffer as getStreamAsBuffer } from "get-stream";
import "mocha";
import * as through2 from "through2";

import { TestData } from "../lib/server-common";
import { makeMakeServer } from "../lib/server-helpers";
import { cleanUrl, createIntegrity } from "../lib/utils";

import {
	context,
	DataBody,
	disconnectAll as _disconnectAll,
	fetch as _fetch,
	Headers,
	onPush as _onPush,
	Response,
	StreamBody,
} from "../../";


async function getRejection< T >( promise: Promise< T > ): Promise< Error >
{
	try
	{
		await promise;
	}
	catch ( err )
	{
		return err;
	}
	throw new Error( "Expected exception" );
}

function ensureStatusSuccess( response: Response ): Response
{
	if ( response.status < 200 || response.status >= 300 )
		throw new Error( "Status not 2xx" );
	return response;
}


( [
	{ proto: "http:", version: "http1" },
	{ proto: "http:", version: "http2" },
	{ proto: "https:", version: "http1" },
	{ proto: "https:", version: "http2" },
] as Array< TestData > )
.forEach( ( { proto, version } ) =>
{
const { cycleOpts, makeServer } = makeMakeServer( { proto, version } );

const { disconnectAll, fetch, onPush } =
	( proto === "httpss:" && version === "http1" )
	? { disconnectAll: _disconnectAll, fetch: _fetch, onPush: _onPush }
	: context( { ...cycleOpts } );

describe( "basic", ( ) =>
{
afterEach( disconnectAll );

describe( `(${version} over ${proto.replace( ":", "" )})`, ( ) =>
{
	it( "should be able to perform simple GET", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const headers =
			version === "http1" ? { "http1-path": "/headers" } : { };

		const response = ensureStatusSuccess(
			await fetch( `${proto}//localhost:${port}/headers`, { headers } )
		);

		const res = await response.json( );
		if ( version === "http1" )
			expect( res[ "http1-path" ] ).to.equal( "/headers" );
		else
			expect( res[ ":path" ] ).to.equal( "/headers" );

		await server.shutdown( );
	} );

	it( "should be able to set upper-case headers", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const headers = {
			"Content-Length": "6",
			"Content-Type": "text/foo+text",
		};

		const response = ensureStatusSuccess(
			await fetch(
				`${proto}//localhost:${port}/headers`,
				{
					body: new DataBody( "foobar" ),
					headers,
					method: "POST",
				}
			)
		);

		const res = await response.json( );

		for ( const [ key, val ] of Object.entries( headers ) )
			expect( res[ key.toLowerCase( ) ] ).to.equal( val );

		await server.shutdown( );
	} );

	it( "should be able to get upper-case headers", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const json = { foo: "bar" };

		const response = await fetch(
			`${proto}//localhost:${port}/echo`,
			{
				json,
				method: "POST",
			}
		);

		const data = await response.json( );
		const { headers } = response;

		expect( headers.get( "Content-Type" ) ).to.equal( "application/json" );
		expect( data ).to.deep.equal( json );

		await server.shutdown( );
	} );

	it( "should be able to set numeric headers", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const headers = {
			"content-length": < string >< any >6,
			"content-type": "text/foo+text",
		};

		const response = ensureStatusSuccess(
			await fetch(
				`${proto}//localhost:${port}/headers`,
				{
					body: new DataBody( "foobar" ),
					headers,
					method: "POST",
				}
			)
		);

		const res = await response.json( );

		for ( const [ key, val ] of Object.entries( headers ) )
			expect( res[ key ] ).to.equal( `${val}` );

		await server.shutdown( );
	} );

	it( "should be able to POST stream-data with known length", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const stream = through2( );

		stream.write( "foo" );

		const eventualResponse = fetch(
			`${proto}//localhost:${port}/echo`,
			{
				body: new StreamBody( stream ),
				headers: { "content-length": "6" },
				method: "POST",
			}
		);

		await delay( 1 );

		stream.write( "bar" );
		stream.end( );

		const response = ensureStatusSuccess( await eventualResponse );

		const data = await response.text( );
		expect( data ).to.equal( "foobar" );

		await server.shutdown( );
	} );

	it( "should be able to POST stream-data with unknown length", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const stream = through2( );

		stream.write( "foo" );

		const eventualResponse = fetch(
			`${proto}//localhost:${port}/echo`,
			{
				body: new StreamBody( stream ),
				method: "POST",
			}
		);

		await delay( 1 );

		stream.write( "bar" );
		stream.end( );

		const response = ensureStatusSuccess( await eventualResponse );

		const data = await response.text( );
		expect( data ).to.equal( "foobar" );

		await server.shutdown( );
	} );

	it( "should not be able to send both json and body", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const eventualResponse = fetch(
			`${proto}//localhost:${port}/echo`,
			{
				body: "foo",
				json: { foo: "" },
				method: "POST",
			}
		);

		const err = await getRejection( eventualResponse );

		expect( err.message ).to.contain( "Cannot specify both" );

		await server.shutdown( );
	} );

	it( "should be able to send json", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const json = { foo: "bar" };

		const response = await fetch(
			`${proto}//localhost:${port}/echo`,
			{
				json,
				method: "POST",
			}
		);

		const data = await response.json( );
		const { headers } = response;

		expect( headers.get( "content-type" ) ).to.equal( "application/json" );
		expect( data ).to.deep.equal( json );

		await server.shutdown( );
	} );

	it( "should be able to send body as string", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const body = "foobar";

		const response = await fetch(
			`${proto}//localhost:${port}/echo`,
			{
				body,
				method: "POST",
			}
		);

		const data = await response.text( );

		expect( data ).to.deep.equal( body );

		await server.shutdown( );
	} );

	it( "should be able to send body as buffer", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const body = Buffer.from( "foobar" );

		const response = await fetch(
			`${proto}//localhost:${port}/echo`,
			{
				body,
				method: "POST",
			}
		);

		const data = await response.arrayBuffer( );

		expect( Buffer.compare( Buffer.from( data ), body ) ).to.equal( 0 );

		await server.shutdown( );
	} );

	it( "should be able to send body as readable stream", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const stream = through2( );

		stream.write( "foo" );
		stream.write( "bar" );
		stream.end( );

		const response = await fetch(
			`${proto}//localhost:${port}/echo`,
			{
				body: stream,
				method: "POST",
			}
		);

		const data = await response.text( );

		expect( data ).to.equal( "foobar" );

		await server.shutdown( );
	} );

	it( "should trigger onTrailers", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const trailers: any = { foo: "bar" };

		const deferredTrailers = defer< Headers >( );
		const onTrailers = deferredTrailers.resolve;

		const response = await fetch(
			`${proto}//localhost:${port}/trailers`,
			{
				json: trailers,
				method: "POST",
				onTrailers,
			}
		);

		const data = await response.text( );
		const receivedTrailers = await deferredTrailers.promise;

		expect( data ).to.contain( "trailers will be sent" );

		Object.keys( trailers )
		.forEach( key =>
		{
			expect( receivedTrailers.get( key ) ).to.equal( trailers[ key ] );
		} );

		await server.shutdown( );
	} );

	it( "should timeout on a slow request", async function( )
	{
		this.timeout( 500 );

		const { server, port } = await makeServer( );

		const eventualResponse = fetch(
			`${proto}//localhost:${port}/wait/20`,
			{
				method: "POST",
				timeout: 8,
			}
		);

		const err = await getRejection( eventualResponse );

		expect( err.message ).to.contain( "timed out" );

		await server.shutdown( );
	} );

	it( "should not timeout on a fast request", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const response = await fetch(
			`${proto}//localhost:${port}/wait/1`,
			{
				method: "POST",
				timeout: 100,
			}
		);

		expect( response.status ).to.equal( 200 );

		await server.shutdown( );
	} );

	it( "should be able to POST large (16MiB) stream with known length",
		async function( )
	{
		this.timeout( 2000 );

		const { server, port } = await makeServer( );

		const chunkSize = 1024 * 1024;
		const chunks = 16;
		const chunk = Buffer.allocUnsafe( chunkSize );

		const hash = createHash( "sha256" );
		let referenceHash;

		let chunkNum = 0;
		const stream = from2( ( _size, next ) =>
		{
			if ( chunkNum++ === chunks )
			{
				next( null, null );
				referenceHash = hash.digest( "hex" );
				return;
			}

			hash.update( chunk );
			next( null, chunk );
		} );

		const eventualResponse = fetch(
			`${proto}//localhost:${port}/sha256`,
			{
				body: new StreamBody( stream ),
				headers: { "content-length": "" + chunkSize * chunks },
				method: "POST",
			}
		);

		await delay( 1 );

		const response = ensureStatusSuccess( await eventualResponse );

		const data = await response.text( );
		expect( data ).to.equal( referenceHash );

		await server.shutdown( );
	} );

	it( "should be able to POST large (16MiB) stream with unknown length",
		async function( )
	{
		this.timeout( 2000 );

		const { server, port } = await makeServer( );

		const chunkSize = 1024 * 1024;
		const chunks = 16;
		const chunk = Buffer.allocUnsafe( chunkSize );

		const hash = createHash( "sha256" );
		let referenceHash;

		let chunkNum = 0;
		const stream = from2( ( _size, next ) =>
		{
			if ( chunkNum++ === chunks )
			{
				next( null, null );
				referenceHash = hash.digest( "hex" );
				return;
			}

			hash.update( chunk );
			next( null, chunk );
		} );

		const eventualResponse = fetch(
			`${proto}//localhost:${port}/sha256`,
			{
				body: new StreamBody( stream ),
				method: "POST",
			}
		);

		await delay( 1 );

		const response = ensureStatusSuccess( await eventualResponse );

		const data = await response.text( );
		expect( data ).to.equal( referenceHash );

		await server.shutdown( );
	} );

	if ( version === "http2" )
	it( "should be able to receive pushed request", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const onPushPromise = new Promise< Response >( ( resolve, reject ) =>
		{
			onPush( ( _origin, _request, getResponse ) =>
			{
				getResponse( ).then( resolve, reject );
			} );
		} );

		const data = { foo: "bar" };

		const response = ensureStatusSuccess(
			await fetch(
				`${proto}//localhost:${port}/push`,
				{
					json: [
						{
							data: JSON.stringify( data ),
							headers: { "content-type": "application/json" },
						},
					],
					method: "POST",
				}
			)
		);

		const responseText = await response.text( );

		expect( responseText ).to.equal( "push-route" );

		const pushedResponse = await onPushPromise;
		const pushedData = await pushedResponse.json( );

		expect( pushedData ).to.deep.equal( data );

		onPush( );

		await server.shutdown( );
	} );

	it( "should convert 'host' to ':authority'", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const host = "localhost";

		const response = ensureStatusSuccess(
			await fetch(
				`${proto}//localhost:${port}/headers`,
				{
					headers: { host },
				}
			)
		);

		const responseData = await response.json( );

		if ( version === "http2" )
			expect( responseData[ ":authority" ] ).to.equal( host );
		else
			expect( responseData.host ).to.equal( host );

		await server.shutdown( );
	} );

	it( "should send accept-encoding", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const response = ensureStatusSuccess(
			await fetch( `${proto}//localhost:${port}/headers` )
		);

		const responseData = await response.json( );

		expect( responseData[ "accept-encoding" ] ).to.contain( "gzip" );

		await server.shutdown( );
	} );

	it( "should accept content-encoding (gzip)", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const testData = { foo: "bar" };

		const response = ensureStatusSuccess(
			await fetch(
				`${proto}//localhost:${port}/compressed/gzip`,
				{
					json: testData,
					method: "POST",
				}
			)
		);

		const stream = await response.readable( );

		const data = await getStreamAsBuffer( stream );

		expect( JSON.parse( data.toString( ) ) ).to.deep.equal( testData );

		await server.shutdown( );
	} );

	it( "should accept content-encoding (deflate)", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const testData = { foo: "bar" };

		const response = ensureStatusSuccess(
			await fetch(
				`${proto}//localhost:${port}/compressed/deflate`,
				{
					json: testData,
					method: "POST",
				}
			)
		);

		const stream = await response.readable( );

		const data = await getStreamAsBuffer( stream );

		expect( JSON.parse( data.toString( ) ) ).to.deep.equal( testData );

		await server.shutdown( );
	} );
} );

describe( `response (${proto})`, ( ) =>
{
	it( "should have a proper url", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url = `${proto}//localhost:${port}/headers`;

		const response = ensureStatusSuccess( await fetch( url ) );

		expect( response.url ).to.equal( cleanUrl( url ) );

		await disconnectAll( );
		await server.shutdown( );
	} );
} );

if ( version === "http2" )
describe( `goaway (${proto})`, ( ) =>
{
	if ( proto === "http:" ) // This race is too fast for TLS
	it( "handle session failover (race conditioned)", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url1 = `${proto}//localhost:${port}/goaway`;
		const url2 = `${proto}//localhost:${port}/headers`;

		const response1 = ensureStatusSuccess( await fetch( url1 ) );
		expect( response1.url ).to.equal( cleanUrl( url1 ) );

		const response2 = ensureStatusSuccess( await fetch( url2 ) );
		expect( response2.url ).to.equal( cleanUrl( url2 ) );

		await response1.text( );
		await response2.text( );

		await disconnectAll( );
		await server.shutdown( );
	} );

	it( "handle session failover (calm)", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url1 = `${proto}//localhost:${port}/goaway`;
		const url2 = `${proto}//localhost:${port}/headers`;

		const response1 = ensureStatusSuccess( await fetch( url1 ) );
		expect( response1.url ).to.equal( cleanUrl( url1 ) );

		await delay(20);

		const response2 = ensureStatusSuccess( await fetch( url2 ) );
		expect( response2.url ).to.equal( cleanUrl( url2 ) );

		await response1.text( );
		await response2.text( );

		await disconnectAll( );
		await server.shutdown( );
	} );

	it( "user-disconnect closes all sessions", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url1 = `${proto}//localhost:${port}/goaway/50`;
		const url2 = `${proto}//localhost:${port}/slow/50`;

		const response1 = ensureStatusSuccess( await fetch( url1 ) );
		expect( response1.url ).to.equal( cleanUrl( url1 ) );

		await delay( 10 );

		const response2 = ensureStatusSuccess( await fetch( url2 ) );
		expect( response2.url ).to.equal( cleanUrl( url2 ) );

		await delay( 10 );

		await disconnectAll( );

		const text1 = await response1.text( true );
		const text2 = await response2.text( true );
		expect( text1 ).to.equal( "abcde" );
		expect( text2 ).to.equal( "abcde" );

		await server.shutdown( );
	} );
} );

describe( `integrity (${proto})`, ( ) =>
{
	it( "handle and succeed on valid integrity", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url = `${proto}//localhost:${port}/slow/0`;

		const data = "abcdefghij";
		const integrity = createIntegrity( data );

		const response = ensureStatusSuccess( await fetch( url, { integrity } ) );
		expect( response.url ).to.equal( cleanUrl( url ) );

		expect( await response.text( ) ).to.equal( data );

		await disconnectAll( );
		await server.shutdown( );
	} );

	it( "handle and fail on invalid integrity", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url = `${proto}//localhost:${port}/slow/0`;

		const data = "abcdefghij-x";
		const integrity = createIntegrity( data );

		const response = ensureStatusSuccess( await fetch( url, { integrity } ) );
		expect( response.url ).to.equal( cleanUrl( url ) );

		try
		{
			await response.text( );
			expect( false ).to.equal( true );
		}
		catch ( err )
		{
			expect( err.message ).to.contain( "integrity" );
		}

		await disconnectAll( );
		await server.shutdown( );
	} );
} );

describe( `premature stream close (${proto})`, ( ) =>
{
	it( "handle and reject fetch operation", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url = `${proto}//localhost:${port}/prem-close`;

		try
		{
			await fetch( url );
			expect( false ).to.equal( true );
		}
		catch ( err )
		{
			const expected =
				version === "http1"
				? "socket hang up"
				: "Stream prematurely closed";
			expect( err.message ).to.contain( expected );
		}

		await disconnectAll( );
		await server.shutdown( );
	} );
} );
} );
} );
