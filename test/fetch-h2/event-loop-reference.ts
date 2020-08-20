import * as path from "path";

import * as execa from "execa";

import { TestData } from "../lib/server-common";
import { makeMakeServer } from "../lib/server-helpers";


const script =
	path.resolve( path.join( process.cwd( ), "scripts", "test-client" ) );

describe( "event-loop", ( ) =>
{
	jest.setTimeout( 20000 );

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
				{ input: JSON.stringify( body ), stderr: 'inherit' }
			);

			const responseBody = JSON.parse( stdout );
			expect( responseBody[ "user-agent" ] ).toContain( "fetch-h2/" );

			await server.shutdown( );
		} );

		it( `should handle redirect ${proto} ${version}`, async ( ) =>
		{
			const { port, server } = await makeServer( );

			const url = `${proto}//localhost:${port}/redirect/delay/50`;

			const body = { foo: "bar" };

			const { stdout } = await execa(
				script,
				[ "GET", url, version, "insecure" ],
				{ input: JSON.stringify( body ), stderr: 'inherit' }
			);

			expect( stdout ).toBe( "abcdefghij" );

			await server.shutdown( );
		} );

		it( `should handle absolute redirect ${proto} ${version}`, async ( ) =>
		{
			const { port, server } = await makeServer( );

			const redirectTo = `${proto}//localhost:${port}/delay/50`;
			const url = `${proto}//localhost:${port}/redirect/${redirectTo}`;

			const body = { foo: "bar" };

			const { stdout } = await execa(
				script,
				[ "GET", url, version, "insecure" ],
				{ input: JSON.stringify( body ), stderr: 'inherit' }
			);

			expect( stdout ).toBe( "abcdefghij" );

			await server.shutdown( );
		} );
	} );
} );
