import {
	Server as HttpServer,
} from "http";
import {
	Http2Server,
	IncomingHttpHeaders,
	SecureServerOptions,
	ServerHttp2Stream,
} from "http2";
import {
	Server as HttpsServer,
} from "https";

import { HttpProtocols } from "../../";


export interface TestData
{
	proto: "http:" | "https:";
	version: HttpProtocols;
}

export interface MatchData
{
	path: string;
	stream: ServerHttp2Stream;
	headers: IncomingHttpHeaders;
}

export type Matcher = ( matchData: MatchData ) => boolean;

export const ignoreError = ( cb: ( ) => any ) => { try { cb( ); } catch ( err ) { } };

export interface ServerOptions
{
	port?: number;
	matchers?: ReadonlyArray< Matcher >;
	serverOptions?: SecureServerOptions;
}

export abstract class Server
{
	public port: number | null = null;
	protected _opts: ServerOptions = { };
	protected _server: HttpServer | HttpsServer | Http2Server = < any >void 0;


	public async listen( port: number | undefined = void 0 ): Promise< number >
	{
		return new Promise( ( resolve, _reject ) =>
		{
			this._server.listen( port, "0.0.0.0", resolve );
		} )
		.then( ( ) =>
		{
			const address = this._server.address( );
			if ( !address || typeof address === "string" )
				return 0;
			return address.port;
		} )
		.then( port =>
		{
			this.port = port;
			return port;
		} );
	}

	public async shutdown( ): Promise< void >
	{
		await this._shutdown( );
		return new Promise< void >( ( resolve, reject ) =>
		{
			this._server.close( ( err?: Error ) =>
			{
				if ( err )
					return reject( err );
				resolve( );
			} );
		} );
	}

	protected async _shutdown( ): Promise< void > { }
}

export abstract class TypedServer
< ServerType extends HttpServer | HttpsServer | Http2Server  >
extends Server
{
	protected _server: ServerType = < any >void 0;
}
