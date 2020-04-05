import { defer, delay } from "already";
import { createHash } from "crypto";
import * as from2 from "from2";
import getStream from "get-stream";
import * as through2 from "through2";

import { TestData } from "../lib/server-common";
import { makeMakeServer } from "../lib/server-helpers";
import { cleanUrl, createIntegrity, ensureStatusSuccess } from "../lib/utils";

import { hasBuiltinBrotli } from "../../lib/utils";

import {
	context,
	DataBody,
	disconnectAll as _disconnectAll,
	fetch as _fetch,
	Headers,
	onPush as _onPush,
	Response,
	StreamBody,
} from "../../index";


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
	( proto === "http:" && version === "http1" )
	? { disconnectAll: _disconnectAll, fetch: _fetch, onPush: _onPush }
	: context( { ...cycleOpts } );

const protoVersion = `${version} over ${proto.replace( ":", "" )}`;

describe( "basic", ( ) =>
{
afterEach( disconnectAll );

describe( `generic (${protoVersion})`, ( ) =>
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
			expect( res[ "http1-path" ] ).toBe( "/headers" );
		else
			expect( res[ ":path" ] ).toBe( "/headers" );

		const versionNumber =
			parseInt( version.substr( version.length - 1 ), 10 );
		expect( response.httpVersion ).toBe( versionNumber );

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
					allowForbiddenHeaders: true,
					body: new DataBody( "foobar" ),
					headers,
					method: "POST",
				}
			)
		);

		const res = await response.json( );

		for ( const [ key, val ] of Object.entries( headers ) )
			expect( res[ key.toLowerCase( ) ] ).toBe( val );

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

		expect( headers.get( "Content-Type" ) ).toBe( "application/json" );
		expect( data ).toEqual( json );

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
					allowForbiddenHeaders: true,
					body: new DataBody( "foobar" ),
					headers,
					method: "POST",
				}
			)
		);

		const res = await response.json( );

		for ( const [ key, val ] of Object.entries( headers ) )
			expect( res[ key ] ).toBe( `${val}` );

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
				allowForbiddenHeaders: true,
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
		expect( data ).toBe( "foobar" );

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
		expect( data ).toBe( "foobar" );

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

		expect( err.message ).toContain( "Cannot specify both" );

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

		expect( headers.get( "content-type" ) ).toBe( "application/json" );
		expect( data ).toEqual( json );

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

		expect( data ).toEqual( body );

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

		expect( Buffer.compare( Buffer.from( data ), body ) ).toBe( 0 );

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

		expect( data ).toBe( "foobar" );

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

		expect( data ).toContain( "trailers will be sent" );

		Object.keys( trailers )
		.forEach( key =>
		{
			expect( receivedTrailers.get( key ) ).toBe( trailers[ key ] );
		} );

		await server.shutdown( );
	} );

	it( "should timeout on a slow request", async ( ) =>
	{
		jest.setTimeout( 1000 );

		const { server, port } = await makeServer( );

		const eventualResponse = fetch(
			`${proto}//localhost:${port}/wait/20`,
			{
				method: "POST",
				timeout: 8,
			}
		);

		const err = await getRejection( eventualResponse );

		expect( err.message ).toContain( "timed out" );

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

		expect( response.status ).toBe( 200 );

		await server.shutdown( );
	} );

	it( "should timeout on a slow TLS connect", async ( ) =>
	{
		if (proto === "https:")
		{
			jest.setTimeout( 1000 );

			const { fetch } = context({ session: { timeout: 50 } } );
			const eventualResponse = fetch(`${proto}//example.com:81/`);

			const err = await getRejection( eventualResponse );

			expect( err.message ).toContain( "timed out" );
			}
	} );

	it( "should be able to POST large (16MiB) stream with known length",
		async ( ) =>
	{
		jest.setTimeout( 2000 );

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
				allowForbiddenHeaders: true,
				body: new StreamBody( stream ),
				headers: { "content-length": "" + chunkSize * chunks },
				method: "POST",
			}
		);

		await delay( 1 );

		const response = ensureStatusSuccess( await eventualResponse );

		const data = await response.text( );
		expect( data ).toBe( referenceHash );

		await server.shutdown( );
	} );

	it( "should be able to POST large (16MiB) stream with unknown length",
		async ( ) =>
	{
		jest.setTimeout( 2000 );

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
		expect( data ).toBe( referenceHash );

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

		expect( responseText ).toBe( "push-route" );

		const pushedResponse = await onPushPromise;
		const pushedData = await pushedResponse.json( );

		expect( pushedData ).toEqual( data );

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
					allowForbiddenHeaders: true,
					headers: { host },
				}
			)
		);

		const responseData = await response.json( );

		if ( version === "http2" )
			expect( responseData[ ":authority" ] ).toBe( host );
		else
			expect( responseData.host ).toBe( host );

		await server.shutdown( );
	} );

	it( "should send accept-encoding", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const response = ensureStatusSuccess(
			await fetch( `${proto}//localhost:${port}/headers` )
		);

		const responseData = await response.json( );

		expect( responseData[ "accept-encoding" ] ).toContain( "gzip" );

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

		expect( response.headers.get( "content-encoding" ) ).toBe( "gzip" );

		const stream = await response.readable( );

		const data = await getStream.buffer( stream );

		expect( JSON.parse( data.toString( ) ) ).toEqual( testData );

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

		expect( response.headers.get( "content-encoding" ) ).toBe( "deflate" );

		const stream = await response.readable( );

		const data = await getStream.buffer( stream );

		expect( JSON.parse( data.toString( ) ) ).toEqual( testData );

		await server.shutdown( );
	} );

	it( "should accept content-encoding (br)", async ( ) =>
	{
		if ( !hasBuiltinBrotli( ) )
			return;

		const { server, port } = await makeServer( );

		const testData = { foo: "bar" };

		const response = ensureStatusSuccess(
			await fetch(
				`${proto}//localhost:${port}/compressed/br`,
				{
					json: testData,
					method: "POST",
				}
			)
		);

		expect( response.headers.get( "content-encoding" ) ).toBe( "br" );

		const stream = await response.readable( );

		const data = await getStream.buffer( stream );

		expect( JSON.parse( data.toString( ) ) ).toEqual( testData );

		await server.shutdown( );
	} );
} );

