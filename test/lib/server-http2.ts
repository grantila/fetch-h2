import {
	constants,
	createSecureServer,
	createServer,
	Http2Server,
	Http2Session,
	IncomingHttpHeaders,
	OutgoingHttpHeaders,
	ServerHttp2Stream,
} from "http2";
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

const {
	HTTP2_HEADER_PATH,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_CONTENT_LENGTH,
	HTTP2_HEADER_ACCEPT_ENCODING,
	HTTP2_HEADER_SET_COOKIE,
	HTTP2_HEADER_LOCATION,
} = constants;

export class ServerHttp2 extends TypedServer< Http2Server >
{
	private _sessions: Set< Http2Session >;
	private _awaits: Array< Promise< any > > = [ ];

	constructor( opts: ServerOptions )
	{
		super( );

		this._opts = opts || { };
		if ( this._opts.serverOptions )
			this._server = createSecureServer( this._opts.serverOptions );
		else
			this._server = createServer( );
		this._sessions = new Set( );
		this.port = null;

		this._server.on( "stream", ( stream, headers ) =>
		{
			const awaitStream = this.onStream( stream, headers )
			.catch( err =>
			{
				console.error( "Unit test server failed", err.stack );
				process.exit( 1 );
			} )
			.then( ( ) =>
			{
				const index = this._awaits.findIndex( promise =>
					promise === awaitStream );
				if ( index !== -1 )
					this._awaits.splice( index, 1 );
			} );

			this._awaits.push( awaitStream );
		} );
	}

	public async _shutdown( ): Promise< void >
	{
		for ( const session of this._sessions )
		{
			session.destroy( );
		}
		await Promise.all( this._awaits );
		this._sessions.clear( );
	}

