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
		it( "should not send 'connection: close' by default", async ( ) =>
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

		it( "should send 'connection: close' if http1.keelAlive === false",
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
