import { createHash } from "crypto";
import getStream from "get-stream";
import * as through2 from "through2";

import { createIntegrity } from "../lib/utils";

import {
	Body,
	DataBody,
	JsonBody,
	StreamBody,
} from "../../index";


async function makeSync< T >( fn: ( ) => PromiseLike< T > )
: Promise< ( ) => T >
{
	try
	{
		const val = await fn( );
		return ( ) => val;
	}
	catch ( err )
	{
		return ( ) => { throw err; };
	}
}

function setHash( body: any, data: string, hashType = "sha256" )
{
	body._integrity = createIntegrity( data, hashType );
}

class IntegrityBody extends Body
{
	constructor(
		data: string | Buffer | NodeJS.ReadableStream | null,
		hashData: string,
		integrityHashType = "sha256"
	)
	{
		super( );

		const hash = createHash( "sha256" );
		hash.update( hashData );
		const v = integrityHashType + "-" + hash.digest( "base64" );

		this.setBody( data, null, v );
	}
}

describe( "body", ( ) =>
{
	describe( "multiple reads", ( ) =>
	{
		it( "throw on multiple reads", async ( ) =>
		{
			const body = new DataBody( "foo" );
			expect( body.bodyUsed ).toBe( false );
			expect( await body.text( ) ).toBe( "foo" );
			expect( body.bodyUsed ).toBe( true );
			expect( await makeSync( ( ) => body.text( ) ) )
				.toThrow( ReferenceError );
		} );
	} );

	describe( "unimplemented", ( ) =>
	{
		it( "throw on unimplemented blob()", async ( ) =>
		{
			const body = new DataBody( "foo" );
			expect( await makeSync( ( ) => ( < any >body ).blob( ) ) )
				.toThrow( );
		} );

		it( "throw on unimplemented formData()", async ( ) =>
		{
			const body = new DataBody( "foo" );
			expect( await makeSync( ( ) => body.formData( ) ) ).toThrow( );
		} );
	} );

	describe( "invalid data", ( ) =>
	{
		it( "handle invalid body type when reading as arrayBuffer",
			async ( ) =>
		{
			const body = new DataBody( < string >< any >1 );
			expect( await makeSync( ( ) => body.arrayBuffer( ) ) )
				.toThrow( "Unknown body data" );
		} );

		it( "handle invalid body type when reading as json", async ( ) =>
		{
			const body = new DataBody( < string >< any >1 );
			expect( await makeSync( ( ) => body.json( ) ) )
				.toThrow( "Unknown body data" );
		} );

		it( "handle invalid body type when reading as text", async ( ) =>
		{
			const body = new DataBody( < string >< any >1 );
			expect( await makeSync( ( ) => body.text( ) ) )
				.toThrow( "Unknown body data" );
		} );

		it( "handle invalid body type when reading as readable", async ( ) =>
		{
			const body = new DataBody( < string >< any >1 );
			expect( await makeSync( ( ) => body.readable( ) ) )
				.toThrow( "Unknown body data" );
		} );
	} );

	describe( "arrayBuffer", ( ) =>
	{
		describe( "without validation", ( ) =>
		{
			it( "handle null", async ( ) =>
			{
				const body = new DataBody( null );
				const data = Buffer.from( await body.arrayBuffer( ) );
				expect( data.toString( ) ).toBe( "" );
			} );

			it( "handle string", async ( ) =>
			{
				const body = new DataBody( "foo" );
				const data = Buffer.from( await body.arrayBuffer( ) );
				expect( data.toString( ) ).toBe( "foo" );
			} );

			it( "handle buffer", async ( ) =>
			{
				const body = new DataBody( Buffer.from( "foo" ) );
				const data = Buffer.from( await body.arrayBuffer( ) );
				expect( data.toString( ) ).toBe( "foo" );
			} );

			it( "handle JsonBody", async ( ) =>
			{
				const body = new JsonBody( { foo: "bar" } );
				const data = Buffer.from( await body.arrayBuffer( ) );
				expect( data.toString( ) ).toBe( '{"foo":"bar"}' );
			} );

			it( "handle stream", async ( ) =>
			{
				const stream = through2( );
				stream.end( "foo" );
				const body = new StreamBody( stream );
				const data = Buffer.from( await body.arrayBuffer( ) );
				expect( data.toString( ) ).toBe( "foo" );
			} );
		} );

		describe( "matching validation", ( ) =>
		{
			it( "handle null", async ( ) =>
			{
				const body = new IntegrityBody( null, "" );
				const data = Buffer.from( await body.arrayBuffer( ) );
				expect( data.toString( ) ).toBe( "" );
			} );

			it( "handle string", async ( ) =>
			{
				const testData = "foo";
				const body = new IntegrityBody( testData, testData );
				const data = Buffer.from( await body.arrayBuffer( ) );
				expect( data.toString( ) ).toBe( testData );
			} );

			it( "handle buffer", async ( ) =>
			{
				const testData = "foo";
				const body = new IntegrityBody(
					Buffer.from( testData ), testData );
				const data = Buffer.from( await body.arrayBuffer( ) );
				expect( data.toString( ) ).toBe( testData );
			} );

			it( "handle stream", async ( ) =>
			{
				const testData = "foo";
				const stream = through2( );
				stream.end( testData );
				const body = new IntegrityBody( stream, testData );
				const data = Buffer.from( await body.arrayBuffer( ) );
				expect( data.toString( ) ).toBe( testData );
			} );
		} );

		describe( "mismatching validation", ( ) =>
		{
			it( "handle invalid hash type", async ( ) =>
			{
				const body = new IntegrityBody( null, "", "acme-hash" );
				expect( await makeSync( ( ) => body.arrayBuffer( ) ) )
					.toThrow( "not supported" );
			} );

			it( "handle null", async ( ) =>
			{
				const body = new IntegrityBody( null, "" + "x" );
				expect( await makeSync( ( ) => body.arrayBuffer( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle string", async ( ) =>
			{
				const testData = "foo";
				const body = new IntegrityBody( testData, testData + "x" );
				expect( await makeSync( ( ) => body.arrayBuffer( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle buffer", async ( ) =>
			{
				const testData = "foo";
				const body = new IntegrityBody(
					Buffer.from( testData ), testData + "x" );
				expect( await makeSync( ( ) => body.arrayBuffer( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle stream", async ( ) =>
			{
				const testData = "foo";
				const stream = through2( );
				stream.end( testData );
				const body = new IntegrityBody( stream, testData + "x" );
				expect( await makeSync( ( ) => body.arrayBuffer( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );
		} );
	} );

	describe( "json", ( ) =>
	{
		describe( "without validation", ( ) =>
		{
			it( "handle null", async ( ) =>
			{
				const body = new DataBody( null );
				expect( await body.json( ) ).toBe( null );
			} );

			it( "handle invalid string", async ( ) =>
			{
				const body = new DataBody( "invalid json" );
				expect( await makeSync( ( ) => body.json( ) ) ).toThrow( );
			} );

			it( "handle valid string", async ( ) =>
			{
				const body = new DataBody( '{"foo":"bar"}' );
				expect( await body.json( ) ).toEqual( { foo: "bar" } );
			} );

			it( "handle invalid buffer", async ( ) =>
			{
				const body = new DataBody( Buffer.from( "invalid json" ) );
				expect( await makeSync( ( ) => body.json( ) ) ).toThrow( );
			} );

			it( "handle valid buffer", async ( ) =>
			{
				const body = new DataBody( Buffer.from( '{"foo":"bar"}' ) );
				expect( await body.json( ) ).toEqual( { foo: "bar" } );
			} );

			it( "handle valid JsonBody", async ( ) =>
			{
				const body = new JsonBody( { foo: "bar" } );
				expect( await body.json( ) ).toEqual( { foo: "bar" } );
			} );

			it( "handle invalid stream", async ( ) =>
			{
				const stream = through2( );
				stream.end( "invalid json" );
				const body = new StreamBody( stream );
				expect( await makeSync( ( ) => body.json( ) ) ).toThrow( );
			} );

			it( "handle valid stream", async ( ) =>
			{
				const stream = through2( );
				stream.end( '{"foo":"bar"}' );
				const body = new StreamBody( stream );
				expect( await body.json( ) ).toEqual( { foo: "bar" } );
			} );
		} );

		describe( "matching validation", ( ) =>
		{
			it( "handle null", async ( ) =>
			{
				const body = new DataBody( null );
				setHash( body, "" );
				expect( await body.json( ) ).toBe( null );
			} );

			it( "handle string", async ( ) =>
			{
				const testData = '{"foo":"bar"}';
				const body = new DataBody( testData );
				setHash( body, testData );
				expect( await body.json( ) ).toEqual( { foo: "bar" } );
			} );

			it( "handle buffer", async ( ) =>
			{
				const testData = '{"foo":"bar"}';
				const body = new DataBody( Buffer.from( testData ) );
				setHash( body, testData );
				expect( await body.json( ) ).toEqual( { foo: "bar" } );
			} );

			it( "handle JsonBody", async ( ) =>
			{
				const body = new JsonBody( { foo: "bar" } );
				setHash( body, '{"foo":"bar"}' );
				expect( await body.json( ) ).toEqual( { foo: "bar" } );
			} );

			it( "handle stream", async ( ) =>
			{
				const testData = '{"foo":"bar"}';
				const stream = through2( );
				stream.end( testData );
				const body = new StreamBody( stream );
				setHash( body, testData );
				expect( await body.json( ) ).toEqual( { foo: "bar" } );
			} );
		} );

		describe( "mismatching validation", ( ) =>
		{
			it( "handle null", async ( ) =>
			{
				const body = new DataBody( null );
				setHash( body, "" + "x" );
				expect( await makeSync( ( ) => body.json( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle string", async ( ) =>
			{
				const testData = '{"foo":"bar"}';
				const body = new DataBody( testData );
				setHash( body, testData + "x" );
				expect( await makeSync( ( ) => body.json( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle buffer", async ( ) =>
			{
				const testData = '{"foo":"bar"}';
				const body = new DataBody( Buffer.from( testData ) );
				setHash( body, testData + "x" );
				expect( await makeSync( ( ) => body.json( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle JsonBody", async ( ) =>
			{
				const body = new JsonBody( { foo: "bar" } );
				setHash( body, '{"foo":"bar"}' + "x" );
				expect( await makeSync( ( ) => body.json( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle stream", async ( ) =>
			{
				const testData = '{"foo":"bar"}';
				const stream = through2( );
				stream.end( testData );
				const body = new StreamBody( stream );
				setHash( body, testData + "x" );
				expect( await makeSync( ( ) => body.json( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );
		} );
	} );

	describe( "text", ( ) =>
	{
		describe( "without validation", ( ) =>
		{
			it( "handle null", async ( ) =>
			{
				const body = new DataBody( null );
				expect( await body.text( ) ).toBe( null );
			} );

			it( "handle string", async ( ) =>
			{
				const body = new DataBody( "foo" );
				expect( await body.text( ) ).toBe( "foo" );
			} );

			it( "handle buffer", async ( ) =>
			{
				const body = new DataBody( Buffer.from( "foo" ) );
				expect( await body.text( ) ).toBe( "foo" );
			} );

			it( "handle stream", async ( ) =>
			{
				const stream = through2( );
				stream.end( "foo" );
				const body = new StreamBody( stream );
				expect( await body.text( ) ).toBe( "foo" );
			} );
		} );

		describe( "matching validation", ( ) =>
		{
			it( "handle null", async ( ) =>
			{
				const body = new DataBody( null );
				setHash( body, "" );
				expect( await body.text( ) ).toBe( null );
			} );

			it( "handle string", async ( ) =>
			{
				const testData = "foo";
				const body = new DataBody( testData );
				setHash( body, testData );
				expect( await body.text( ) ).toBe( testData );
			} );

			it( "handle buffer", async ( ) =>
			{
				const testData = "foo";
				const body = new DataBody( Buffer.from( testData ) );
				setHash( body, testData );
				expect( await body.text( ) ).toBe( testData );
			} );

			it( "handle stream", async ( ) =>
			{
				const testData = "foo";
				const stream = through2( );
				stream.end( testData );
				const body = new StreamBody( stream );
				setHash( body, testData );
				expect( await body.text( ) ).toBe( testData );
			} );
		} );

		describe( "mismatching validation", ( ) =>
		{
			it( "handle null", async ( ) =>
			{
				const body = new DataBody( null );
				setHash( body, "" + "x" );
				expect( await makeSync( ( ) => body.text( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle string", async ( ) =>
			{
				const testData = "foo";
				const body = new DataBody( testData );
				setHash( body, testData + "x" );
				expect( await makeSync( ( ) => body.text( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle buffer", async ( ) =>
			{
				const testData = "foo";
				const body = new DataBody( Buffer.from( testData ) );
				setHash( body, testData + "x" );
				expect( await makeSync( ( ) => body.text( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );

			it( "handle stream", async ( ) =>
			{
				const testData = "foo";
				const stream = through2( );
				stream.end( testData );
				const body = new StreamBody( stream );
				setHash( body, testData + "x" );
				expect( await makeSync( ( ) => body.text( ) ) )
					.toThrow( "Resource integrity mismatch" );
			} );
		} );
	} );

	describe( "readable", ( ) =>
	{
		it( "handle null", async ( ) =>
		{
			const body = new DataBody( null );
			const data = await getStream.buffer( await body.readable( ) );
			expect( data.toString( ) ).toBe( "" );
		} );

		it( "handle string", async ( ) =>
		{
			const body = new DataBody( "foo" );
			const data = await getStream.buffer( await body.readable( ) );
			expect( data.toString( ) ).toBe( "foo" );
		} );

		it( "handle buffer", async ( ) =>
		{
			const body = new DataBody( Buffer.from( "foo" ) );
			const data = await getStream.buffer( await body.readable( ) );
			expect( data.toString( ) ).toBe( "foo" );
		} );

		it( "handle stream", async ( ) =>
		{
			const stream = through2( );
			stream.end( "foo" );
			const body = new StreamBody( stream );
			const data = await getStream.buffer( await body.readable( ) );
			expect( data.toString( ) ).toBe( "foo" );
		} );
	} );
} );
