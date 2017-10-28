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

		this._server.on( 'stream', this.onStream.bind( this ) );
	}

	private onStream( stream: ServerHttp2Stream, headers: IncomingHttpHeaders )
	: void
	{
		this._sessions.add( stream.session );
		stream.session.once( 'close', ( ) =>
			this._sessions.delete( stream.session) );

		const path = headers[ HTTP2_HEADER_PATH ];

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
