import * as path from "path";

import { expect } from "chai";
import * as execa from "execa";

import { TestData } from "../lib/server-common";
import { makeMakeServer } from "../lib/server-helpers";


const script = path.resolve( __dirname, "../../../scripts/test-client" );

describe( "event-loop", function( )
{
	this.timeout( 20000 );

	const runs: Array< TestData > = [
		{ proto: "http:", version: "http1" },
		{ proto: "https:", version: "http1" },
		{ proto: "http:", version: "http2" },
		{ proto: "https:", version: "http2" },
	];

	runs.forEach( ( { proto, version } ) =>
	{
		const { makeServer } = makeMakeServer( { proto, version } );

		it( `should unref ${proto} ${version}`, async ( ) =>
		{
			const { port, server } = await makeServer( );

			const url = `${proto}//localhost:${port}/headers`;

			const body = { foo: "bar" };

			const { stdout } = await execa(
				script,
				[ "GET", url, version, "insecure" ],
				{ input: JSON.stringify( body ) }
			);

			const responseBody = JSON.parse( stdout );
			expect( responseBody[ "user-agent" ] ).to.include( "fetch-h2/" );

			await server.shutdown( );
		} );
	} );
} );
