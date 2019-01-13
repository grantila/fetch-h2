// tslint:disable-next-line
import { fetch, setup, HttpProtocols } from "..";

async function work( )
{
	const args = process.argv.slice( 2 );

	const [ method, url, version, insecure ] = args;

	const rejectUnauthorized = insecure !== "insecure";

	setup( {
		http1: {
			keepAlive: false,
		},
		...(
			!version ? { } : {
				httpProtocol: version as HttpProtocols,
				httpsProtocols: [ version as HttpProtocols ],
			}
		),
		session: { rejectUnauthorized },
	} );

	const response = await fetch(
		url,
		{
			method: < any >method,
		}
	);

	const readable = await response.readable( );

	readable.pipe( process.stdout );
}

work( )
// tslint:disable-next-line
.catch( err => { console.error( err.stack ); } );
