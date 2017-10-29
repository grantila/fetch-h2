'use strict';

import 'mocha';
import { expect } from 'chai';
import { delay } from 'already';
import { buffer } from 'get-stream';
import * as through2 from 'through2';
import * as from2 from 'from2';
import { createHash } from 'crypto'

import { makeServer } from '../lib/server';

import {
	fetch,
	context,
	disconnectAll,
	JsonBody,
	StreamBody,
	DataBody,
	Response,
} from '../../';

afterEach( disconnectAll );

function ensureStatusSuccess( response: Response ): Response
{
	if ( response.status < 200 || response.status >= 300 )
		throw new Error( "Status not 2xx" );
	return response;
}

describe( 'basic', ( ) =>
{
	it( 'should be able to perform simple GET', async ( ) =>
	{
		const { server, port } = await makeServer( );

		const response = ensureStatusSuccess(
			await fetch( `http://localhost:${port}/headers` )
		);

		const res = await response.json( );
		expect( res[ ':path' ] ).to.equal( '/headers' );

		await server.shutdown( );
	} );

	it( 'should be able to set upper-case headers', async ( ) =>
	{
		const { server, port } = await makeServer( );

		const headers = {
			'Content-Type': 'text/foo+text',
			'Content-Length': '6',
		};

		const response = ensureStatusSuccess(
			await fetch(
				`http://localhost:${port}/headers`,
				{
					method: 'POST',
					body: new DataBody( "foobar" ),
					headers,
				}
			)
		);

		const res = await response.json( );

		for ( let [ key, val ] of Object.entries( headers ) )
			expect( res[ key.toLowerCase( ) ] ).to.equal( val );

		await server.shutdown( );
	} );

	it( 'should be able to set numeric headers', async ( ) =>
	{
		const { server, port } = await makeServer( );

		const headers = {
			'content-type': 'text/foo+text',
			'content-length': < string >< any >6,
		};

		const response = ensureStatusSuccess(
			await fetch(
				`http://localhost:${port}/headers`,
				{
					method: 'POST',
					body: new DataBody( "foobar" ),
					headers,
				}
			)
		);

		const res = await response.json( );

		for ( let [ key, val ] of Object.entries( headers ) )
			expect( res[ key ] ).to.equal( `${val}` );

		await server.shutdown( );
	} );

	it( 'should be able to POST stream-data with known length', async ( ) =>
	{
		const { server, port } = await makeServer( );

		const stream = through2( );

		stream.write( "foo" );

		const eventual_response = fetch(
			`http://localhost:${port}/echo`,
			{
				method: 'POST',
				body: new StreamBody( stream ),
				headers: { 'content-length': '6' },
			}
		);

		await delay( 1 );

		stream.write( "bar" );
		stream.end( );

		const response = ensureStatusSuccess( await eventual_response );

		const data = await response.text( );
		expect( data ).to.equal( "foobar" );

		await server.shutdown( );
	} );

	it( 'should be able to POST stream-data with unknown length', async ( ) =>
	{
		const { server, port } = await makeServer( );

		const stream = through2( );

		stream.write( "foo" );

		const eventual_response = fetch(
			`http://localhost:${port}/echo`,
			{
				method: 'POST',
				body: new StreamBody( stream ),
			}
		);

		await delay( 1 );

		stream.write( "bar" );
		stream.end( );

		const response = ensureStatusSuccess( await eventual_response );

		const data = await response.text( );
		expect( data ).to.equal( "foobar" );

		await server.shutdown( );
	} );

	it.skip( 'should be able to POST large stream with known length', async ( ) =>
	{
		const { server, port } = await makeServer( );

		const chunkSize = 16 * 1024;
		const chunks = 1024;
		const chunk = Buffer.allocUnsafe( chunkSize );

		const hash = createHash( 'sha256' );
		let referenceHash;

		let chunkNum = 0;
		const stream = from2( ( size, next ) =>
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

		const eventual_response = fetch(
			`http://localhost:${port}/sha256`,
			{
				method: 'POST',
				body: new StreamBody( stream ),
				headers: { 'content-length': '' + chunkSize * chunks },
			}
		);

		await delay( 1 );

		const response = ensureStatusSuccess( await eventual_response );

		const data = await response.text( );
		expect( data ).to.equal( referenceHash );

		await server.shutdown( );
	} );

	it.skip( 'should be able to POST large stream with unknown length', async ( ) =>
	{
		//
	} );
} );

describe( 'nghttp2.org/httpbin', ( ) =>
{
	it( 'should be possible to GET HTTPS/2', async ( ) =>
	{
		const response = await fetch( 'https://nghttp2.org/httpbin/user-agent' );
		const data = await response.json( );
		expect( data[ 'user-agent' ] ).to.include( 'fetch-h2/' );
	} );

	it( 'should be possible to POST JSON', async ( ) =>
	{
		const testData = { foo: 'bar' };

		const response = await fetch(
			'https://nghttp2.org/httpbin/post',
			{
				method: 'POST',
				body: new JsonBody( testData ),
			}
		);
		const data = await response.json( );
		expect( testData ).to.deep.equal( data.json );
		// fetch-h2 should set content type for JsonBody
		expect( data.headers[ 'Content-Type' ] ).to.equal( 'application/json' );
	} );

	it( 'should be possible to POST buffer-data', async ( ) =>
	{
		const testData = '{"foo": "data"}';

		const response = await fetch(
			'https://nghttp2.org/httpbin/post',
			{
				method: 'POST',
				body: new DataBody( testData ),
			}
		);
		const data = await response.json( );
		expect( data.data ).to.equal( testData );
		expect( Object.keys( data.headers ) ).to.not.contain( 'Content-Type' );
	} );

	it( 'should be possible to POST already ended stream-data', async ( ) =>
	{
		const stream = through2( );

		stream.write( "foo" );
		stream.write( "bar" );
		stream.end( );

		const response = await fetch(
			'https://nghttp2.org/httpbin/post',
			{
				method: 'POST',
				body: new StreamBody( stream ),
				headers: { 'content-length': '6' },
			}
		);

		const data = await response.json( );
		expect( data.data ).to.equal( "foobar" );
	} );

	it( 'should be possible to POST not yet ended stream-data', async ( ) =>
	{
		const stream = through2( );

		const eventual_response = fetch(
			'https://nghttp2.org/httpbin/post',
			{
				method: 'POST',
				body: new StreamBody( stream ),
				headers: { 'content-length': '6' },
			}
		);

		await delay( 1 );

		stream.write( "foo" );
		stream.write( "bar" );
		stream.end( );

		const response = await eventual_response;

		const data = await response.json( );
		expect( data.data ).to.equal( "foobar" );
	} );

	it( 'should save and forward cookies', async ( ) =>
	{
		const { fetch, disconnectAll } = context( );

		const responseSet = await fetch(
			'https://nghttp2.org/httpbin/cookies/set?foo=bar',
			{ redirect:'manual' } );

		expect( responseSet.headers.has( 'location' ) ).to.be.true;
		const redirectedTo = responseSet.headers.get( 'location' );

		const response = await fetch( 'https://nghttp2.org' + redirectedTo );

		const data = await response.json( );
		expect( data.cookies ).to.deep.equal( { foo: 'bar' } );

		await disconnectAll( );
	} );
} );

