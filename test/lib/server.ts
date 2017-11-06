'use strict'

import {
	createServer,
	Http2Server,
	Http2Session,
	Http2Stream,
	ServerHttp2Stream,
	IncomingHttpHeaders,
	constants,
} from 'http2'

import { createHash } from 'crypto'

import { buffer as getStreamAsBuffer } from 'get-stream'

import { delay } from 'already'

const {
	HTTP2_HEADER_PATH,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_CONTENT_LENGTH,
} = constants;

export class Server
{
	private _server: Http2Server;
	private _sessions: Set< Http2Session >;
	port: number;

	constructor( )
	{
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
			this._sessions.delete( stream.session) );

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

			stream.respond(
				responseHeaders,
				{
					getTrailers( trailers )
					{
						Object.assign( trailers, json );
					}
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
				function cb( pushStream: ServerHttp2Stream )
				{
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
		else
		{
			stream.respond( { ':status': 400 } );
			stream.end( );
		}
	}

	listen( port: number = void 0 ): Promise< number >
	{
		return new Promise( ( resolve, reject ) =>
		{
			this._server.listen( port, '0.0.0.0', resolve );
		} )
		.then( ( ) => this._server.address( ).port )
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


export async function makeServer( port: number = null )
: Promise< { server: Server; port: number; } >
{
	const server = new Server( );
	await server.listen( port );
	return { server, port: server.port };
}
