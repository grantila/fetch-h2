import { lsof } from "list-open-files";

import { makeMakeServer } from "../lib/server-helpers";

import {
	context,
} from "../../index";
import { ensureStatusSuccess } from "../lib/utils";


describe( `http1`, ( ) =>
{
	const { cycleOpts, makeServer } =
		makeMakeServer( { proto: "http:", version: "http1" } );

	describe( "keep-alive", ( ) =>
	{
		describe( "http1.keelAlive === true (default)", ( ) =>
		{
			it( "should not send 'connection: close'", async ( ) =>
			{
				const { server, port } = await makeServer( );
				const { disconnectAll, fetch } = context( { ...cycleOpts } );

				const response1 = ensureStatusSuccess(
					await fetch( `http://localhost:${port}/headers` )
				);

				const headers = await response1.json( );

				expect( headers.connection ).not.toBe( "close" );

				disconnectAll( );

				await server.shutdown( );
			} );

			it( "should re-use socket", async ( ) =>
			{
				const { server, port } = await makeServer( );
				const { disconnectAll, fetch } = context( { ...cycleOpts } );

				const [ { files: openFilesA } ] = await lsof( { } );

				const response1 = ensureStatusSuccess(
					await fetch( `http://localhost:${port}/headers` )
				);
				await response1.json( );

				const [ { files: openFilesB } ] = await lsof( { } );

				const response2 = ensureStatusSuccess(
					await fetch( `http://localhost:${port}/headers` )
				);
				await response2.json( );

				const [ { files: openFilesC } ] = await lsof( { } );

				const ipA = openFilesA.filter( fd => fd.type === 'IP' );
				const ipB = openFilesB.filter( fd => fd.type === 'IP' );
				const ipC = openFilesC.filter( fd => fd.type === 'IP' );

				// 2 less because client+server
				expect( ipA.length ).toEqual( ipB.length - 2 );
				expect( ipB.length ).toEqual( ipC.length );
				expect( ipB ).toEqual( ipC );

				disconnectAll( );

				await server.shutdown( );
			} );
		} );

		describe( "http1.keelAlive === false", ( ) =>
		{
			it( "should send 'connection: close'",
				async ( ) =>
			{
				const { server, port } = await makeServer( );
				const { disconnectAll, fetch } = context( {
					...cycleOpts,
					http1: {
						keepAlive: false,
					},
				} );

				const response1 = ensureStatusSuccess(
					await fetch( `http://localhost:${port}/headers` )
				);

				const headers = await response1.json( );

				expect( headers.connection ).toBe( "close" );

				disconnectAll( );

				await server.shutdown( );
			} );
		} );
	} );
} );
