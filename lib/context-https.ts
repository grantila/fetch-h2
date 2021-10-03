import { SecureClientSessionOptions } from "http2";
import { connect, ConnectionOptions, TLSSocket } from "tls";

import { HttpProtocols } from "./core";
import { AltNameMatch, parseOrigin } from "./san";


const needsSocketHack = [ "12", "13" ]
	.includes( process.versions.node.split( '.' )[ 0 ] );

const alpnProtocols =
{
	http1: Buffer.from( "\x08http/1.1" ),
	http2: Buffer.from( "\x02h2" ),
};

export interface HttpsSocketResult
{
	socket: TLSSocket;
	protocol: "http1" | "http2";
	altNameMatch: AltNameMatch;
}

const defaultMethod: Array< HttpProtocols > = [ "http2", "http1" ];

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
		( _protocols.length !== 0 ? _protocols : defaultMethod )
		.map( protocol => alpnProtocols[ protocol ] )
	);

	const opts: ConnectionOptions = {
		...connOpts,
		ALPNProtocols: orderedProtocols,
		servername: host,
	};

	return new Promise< HttpsSocketResult >( ( resolve, reject ) =>
	{
		const socket: TLSSocket = connect( parseInt( port, 10 ), host, opts,
			( ) =>
		{
			const { authorized, authorizationError, alpnProtocol = "" } =
				socket;
			const cert = socket.getPeerCertificate( );
			const altNameMatch = parseOrigin( cert );

			if ( !authorized && opts.rejectUnauthorized !== false )
				return reject( authorizationError );

			if (
				!alpnProtocol ||
				![ "h2", "http/1.1", "http/1.0" ].includes( alpnProtocol )
			)
			{
				// Maybe the server doesn't understand ALPN, enforce
				// user-provided protocol, or fallback to HTTP/1
				if ( _protocols.length === 1 )
					return resolve( {
						altNameMatch,
						protocol: _protocols[ 0 ],
						socket,
					} );
				else
					return resolve( {
						altNameMatch,
						protocol: "http1",
						socket,
					} );
			}

			const protocol = alpnProtocol === "h2" ? "http2" : "http1";

			resolve( { socket, protocol, altNameMatch } );
		} );

		if ( needsSocketHack )
			socket.once( 'secureConnect', ( ) =>
			{
				( socket as any ).secureConnecting = false;
			} );

		socket.once( "error", reject );
	} );
}
