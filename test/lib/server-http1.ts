import {
	createServer,
	IncomingMessage,
	Server as HttpServer,
	ServerResponse,
} from "http";
import {
	constants as h2constants,
} from "http2";
import {
	createServer as createSecureServer,
	Server as HttpsServer,
} from "https";
import { Duplex } from "stream";
import { pipeline } from "../../lib/utils";

import { createHash } from "crypto";
import { createBrotliCompress, createDeflate, createGzip } from "zlib";

import { delay } from "already";
import { buffer as getStreamBuffer } from "get-stream";

import {
	ignoreError,
	Server,
	ServerOptions,
	TypedServer,
} from "./server-common";

// These are the same in HTTP/1 and HTTP/2
const {
	HTTP2_HEADER_ACCEPT_ENCODING,
	HTTP2_HEADER_CONTENT_LENGTH,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_SET_COOKIE,
	HTTP2_HEADER_LOCATION,
} = h2constants;

interface RawHeaders
{
	[ name: string ]: number | string | Array< string >;
}

export class ServerHttp1 extends TypedServer< HttpServer | HttpsServer >
{
	private _store = new Set< Duplex >( );

	constructor( opts: ServerOptions )
	{
		super( );

		this._opts = opts || { };
		if ( this._opts.serverOptions )
			this._server = createSecureServer( this._opts.serverOptions );
		else
			this._server = createServer( );
		this.port = null;

		this._server.on(
			"connection",
			socket => { this._store.add( socket ); }
		);

		this._server.on(
			"request",
			( request: IncomingMessage, response: ServerResponse ) =>
			{
				this.onRequest( request, response )
				.catch( err =>
				{
					console.error( "Unit test server failed", err );
					process.exit( 1 );
				} );
			}
		);
	}

	public async _shutdown( ): Promise< void >
	{
		for ( const socket of this._store )
		{
			socket.destroy( );
		}
		this._store.clear( );
	}

	private async onRequest(
		request: IncomingMessage, response: ServerResponse
	)
	: Promise< void >
	{
		const { url: path, headers } = request;
		let m;

		if ( path == null )
			throw new Error( "Internal test error" );

		const sendHeaders = ( headers: RawHeaders ) =>
		{
			const { ":status": status = 200, ...rest } = { ...headers };

			response.statusCode = status;

			for ( const [ key, value ] of Object.entries( rest ) )
				response.setHeader( key, value );
		};

		if ( path === "/headers" )
		{
			sendHeaders( {
				":status": 200,
				"content-type": "application/json",
			} );

			response.end( JSON.stringify( headers ) );
		}
		else if ( path === "/echo" )
		{
			const responseHeaders: RawHeaders = {
				":status": 200,
			};
			[ HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH ]
			.forEach( name =>
			{
				const value = headers[ name ];
				if ( value != null )
					responseHeaders[ name ] = value;
			} );

			sendHeaders( responseHeaders );
			pipeline( request, response );
		}
		else if ( path === "/set-cookie" )
		{
			const responseHeaders: RawHeaders = {
				":status": 200,
				[ HTTP2_HEADER_SET_COOKIE ]: [ ],
			};

			const data = await getStreamBuffer( request );
			const json = JSON.parse( data.toString( ) );
			json.forEach( ( cookie: any ) =>
			{
				( < any >responseHeaders[ HTTP2_HEADER_SET_COOKIE ] )
					.push( cookie );
			} );

			sendHeaders( responseHeaders );
			response.end( );
		}
		// tslint:disable-next-line
		else if ( m = path.match( /\/wait\/(.+)/ ) )
		{
			const timeout = parseInt( m[ 1 ], 10 );
			await delay( timeout );

			const responseHeaders: RawHeaders = {
				":status": 200,
			};
			[ HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH ]
			.forEach( name =>
			{
				const value = headers[ name ];
				if ( value != null )
					responseHeaders[ name ] = value;
			} );

			try
			{
				sendHeaders( responseHeaders );
				pipeline( request, response );
			}
			catch ( err )
			// We ignore errors since this route is used to intentionally
			// timeout, which causes us to try to write to a closed stream.
			{ }
		}
		else if ( path === "/trailers" )
		{
			const responseHeaders = {
				":status": 200,
			};

			const data = await getStreamBuffer( request );
			const json = JSON.parse( data.toString( ) );

			sendHeaders( responseHeaders );

			response.write( "trailers will be sent" );

			response.addTrailers( json );

			response.end( );
		}
		else if ( path === "/sha256" )
		{
			const hash = createHash( "sha256" );

			const responseHeaders = {
				":status": 200,
			};
			sendHeaders( responseHeaders );

			hash.on( "readable", ( ) =>
			{
				const data = < Buffer >hash.read( );
				if ( data )
				{
					response.write( data.toString( "hex" ) );
					response.end( );
				}
			} );

			pipeline( request, hash );
		}
		else if ( path.startsWith( "/compressed/" ) )
		{
			const encoding = path.replace( "/compressed/", "" );

			const accept = headers[ HTTP2_HEADER_ACCEPT_ENCODING ] as string;

			if ( !accept.includes( encoding ) )
			{
				response.end( );
				return;
			}

			const encoder =
				encoding === "gzip"
				? createGzip( )
				: encoding === "deflate"
				? createDeflate( )
				: encoding === "br"
				? createBrotliCompress( )
				: null;

			const responseHeaders = {
				":status": 200,
				"content-encoding": encoding,
			};

			sendHeaders( responseHeaders );
			if ( encoder )
				pipeline( request, encoder, response );
			else
				pipeline( request, response );
		}
		else if ( path.startsWith( "/delay/" ) )
		{
			const waitMs = parseInt( path.replace( "/delay/", "" ), 10 );

			if ( waitMs > 0 )
				await delay( waitMs );

			const responseHeaders = {
				":status": 200,
				[ HTTP2_HEADER_CONTENT_LENGTH ]: "10",
			};

			sendHeaders( responseHeaders );

			response.write( "abcde" );

			ignoreError( ( ) => response.write( "fghij" ) );
			ignoreError( ( ) => response.end( ) );
		}
		else if ( path.startsWith( "/slow/" ) )
		{
			const waitMs = parseInt( path.replace( "/slow/", "" ), 10 );

			const responseHeaders = {
				":status": 200,
				[ HTTP2_HEADER_CONTENT_LENGTH ]: "10",
			};

			sendHeaders( responseHeaders );

			response.write( "abcde" );

			if ( waitMs > 0 )
				await delay( waitMs );

			ignoreError( ( ) => response.write( "fghij" ) );
			ignoreError( ( ) => response.end( ) );
		}
		else if ( path.startsWith( "/prem-close" ) )
		{
			request.socket.destroy( );
		}
		else if ( path.startsWith( "/redirect/" ) )
		{
			const redirectTo =
				path.slice( 10 ).startsWith( "http" )
				? path.slice( 10 )
				: path.slice( 9 );

			const responseHeaders = {
				":status": 302,
				[ HTTP2_HEADER_LOCATION ]: redirectTo,
			};

			sendHeaders( responseHeaders );
			response.end( );
		}
		else
		{
			response.end( );
		}
	}
}

export async function makeServer( opts: ServerOptions = { } )
: Promise< { server: Server; port: number | null; } >
{
	opts = opts || { };

	const server = new ServerHttp1( opts );
	await server.listen( opts.port );
	return { server, port: server.port };
}
