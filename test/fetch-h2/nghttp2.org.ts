import 'mocha';
import { expect } from 'chai';
import { delay } from 'already';
import * as through2 from 'through2';

import {
	fetch,
	context,
	disconnectAll,
	JsonBody,
	StreamBody,
	DataBody,
	Response,
	Headers,
	OnTrailers,
} from '../../';

afterEach( disconnectAll );

describe( 'nghttp2.org/httpbin', function( )
{
	this.timeout( 5000 );

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
			{ redirect: 'manual' } );

		expect( responseSet.headers.has( 'location' ) ).to.be.true;
		const redirectedTo = responseSet.headers.get( 'location' );

		const response = await fetch( 'https://nghttp2.org' + redirectedTo );

		const data = await response.json( );
		expect( data.cookies ).to.deep.equal( { foo: 'bar' } );

		await disconnectAll( );
	} );

	it( 'should handle (and follow) relative paths', async ( ) =>
	{
		const { fetch, disconnectAll } = context( );

		const response = await fetch(
			'https://nghttp2.org/httpbin/relative-redirect/2',
			{ redirect: 'follow' } );

		expect( response.url ).to.equal( "https://nghttp2.org/httpbin/get" );
		await response.text( );

		await disconnectAll( );
	} );
} );