describe( `response (${protoVersion})`, ( ) =>
{
	it( "should have a proper url", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url = `${proto}//localhost:${port}/headers`;

		const response = ensureStatusSuccess( await fetch( url ) );

		expect( response.url ).toBe( cleanUrl( url ) );

		await disconnectAll( );
		await server.shutdown( );
	} );
} );

if ( version === "http2" )
describe( `goaway (${protoVersion})`, ( ) =>
{
	if ( proto === "http:" ) // This race is too fast for TLS
	it( "handle session failover (race conditioned)", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url1 = `${proto}//localhost:${port}/goaway`;
		const url2 = `${proto}//localhost:${port}/headers`;

		const response1 = ensureStatusSuccess( await fetch( url1 ) );
		expect( response1.url ).toBe( cleanUrl( url1 ) );

		const response2 = ensureStatusSuccess( await fetch( url2 ) );
		expect( response2.url ).toBe( cleanUrl( url2 ) );

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
		expect( response1.url ).toBe( cleanUrl( url1 ) );

		await delay( 20 );

		const response2 = ensureStatusSuccess( await fetch( url2 ) );
		expect( response2.url ).toBe( cleanUrl( url2 ) );

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
		expect( response1.url ).toBe( cleanUrl( url1 ) );

		await delay( 10 );

		const response2 = ensureStatusSuccess( await fetch( url2 ) );
		expect( response2.url ).toBe( cleanUrl( url2 ) );

		await delay( 10 );

		await disconnectAll( );

		const text1 = await response1.text( true );
		const text2 = await response2.text( true );
		expect( text1 ).toBe( "abcde" );
		expect( text2 ).toBe( "abcde" );

		await server.shutdown( );
	} );
} );

describe( `integrity (${protoVersion})`, ( ) =>
{
	it( "handle and succeed on valid integrity", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url = `${proto}//localhost:${port}/slow/0`;

		const data = "abcdefghij";
		const integrity = createIntegrity( data );

		const response = ensureStatusSuccess( await fetch( url, { integrity } ) );
		expect( response.url ).toBe( cleanUrl( url ) );

		expect( await response.text( ) ).toBe( data );

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
		expect( response.url ).toBe( cleanUrl( url ) );

		try
		{
			await response.text( );
			expect( false ).toBe( true );
		}
		catch ( err )
		{
			expect( err.message ).toContain( "integrity" );
		}

		await disconnectAll( );
		await server.shutdown( );
	} );
} );

describe( `premature stream close (${protoVersion})`, ( ) =>
{
	it( "handle and reject fetch operation", async ( ) =>
	{
		const { server, port } = await makeServer( );

		const url = `${proto}//localhost:${port}/prem-close`;

		try
		{
			await fetch( url );
			expect( false ).toBe( true );
		}
		catch ( err )
		{
			const expected =
				version === "http1"
				? "socket hang up"
				: "Stream prematurely closed";
			expect( err.message ).toContain( expected );
		}

		await disconnectAll( );
		await server.shutdown( );
	} );
} );
} );
} );