	private async onStream(
		stream: ServerHttp2Stream,
		headers: IncomingHttpHeaders
	)
	: Promise< void >
	{
		this._sessions.add( stream.session );
		stream.session.once( "close", ( ) =>
			this._sessions.delete( stream.session ) );

		const path = headers[ HTTP2_HEADER_PATH ] as string;
		let m;

		if (headers.cookie) {
			this.receivedCookies.push(headers.cookie);
		}

		if ( path === "/headers" )
		{
			stream.respond( {
				":status": 200,
				"content-type": "application/json",
			} );

			stream.end( JSON.stringify( headers ) );
		}
		else if ( path === "/echo" )
		{
			const responseHeaders: OutgoingHttpHeaders = {
				":status": 200,
			};
			[ HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH ]
			.forEach( name =>
			{
				responseHeaders[ name ] = headers[ name ];
			} );

			stream.respond( responseHeaders );
			pipeline( stream, stream );
		}
		else if ( path === "/set-cookie" )
		{
			const responseHeaders: OutgoingHttpHeaders = {
				":status": 200,
				[ HTTP2_HEADER_SET_COOKIE ]: [ ],
			};

			const data = await getStreamBuffer( stream );
			const json = JSON.parse( data.toString( ) );
			json.forEach( ( cookie: any ) =>
			{
				( < any >responseHeaders[ HTTP2_HEADER_SET_COOKIE ] )
					.push( cookie );
			} );
			stream.respond( responseHeaders );
			stream.end( );
		}
		// tslint:disable-next-line
		else if ( m = path.match( /\/wait\/(.+)/ ) )
		{
			const timeout = parseInt( m[ 1 ], 10 );
			await delay( timeout );

			const responseHeaders: OutgoingHttpHeaders = {
				":status": 200,
			};
			[ HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH ]
			.forEach( name =>
			{
				responseHeaders[ name ] = headers[ name ];
			} );

			try
			{
				stream.respond( responseHeaders );
				pipeline( stream, stream );
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

			const data = await getStreamBuffer( stream );
			const json = JSON.parse( data.toString( ) );

			stream.once( "wantTrailers", ( ) =>
			{
				// TODO: Fix when @types/node is fixed
				(<any>stream).sendTrailers( json );
			} );

			stream.respond(
				responseHeaders,
				// TODO: Fix when @types/node is fixed
				<any>{
					waitForTrailers: true,
				}
			);

			stream.write( "trailers will be sent" );

			stream.end( );
		}
		else if ( path === "/sha256" )
		{
			const hash = createHash( "sha256" );

			const responseHeaders = {
				":status": 200,
			};
			stream.respond( responseHeaders );

			hash.on( "readable", ( ) =>
			{
				const data = < Buffer >hash.read( );
				if ( data )
				{
					stream.write( data.toString( "hex" ) );
					stream.end( );
				}
			} );

			pipeline( stream, hash );
		}
		else if ( path === "/push" )
		{
			const responseHeaders = {
				":status": 200,
			};

			const data = await getStreamBuffer( stream );
			const json = JSON.parse( data.toString( ) );

			json.forEach( ( pushable: any ) =>
			{
				function cb( err: Error | null, pushStream: ServerHttp2Stream )
				{
					if ( err )
						return;
					if ( pushable.data )
						pushStream.write( pushable.data );
					pushStream.end( );
				}
				stream.pushStream( pushable.headers || { }, cb );
			} );

			stream.respond( responseHeaders );
			stream.write( "push-route" );
			stream.end( );
		}
		else if ( path.startsWith( "/compressed/" ) )
		{
			const encoding = path.replace( "/compressed/", "" );

			const accept = headers[ HTTP2_HEADER_ACCEPT_ENCODING ] as string;

			if ( !accept.includes( encoding ) )
			{
				stream.destroy( );
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

			stream.respond( responseHeaders );
			if ( encoder )
				pipeline( stream, encoder, stream );
			else
				pipeline( stream, stream );
		}
		else if ( path.startsWith( "/goaway" ) )
		{
			const waitMs = path.startsWith( "/goaway/" )
				? parseInt( path.replace( "/goaway/", "" ), 10 )
				: 0;

			const responseHeaders = {
				":status": 200,
				[ HTTP2_HEADER_CONTENT_LENGTH ]: "10",
			};

			stream.respond( responseHeaders );

			stream.write( "abcde" );

			stream.session.goaway( );

			if ( waitMs > 0 )
				await delay( waitMs );

			ignoreError( ( ) => stream.write( "fghij" ) );
			ignoreError( ( ) => stream.end( ) );
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

			ignoreError( ( ) => stream.respond( responseHeaders ) );
			ignoreError( ( ) => stream.write( "abcde" ) );
			ignoreError( ( ) => stream.write( "fghij" ) );
			ignoreError( ( ) => stream.end( ) );
		}
		else if ( path.startsWith( "/slow/" ) )
		{
			const waitMs = parseInt( path.replace( "/slow/", "" ), 10 );

			const responseHeaders = {
				":status": 200,
				[ HTTP2_HEADER_CONTENT_LENGTH ]: "10",
			};

			stream.respond( responseHeaders );

			stream.write( "abcde" );

			if ( waitMs > 0 )
				await delay( waitMs );

			ignoreError( ( ) => stream.write( "fghij" ) );
			ignoreError( ( ) => stream.end( ) );
		}
		else if ( path.startsWith( "/prem-close" ) )
		{
			stream.close( );
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

			stream.respond( responseHeaders );
			stream.end( );
		}
		else
		{
			const matched = ( this._opts.matchers || [ ] )
				.some( matcher => matcher( { path, stream, headers } ) );

			if ( !matched )
			{
				stream.respond( { ":status": 400 } );
				stream.end( );
			}
		}

		if ( !stream.closed )
			return new Promise( resolve => stream.once( "close", resolve ) );
	}
}

export async function makeServer( opts: ServerOptions = { } )
: Promise< { server: Server; port: number | null; receivedCookies: Array<string> } >
{
	opts = opts || { };

	const server = new ServerHttp2( opts );
	await server.listen( opts.port );
	return { server, port: server.port, receivedCookies: server.receivedCookies };
}
