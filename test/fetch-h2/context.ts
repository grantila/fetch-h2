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


describe( 'context', ( ) =>
{
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

	describe( 'network settings', function( )
	{
		this.timeout( 200 );

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
				expect( err.message ).to.contain( 'prematurely closed' );
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
} );
