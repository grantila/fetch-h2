import { expect } from "chai";
import "mocha";

import { TestData } from "../lib/server-common";
import { makeMakeServer } from "../lib/server-helpers";

import {
	context,
	CookieJar,
	Response,
} from "../../";

function ensureStatusSuccess( response: Response ): Response
{
	if ( response.status < 200 || response.status >= 300 )
		throw new Error( "Status not 2xx" );
	return response;
}


( [
	{ proto: "http:", version: "http1" },
	{ proto: "http:", version: "http2" },
	{ proto: "https:", version: "http1" },
	{ proto: "https:", version: "http2" },
] as Array< TestData > )
.forEach( ( { proto, version } ) =>
{
describe( `context (${version} over ${proto.replace( ":", "" )})`, function( )
{
	const { cycleOpts, makeServer } = makeMakeServer( { proto, version } );

	this.timeout( 500 );

	describe( "options", ( ) =>
	{
		it( "should be able to overwrite default user agent", async ( ) =>
		{
			const { server, port } = await makeServer( );

			const { disconnectAll, fetch } = context( {
				...cycleOpts,
				overwriteUserAgent: true,
				userAgent: "foobar",
			} );

			const response = ensureStatusSuccess(
				await fetch( `${proto}//localhost:${port}/headers` )
			);

			const res = await response.json( );
			expect( res[ "user-agent" ] ).to.equal( "foobar" );

			disconnectAll( );

			await server.shutdown( );
		} );

		it( "should be able to set (combined) user agent", async ( ) =>
		{
			const { server, port } = await makeServer( );

			const { disconnectAll, fetch } = context( {
				...cycleOpts,
				userAgent: "foobar",
			} );

			const response = ensureStatusSuccess(
				await fetch( `${proto}//localhost:${port}/headers` )
			);

			const res = await response.json( );
			expect( res[ "user-agent" ] ).to.contain( "foobar" );
			expect( res[ "user-agent" ] ).to.contain( "fetch-h2" );

			disconnectAll( );

			await server.shutdown( );
		} );

		it( "should be able to set default accept header", async ( ) =>
		{
			const { server, port } = await makeServer( );

			const accept = "application/foobar, text/*;0.9";

			const { disconnectAll, fetch } = context( {
				...cycleOpts,
				accept,
			} );

			const response = ensureStatusSuccess(
				await fetch( `${proto}//localhost:${port}/headers` )
			);

			const res = await response.json( );
			expect( res.accept ).to.equal( accept );

			disconnectAll( );

			await server.shutdown( );
		} );
	} );

	if ( proto === "https:" )
	describe( "network settings", ( ) =>
	{
		it( "should not be able to connect over unauthorized ssl", async ( ) =>
		{
			const { server, port } = await makeServer( );

			const { disconnectAll, fetch } = context( {
				...cycleOpts,
				overwriteUserAgent: true,
				session: { rejectUnauthorized: true },
				userAgent: "foobar",
			} );

			try
			{
				await fetch( `https://localhost:${port}/headers` );
				expect( true ).to.be.false;
			}
			catch ( err )
			{
				expect( err.message ).to.satisfy( ( message: string ) =>
					message.includes( "closed" ) // < Node 9.4
					||
					message.includes( "self signed" ) // >= Node 9.4
					||
					message.includes( "expired" )
				);
			}

			disconnectAll( );

			await server.shutdown( );
		} );

		it( "should be able to connect over unauthorized ssl", async ( ) =>
		{
			const { server, port } = await makeServer( );

			const { disconnectAll, fetch } = context( {
				...cycleOpts,
				overwriteUserAgent: true,
				session: { rejectUnauthorized: false },
				userAgent: "foobar",
			} );

			const response = ensureStatusSuccess(
				await fetch( `https://localhost:${port}/headers` )
			);

			const res = await response.json( );
			expect( res[ "user-agent" ] ).to.equal( "foobar" );

			disconnectAll( );

			await server.shutdown( );
		} );
	} );

	describe( "cookies", ( ) =>
	{
		it( "should be able to specify custom cookie jar", async ( ) =>
		{
			const { server, port } = await makeServer( );

			const cookieJar = new CookieJar( );

			expect(
				await cookieJar.getCookies( `${proto}//localhost:${port}/` )
			).to.be.empty;

			const { disconnectAll, fetch } = context( {
				...cycleOpts,
				cookieJar,
				overwriteUserAgent: true,
				userAgent: "foobar",
			} );

			await fetch( `${proto}//localhost:${port}/set-cookie`, {
				json: [ "a=b" , "c=d" ],
				method: "POST",
			} );

			const cookies =
				await cookieJar.getCookies( `${proto}//localhost:${port}/` );

			expect( cookies ).to.not.be.empty;
			expect( cookies[ 0 ].key ).to.equal( "a" );
			expect( cookies[ 0 ].value ).to.equal( "b" );
			expect( cookies[ 1 ].key ).to.equal( "c" );
			expect( cookies[ 1 ].value ).to.equal( "d" );

			// Next request should maintain cookies

			await fetch( `${proto}//localhost:${port}/echo` );

			const cookies2 =
				await cookieJar.getCookies( `${proto}//localhost:${port}/` );

			expect( cookies2 ).to.not.be.empty;

			// If we manually clear the cookie jar, subsequent requests
			// shouldn't have any cookies

			cookieJar.reset( );

			await fetch( `${proto}//localhost:${port}/echo` );

			const cookies3 =
				await cookieJar.getCookies( `${proto}//localhost:${port}/` );

			expect( cookies3 ).to.be.empty;

			disconnectAll( );

			await server.shutdown( );
		} );
	} );

	describe( "disconnection", ( ) =>
	{
		it( "should be able to disconnect non-connection",
			async ( ) =>
		{
			const { server } = await makeServer( );

			const { disconnectAll, fetch } = context( );

			const awaitFetch = fetch( "${proto}//localhost:0" );

			disconnectAll( );

			await awaitFetch.catch( ( ) => { } );

			disconnectAll( );

			await server.shutdown( );
		} );

		it( "should be able to disconnect invalid url",
			async ( ) =>
		{
			const { server } = await makeServer( );

			const { disconnectAll, fetch } =
				context( {
					...cycleOpts,
					session: { port: -1, host: < any >{ } },
				} );

			const awaitFetch = fetch( "ftp://localhost" );

			disconnectAll( );

			await awaitFetch.catch( ( ) => { } );

			disconnectAll( );

			await server.shutdown( );
		} );
	} );
} );
} );
