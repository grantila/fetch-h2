import { URL } from "url";

import { delay } from "already";
import { expect } from "chai";
import "mocha";
import * as through2 from "through2";

import {
	context,
	DataBody,
	HttpProtocols,
	JsonBody,
	StreamBody,
} from "../../";


interface TestData
{
	protocol: string;
	site: string;
	protos: Array< HttpProtocols >;
}

( [
	{ protocol: "https:", site: "nghttp2.org/httpbin", protos: [ "http2" ] },
	{ protocol: "http:", site: "httpbin.org", protos: [ "http1" ] },
	{ protocol: "https:", site: "httpbin.org", protos: [ "http1" ] },
] as Array< TestData > )
.forEach( ( { site, protocol, protos } ) =>
{
const host = `${protocol}//${site}`;
const baseHost = new URL( host ).origin;

const name = `${site} (${protos[ 0 ]} over ${protocol.replace( ":", "" )})`;

describe( name, function( )
{
	this.timeout( 5000 );

	const { fetch, disconnectAll } = context( {
		httpsProtocols: protos,
	} );

	afterEach( disconnectAll );

	it( "should be possible to GET", async ( ) =>
	{
		const response = await fetch( `${host}/user-agent` );
		const data = await response.json( );
		expect( data[ "user-agent" ] ).to.include( "fetch-h2/" );
	} );

	it( "should be possible to POST JSON", async ( ) =>
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
		expect( testData ).to.deep.equal( data.json );
		// fetch-h2 should set content type for JsonBody
		expect( data.headers[ "Content-Type" ] ).to.equal( "application/json" );
	} );

	it( "should be possible to POST buffer-data", async ( ) =>
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
		expect( data.data ).to.equal( testData );
		expect( Object.keys( data.headers ) ).to.not.contain( "Content-Type" );
	} );

	it( "should be possible to POST already ended stream-data", async ( ) =>
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
		expect( data.data ).to.equal( "foobar" );
	} );

	it( "should be possible to POST not yet ended stream-data", async ( ) =>
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
		expect( data.data ).to.equal( "foobar" );
	} );

	it( "should save and forward cookies", async ( ) =>
	{
		const { fetch, disconnectAll } = context( );

		const responseSet = await fetch(
			`${host}/cookies/set?foo=bar`,
			{ redirect: "manual" } );

		expect( responseSet.headers.has( "location" ) ).to.be.true;
		const redirectedTo = responseSet.headers.get( "location" );

		const response = await fetch( baseHost + redirectedTo );

		const data = await response.json( );
		expect( data.cookies ).to.deep.equal( { foo: "bar" } );

		await disconnectAll( );
	} );

	it( "should handle (and follow) relative paths", async ( ) =>
	{
		const { fetch, disconnectAll } = context( );

		const response = await fetch(
			`${host}/relative-redirect/2`,
			{ redirect: "follow" } );

		expect( response.url ).to.equal( `${host}/get` );
		await response.text( );

		await disconnectAll( );
	} );

	it( "should be possible to GET gzip data", async ( ) =>
	{
		const response = await fetch( `${host}/gzip` );
		const data = await response.json( );
		expect( data ).to.deep.include( { gzipped: true, method: "GET" } );
	} );
} );
} );
