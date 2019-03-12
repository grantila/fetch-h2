import { readFileSync } from "fs";
import * as path from "path";

import {
	ServerOptions,
	TestData,
} from "./server-common";
import {
	makeServer as makeServer1,
} from "./server-http1";
import {
	makeServer as makeServer2,
} from "./server-http2";


const key = readFileSync( path.join( process.cwd(), "certs", "key.pem" ) );
const cert = readFileSync( path.join( process.cwd(), "certs", "cert.pem" ) );

export function makeMakeServer( { proto, version }: TestData )
{
	const makeServer = ( opts?: ServerOptions ) =>
	{
		const serverOptions =
			( opts && opts.serverOptions ) ? opts.serverOptions : { };

		if ( proto === "https:" )
		{
			opts = {
				serverOptions: {
					cert,
					key,
					...serverOptions,
				},
				...( opts ? opts : { } ),
			};
		}

		return version === "http1"
			? makeServer1( opts )
			: makeServer2( opts );
	};

	const cycleOpts = {
		httpProtocol: version,
		httpsProtocols: [ version ],
		session: { rejectUnauthorized: false },
	};

	return { makeServer, cycleOpts };
}
