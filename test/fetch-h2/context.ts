'use strict';

import 'mocha';
import { expect } from 'chai';
import { readFileSync } from 'fs';

import { makeServer } from '../lib/server';

import {
	fetch,
	context,
	disconnectAll,
	onPush,
	Body,
	JsonBody,
	StreamBody,
	DataBody,
	Response,
	Headers,
	OnTrailers,
	CookieJar,
} from '../../';

afterEach( disconnectAll );

function ensureStatusSuccess( response: Response ): Response
{
	if ( response.status < 200 || response.status >= 300 )
		throw new Error( "Status not 2xx" );
	return response;
}

const key = readFileSync( __dirname + "/../../../certs/key.pem" );
const cert = readFileSync( __dirname + "/../../../certs/cert.pem" );


describe( 'context', function( )
{
	this.timeout( 300 );

	describe( 'options', ( ) =>
	{
		it( 'should be able to overwrite default user agent', async ( ) =>
		{
			const { server, port } = await makeServer( );

			const { disconnectAll, fetch } = context( {
				userAgent: 'foobar',
				overwriteUserAgent: true,
			} );

			const response = ensureStatusSuccess(
				await fetch( `http://localhost:${port}/headers` )
			);

			const res = await response.json( );
			expect( res[ 'user-agent' ] ).to.equal( 'foobar' );

			disconnectAll( );

			await server.shutdown( );
		} );

		it( 'should be able to set (combined) user agent', async ( ) =>
		{
			const { server, port } = await makeServer( );

			const { disconnectAll, fetch } = context( {
				userAgent: 'foobar'
			} );

			const response = ensureStatusSuccess(
				await fetch( `http://localhost:${port}/headers` )
			);

			const res = await response.json( );
			expect( res[ 'user-agent' ] ).to.contain( 'foobar' );
			expect( res[ 'user-agent' ] ).to.contain( 'fetch-h2' );

			disconnectAll( );

			await server.shutdown( );
		} );

		it( 'should be able to set default accept header', async ( ) =>
		{
			const { server, port } = await makeServer( );

			const accept = 'application/foobar, text/*;0.9';

			const { disconnectAll, fetch } = context( { accept } );

			const response = ensureStatusSuccess(
				await fetch( `http://localhost:${port}/headers` )
			);

			const res = await response.json( );
			expect( res[ 'accept' ] ).to.equal( accept );

			disconnectAll( );

			await server.shutdown( );
		} );
	} );

	describe( 'network settings', ( ) =>
	{
		it( 'should not be able to connect over unauthorized ssl', async ( ) =>
		{
			const { server, port } = await makeServer( {
				serverOptions: { key, cert }
			} );

			const { disconnectAll, fetch } = context( {
				userAgent: 'foobar',
				overwriteUserAgent: true,
			} );

			try
			{
				await fetch( `https://localhost:${port}/headers` );
				expect( true ).to.be.false;
			}
			catch ( err )
			{
				expect( err.message ).to.contain( 'closed' );
			}

			disconnectAll( );

			await server.shutdown( );
		} );

		it( 'should be able to connect over unauthorized ssl', async ( ) =>
		{
			const { server, port } = await makeServer( {
				serverOptions: { key, cert }
			} );

			const { disconnectAll, fetch } = context( {
				userAgent: 'foobar',
				overwriteUserAgent: true,
				session: { rejectUnauthorized: false },
			} );

			const response = ensureStatusSuccess(
				await fetch( `https://localhost:${port}/headers` )
			);

			const res = await response.json( );
			expect( res[ 'user-agent' ] ).to.equal( 'foobar' );

			disconnectAll( );

			await server.shutdown( );
		} );
	} );

	describe( 'cookies', ( ) =>
	{
		it( 'should be able to specify custom cookie jar', async ( ) =>
		{
			const { server, port } = await makeServer( );

			const cookieJar = new CookieJar( );

			expect(
				await cookieJar.getCookies( `http://localhost:${port}/` )
			).to.be.empty;

			const { disconnectAll, fetch } = context( {
				userAgent: 'foobar',
				overwriteUserAgent: true,
				cookieJar,
			} );

			const response =
				await fetch( `http://localhost:${port}/set-cookie`, {
					json: [ "a=b" , "c=d" ],
					method: 'POST',
				} );

			const cookies =
				await cookieJar.getCookies( `http://localhost:${port}/` );

			expect( cookies ).to.not.be.empty;
			expect( cookies[ 0 ].key ).to.equal( "a" );
			expect( cookies[ 0 ].value ).to.equal( "b" );
			expect( cookies[ 1 ].key ).to.equal( "c" );
			expect( cookies[ 1 ].value ).to.equal( "d" );

			// Next request should maintain cookies

			const response2 = await fetch( `http://localhost:${port}/echo` );

			const cookies2 =
				await cookieJar.getCookies( `http://localhost:${port}/` );

			expect( cookies2 ).to.not.be.empty;

			// If we manually clear the cookie jar, subsequent requests
			// shouldn't have any cookies

			cookieJar.reset( );

			const response3 = await fetch( `http://localhost:${port}/echo` );

			const cookies3 =
				await cookieJar.getCookies( `http://localhost:${port}/` );

			expect( cookies3 ).to.be.empty;

			disconnectAll( );

			await server.shutdown( );
		} );
	} );
} );
