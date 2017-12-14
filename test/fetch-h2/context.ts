'use strict';

import 'mocha';
import { expect } from 'chai';

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
} );
