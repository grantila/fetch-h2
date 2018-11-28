'use strict'

import {
	createServer,
	createSecureServer,
	Http2Server,
	Http2Session,
	Http2Stream,
	ServerHttp2Stream,
	IncomingHttpHeaders,
	SecureServerOptions,
	constants,
} from 'http2'

import { createHash } from 'crypto'
import { createGzip, createDeflate } from 'zlib'

import { buffer as getStreamAsBuffer } from 'get-stream'

import { delay } from 'already'

const {
	HTTP2_HEADER_PATH,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_CONTENT_LENGTH,
	HTTP2_HEADER_ACCEPT_ENCODING,
	HTTP2_HEADER_SET_COOKIE,
} = constants;

export interface MatchData
{
	path: string;
	stream: ServerHttp2Stream;
	headers: IncomingHttpHeaders;
}

export type Matcher = ( matchData: MatchData ) => boolean;

export interface ServerOptions
{
	port?: number;
	matchers?: ReadonlyArray< Matcher >;
	serverOptions?: SecureServerOptions;
}

const ignoreError = ( cb: ( ) => any ) => { try { cb( ); } catch ( err ) { } };

export class Server
{
	private _opts: ServerOptions;
	private _server: Http2Server;
	private _sessions: Set< Http2Session >;
	port: number;

	constructor( opts: ServerOptions )
	{
		this._opts = opts || { };
		if ( this._opts.serverOptions )
			this._server = createSecureServer( this._opts.serverOptions );
		else
			this._server = createServer( );
		this._sessions = new Set( );
		this.port = null;

		this._server.on( 'stream', ( stream, headers ) =>
		{
			this.onStream( stream, headers )
			.catch( err =>
			{
				console.error( "Unit test server failed", err );
				process.exit( 1 );
			} )
		} );
	}

	private async onStream(
		stream: ServerHttp2Stream,
		headers: IncomingHttpHeaders
	)
	: Promise< void >
	{
		this._sessions.add( stream.session );
		stream.session.once( 'close', ( ) =>
			this._sessions.delete( stream.session ) );

		const path = headers[ HTTP2_HEADER_PATH ] as string;
		let m;

		if ( path === '/headers' )
		{
			stream.respond( {
				'content-type': 'application/json',
				':status': 200,
			} );

			stream.end( JSON.stringify( headers ) );
		}
		else if ( path === '/echo' )
		{
			const responseHeaders = {
				':status': 200,
			};
			[ HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH ]
			.forEach( name =>
			{
				responseHeaders[ name ] = headers[ name ];
			} );

			stream.respond( responseHeaders );
			stream.pipe( stream );
		}
		else if ( path === '/set-cookie' )
		{
			const responseHeaders: any = {
				':status': 200,
				[ HTTP2_HEADER_SET_COOKIE ]: [ ],
			};

			const data = await getStreamAsBuffer( stream );
			const json = JSON.parse( data.toString( ) );
			json.forEach( cookie =>
			{
				responseHeaders[ HTTP2_HEADER_SET_COOKIE ].push( cookie )
			} );

			stream.respond( responseHeaders );
			stream.end( );
		}
		else if ( m = path.match( /\/wait\/(.+)/ ) )
		{
			const timeout = parseInt( m[ 1 ] );
			await delay( timeout );

			const responseHeaders = {
				':status': 200,
			};
			[ HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH ]
			.forEach( name =>
			{
				responseHeaders[ name ] = headers[ name ];
			} );

			try
			{
				stream.respond( responseHeaders );
				stream.pipe( stream );
			}
			catch ( err )
			// We ignore errors since this route is used to intentionally
			// timeout, which causes us to try to write to a closed stream.
			{ }
		}
		else if ( path === '/trailers' )
		{
			const responseHeaders = {
				':status': 200,
			};

			const data = await getStreamAsBuffer( stream );
			const json = JSON.parse( data.toString( ) );

			stream.once( 'wantTrailers', ( ) =>
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
		else if ( path === '/sha256' )
		{
			const hash = createHash( 'sha256' );

			const responseHeaders = {
				':status': 200,
			};
			stream.respond( responseHeaders );

			hash.on( 'readable', ( ) =>
			{
				const data = < Buffer >hash.read( );
				if ( data )
				{
					stream.write( data.toString( 'hex' ) );
					stream.end( );
				}
			} );

			stream.pipe( hash );
		}
		else if ( path === '/push' )
		{
			const responseHeaders = {
				':status': 200,
			};

			const data = await getStreamAsBuffer( stream );
			const json = JSON.parse( data.toString( ) );

			json.forEach( pushable =>
			{
				function cb( err: Error, pushStream: ServerHttp2Stream )
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
		else if ( path.startsWith( '/compressed/' ) )
		{
			const encoding = path.replace( '/compressed/', '' );

			const accept = headers[ HTTP2_HEADER_ACCEPT_ENCODING ] as string;

			if ( !accept.includes( encoding ) )
			{
				stream.destroy( );
				return;
			}

			const encoder =
				encoding === 'gzip'
				? createGzip( )
				: encoding === 'deflate'
				? createDeflate( )
				: null;

			const responseHeaders = {
				':status': 200,
				'content-encoding': encoding,
			};

			stream.respond( responseHeaders );
			stream.pipe( encoder ).pipe( stream );
		}
		else if ( path.startsWith( '/goaway' ) )
		{
			const waitMs = path.startsWith( '/goaway/' )
				? parseInt( path.replace( '/goaway/', '' ) )
				: 0;

			const responseHeaders = {
				':status': 200,
				[ HTTP2_HEADER_CONTENT_LENGTH ]: '10',
			};

			stream.respond( responseHeaders );

			stream.write( "abcde" );

			stream.session.goaway( );

			if ( waitMs > 0 )
				await delay( waitMs );

			ignoreError( ( ) => stream.write( "defgh" ) );
			ignoreError( ( ) => stream.end( ) );
		}
		else if ( path.startsWith( '/slow/' ) )
		{
			const waitMs = parseInt( path.replace( '/slow/', '' ) );

			const responseHeaders = {
				':status': 200,
				[ HTTP2_HEADER_CONTENT_LENGTH ]: '10',
			};

			stream.respond( responseHeaders );

			stream.write( "abcde" );

			if ( waitMs > 0 )
				await delay( waitMs );

			ignoreError( ( ) => stream.write( "defgh" ) );
			ignoreError( ( ) => stream.end( ) );
		}
		else
		{
			const matched = ( this._opts.matchers || [ ] )
				.some( matcher => matcher( { path, stream, headers } ) );

			if ( !matched )
			{
				stream.respond( { ':status': 400 } );
				stream.end( );
			}
		}
	}

	listen( port: number = void 0 ): Promise< number >
	{
		return new Promise( ( resolve, reject ) =>
		{
			this._server.listen( port, '0.0.0.0', resolve );
		} )
		.then( ( ) =>
		{
			const address = this._server.address( );
			if ( typeof address === 'string' )
				return 0;
			return address.port;
		} )
		.then( port =>
		{
			this.port = port;
			return port;
		} );
	}

	shutdown( ): Promise< void >
	{
		return new Promise< void >( ( resolve, reject ) =>
		{
			for ( let session of this._sessions )
			{
				session.destroy( );
			}
			this._server.close( resolve );
		} );
	}
}

export async function makeServer( opts: ServerOptions = { } )
: Promise< { server: Server; port: number; } >
{
	opts = opts || { };

	const server = new Server( opts );
	await server.listen( opts.port );
	return { server, port: server.port };
}
