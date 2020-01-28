import { URL } from "url";
import * as fs from "fs";

import { delay, Finally } from "already";
import * as through2 from "through2";

import {
	context,
	DataBody,
	fetch as fetchType,
	HttpProtocols,
	JsonBody,
	StreamBody,
} from "../../index";


interface TestData
{
	scheme: string;
	site: string;
	protos: Array< HttpProtocols >;
	certs?: boolean;
}

const ca = fs.readFileSync( "/tmp/fetch-h2-certs/ca.pem" );
const cert = fs.readFileSync( "/tmp/fetch-h2-certs/cert.pem" );

const http1bin = `localhost:${process.env.HTTP1BIN_PORT}`;
const http2bin = `localhost:${process.env.HTTP2BIN_PORT}`;
const https1bin = `localhost:${process.env.HTTPS1PROXY_PORT}`;

( [
	{ scheme: "http:", site: http2bin, protos: [ "http2" ] },
	{ scheme: "http:", site: http1bin, protos: [ "http1" ] },
	{ scheme: "https:", site: https1bin, protos: [ "http1" ], certs: false },
	{ scheme: "https:", site: https1bin, protos: [ "http1" ], certs: true },
] as Array< TestData > )
.forEach( ( { site, scheme, protos, certs } ) =>
{
const host = `${scheme}//${site}`;
const baseHost = new URL( host ).origin;

const name = `${site} (${protos[ 0 ]} over ${scheme.replace( ":", "" )})` +
	( certs ? ' (using explicit certificates)' : '' );

describe( name, ( ) =>
{
	function wrapContext( fn: ( fetch: typeof fetchType ) => Promise< void > )
	{
		return async ( ) =>
		{
			const { fetch, disconnectAll } = context( {
				httpsProtocols: protos,
				session: certs
					? { ca, cert, rejectUnauthorized: false }
					: { rejectUnauthorized: false },
			} );

			await fn( fetch ).then( ...Finally( disconnectAll ) );
		};
	}

	it( "should be possible to GET", wrapContext( async ( fetch ) =>
	{
		const response = await fetch( `${host}/user-agent` );
		const data = await response.json( );
		expect( data[ "user-agent" ] ).toContain( "fetch-h2/" );
	} ) );

	it( "should be possible to POST JSON", wrapContext(
		async ( fetch ) =>
	{
		const testData = { foo: "bar" };

		const response = await fetch(
			`${host}/post`,
			{
				body: new JsonBody( testData ),
				method: "POST",
			}
		);
		const data = await response.json( );
		expect( testData ).toEqual( data.json );
		// fetch-h2 should set content type for JsonBody
		expect( data.headers[ "Content-Type" ] ).toBe( "application/json" );
	} ) );

	it( "should be possible to POST buffer-data", wrapContext(
		async ( fetch ) =>
	{
		const testData = '{"foo": "data"}';

		const response = await fetch(
			`${host}/post`,
			{
				body: new DataBody( testData ),
				method: "POST",
			}
		);
		const data = await response.json( );
		expect( data.data ).toBe( testData );
		expect( data.headers ).not.toHaveProperty( "Content-Type" );
	} ) );

	it( "should be possible to POST already ended stream-data",
		wrapContext( async ( fetch ) =>
	{
		const stream = through2( );

		stream.write( "foo" );
		stream.write( "bar" );
		stream.end( );

		const response = await fetch(
			`${host}/post`,
			{
				allowForbiddenHeaders: true,
				body: new StreamBody( stream ),
				headers: { "content-length": "6" },
				method: "POST",
			}
		);

		const data = await response.json( );
		expect( data.data ).toBe( "foobar" );
	} ) );

	it( "should be possible to POST not yet ended stream-data",
		wrapContext( async ( fetch ) =>
	{
		const stream = through2( );

		const eventualResponse = fetch(
			`${host}/post`,
			{
				allowForbiddenHeaders: true,
				body: new StreamBody( stream ),
				headers: { "content-length": "6" },
				method: "POST",
			}
		);

		await delay( 1 );

		stream.write( "foo" );
		stream.write( "bar" );
		stream.end( );

		const response = await eventualResponse;

		const data = await response.json( );
		expect( data.data ).toBe( "foobar" );
	} ) );

	it( "should save and forward cookies",
		wrapContext( async ( fetch ) =>
	{
		const responseSet = await fetch(
			`${host}/cookies/set?foo=bar`,
			{ redirect: "manual" } );

		expect( responseSet.headers.has( "location" ) ).toBe( true );
		const redirectedTo = responseSet.headers.get( "location" );

		const response = await fetch( baseHost + redirectedTo );

		const data = await response.json( );
		expect( data.cookies ).toEqual( { foo: "bar" } );
	} ) );

	it( "should handle (and follow) relative paths",
		wrapContext( async ( fetch ) =>
	{

		const response = await fetch(
			`${host}/relative-redirect/2`,
			{ redirect: "follow" } );

		expect( response.url ).toBe( `${host}/get` );
		await response.text( );
	} ) );

	it( "should be possible to GET gzip data", wrapContext(
		async ( fetch ) =>
	{
		const response = await fetch( `${host}/gzip` );
		const data = await response.json( );
		expect( data ).toMatchObject( { gzipped: true, method: "GET" } );
	} ) );
} );
} );
