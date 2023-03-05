import { map } from "already";
import { lsof } from "list-open-files";

import { TestData } from "../lib/server-common";
import { makeMakeServer } from "../lib/server-helpers";

import {
	context,
	CookieJar,
	Response,
} from "../../index";


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
describe( `context (${version} over ${proto.replace( ":", "" )})`, ( ) =>
{
	const { cycleOpts, makeServer } = makeMakeServer( { proto, version } );

	jest.setTimeout( 500 );

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
			expect( res[ "user-agent" ] ).toBe( "foobar" );

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
			expect( res[ "user-agent" ] ).toContain( "foobar" );
			expect( res[ "user-agent" ] ).toContain( "fetch-h2" );

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
			expect( res.accept ).toBe( accept );

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
				expect( true ).toEqual( false );
			}
			catch ( err: any )
			{
				expect(
					err.message.includes( "closed" ) // < Node 9.4
					||
					err.message.includes( "self signed" ) // >= Node 9.4
					||
					err.message.includes( "expired" )
				).toBeTruthy( );
			}

			await disconnectAll( );

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
			expect( res[ "user-agent" ] ).toBe( "foobar" );

			await disconnectAll( );

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
			).toEqual( [ ] );

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

			expect( cookies.length ).toBeGreaterThan( 1 );
			expect( cookies[ 0 ].key ).toBe( "a" );
			expect( cookies[ 0 ].value ).toBe( "b" );
			expect( cookies[ 1 ].key ).toBe( "c" );
			expect( cookies[ 1 ].value ).toBe( "d" );

			// Next request should maintain cookies

			await fetch( `${proto}//localhost:${port}/echo` );

			const cookies2 =
				await cookieJar.getCookies( `${proto}//localhost:${port}/` );

			expect( cookies2.length ).toBeGreaterThan( 0 );

			// If we manually clear the cookie jar, subsequent requests
			// shouldn't have any cookies

			cookieJar.reset( );

			await fetch( `${proto}//localhost:${port}/echo` );

			const cookies3 =
				await cookieJar.getCookies( `${proto}//localhost:${port}/` );

			expect( cookies3 ).toEqual( [ ] );

			disconnectAll( );

			await server.shutdown( );
		} );

		it( "shouldn't be able to read cookie headers be default", async ( ) =>
		{
			const { server, port } = await makeServer( );

			const { disconnectAll, fetch } = context( { ...cycleOpts } );

			const response = await fetch(
				`${proto}//localhost:${port}/set-cookie`,
				{
					json: [ "a=b" , "c=d" ],
					method: "POST",
				}
			);

			expect( response.headers.get( "set-cookie" ) ).toBe( null );
			expect( response.headers.get( "set-cookie2" ) ).toBe( null );

			disconnectAll( );

			await server.shutdown( );
		} );

		it( "should be able to read cookie headers if allowed", async ( ) =>
		{
			const { server, port } = await makeServer( );

			const { disconnectAll, fetch } = context( { ...cycleOpts } );

			const response = await fetch(
				`${proto}//localhost:${port}/set-cookie`,
				{
					allowForbiddenHeaders: true,
					json: [ "a=b" , "c=d" ],
					method: "POST",
				}
			);

			expect( response.headers.get( "set-cookie" ) ).toBe( "a=b,c=d" );

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

			const { disconnectAll, fetch } = context( { ...cycleOpts } );

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

	describe( "session sharing", ( ) =>
	{
		jest.setTimeout( 2500 );

		it( "should re-use session for same host", async ( ) =>
		{
			const { server, port } = await makeServer();

			const { disconnectAll, fetch } = context( { ...cycleOpts } );

			const urls = [
				[ `${proto}//localhost:${port}/sha256`, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ],
				[ `${proto}//localhost:${port}/sha256`, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ],
				[ `${proto}//localhost:${port}/sha256`, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ],
			];

			const [ { files: openFilesBefore } ] = await lsof( );

			const resps = await map(
				urls,
				{ concurrency: Infinity },
				async ( [ url, expected ] ) =>
				{
					const resp = await fetch( url );
					const text = await resp.text( );
					return { expected, got: text };
				}
			);

			const [ { files: openFilesAfter } ] = await lsof( { } );

			const numAfter =
				openFilesAfter.filter( fd => fd.type === 'IP' ).length;
			const numBefore =
				openFilesBefore.filter( fd => fd.type === 'IP' ).length;

			// HTTP/1.1 will most likely spawn new sockets, but timing *may* affect this.
			// For HTTP/2, it should always just use 1 socket per origin / SAN cluster
			// plus we need to account for one open file from our locally running server as well.
			if ( version === 'http2' )
				expect( numBefore ).toEqual( numAfter - 2 );

			resps.forEach( ( { expected, got } ) =>
			{
				expect( got ).toBe( expected );
			} );

			await disconnectAll( );
			await server.shutdown( );

		} );

		it( "should re-use session for same SAN but different host",
			async ( ) =>
		{
			const { disconnectAll, fetch } = context( { ...cycleOpts } );

			const urls = [
				{ lang: "en", title: "33" },
				{ lang: "en", title: "44" },
				{ lang: "sv", title: "33" },
				{ lang: "sv", title: "44" },
			] as const;

			const [ { files: openFilesBefore } ] = await lsof( );

			const resps = await map(
				urls,
				{ concurrency: Infinity },
				async ( { lang, title } ) =>
				{
					const url = `https://${lang}.wikipedia.org/wiki/${title}`;
					const resp = await fetch( url );
					const text = await resp.text( );
					const mLang = text.match( /<html[^>]* lang="([^"]+)"/ );
					const mTitle = text.match( /<title[^>]*>(\S+).*<\/title>/ );
					return {
						expectedLang: lang,
						gotLang: mLang?.[ 1 ],
						expectedTitle: title,
						gotTitle: mTitle?.[ 1 ],
					};
				}
			);

			const [ { files: openFilesAfter } ] = await lsof( { } );

			const numAfter =
				openFilesAfter.filter( fd => fd.type === 'IP' ).length;
			const numBefore =
				openFilesBefore.filter( fd => fd.type === 'IP' ).length;

			// HTTP/1.1 will most likely spawn new sockets, but timing *may* affect this.
			// For HTTP/2, it should always just use 1 socket per origin / SAN cluster.
			if ( version === 'http2' )
				expect( numAfter ).toEqual( numBefore + 1 );

			resps.forEach(
				( { expectedLang, gotLang, expectedTitle, gotTitle } ) =>
				{
					expect( gotLang ).toBe( expectedLang );
					expect( gotTitle ).toBe( expectedTitle );
				}
			);

			await disconnectAll( );
		} );
	} );
} );
} );
