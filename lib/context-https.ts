import { SecureClientSessionOptions } from "http2";
import { connect, ConnectionOptions, TLSSocket } from "tls";

import { FetchError, HttpProtocols } from "./core";

const alpnProtocols =
{
	http1: Buffer.from( "\x08http/1.1" ),
	http2: Buffer.from( "\x02h2" ),
};

export interface HttpsSocketResult
{
	socket: TLSSocket;
	protocol: "http1" | "http2";
}

export function connectTLS(
	host: string,
	port: string,
	protocols: ReadonlyArray< HttpProtocols >,
	connOpts: SecureClientSessionOptions
): Promise< HttpsSocketResult >
{
	const usedProtocol = new Set< string >( );
	const _protocols = protocols.filter( protocol =>
	{
		if ( protocol !== "http1" && protocol !== "http2" )
			return false;
		if ( usedProtocol.has( protocol ) )
			return false;
		usedProtocol.add( protocol );
		return true;
	} );

	const orderedProtocols = Buffer.concat(
		_protocols.map( protocol => alpnProtocols[ protocol ] )
	);

	const opts: ConnectionOptions = {
		...connOpts,
		ALPNProtocols: orderedProtocols,
		servername: host,
	};

	return new Promise< HttpsSocketResult >( ( resolve, reject ) =>
	{
		const socket: TLSSocket = connect( parseInt( port, 10 ), host, opts, ( ) =>
		{
			const { authorized, authorizationError, alpnProtocol = "" } =
				socket;

			if ( !authorized && opts.rejectUnauthorized !== false )
				return reject( authorizationError );

			if ( ![ "h2", "http/1.1", "http/1.0" ].includes( alpnProtocol ) )
				return reject( new FetchError( "Invalid ALPN response" ) );

			const protocol = alpnProtocol === "h2" ? "http2" : "http1";

			resolve( { socket, protocol } );
		} );

		socket.once( "error", reject );
	} );
}
