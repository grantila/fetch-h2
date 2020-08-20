// tslint:disable-next-line
import { fetch, setup, HttpProtocols } from "..";
import { pipeline } from "stream";

// tslint:disable no-console

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
			redirect: 'follow',
		}
	);

	pipeline( await response.readable( ), process.stdout, err =>
	{
		if ( !err )
			return;

		console.error( "Failed to fetch", err.stack );
		process.exit( 1 );
	} )
}

work( )
.catch( err => { console.error( err, err.stack ); } );
