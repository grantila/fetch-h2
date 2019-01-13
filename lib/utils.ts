import { URL } from "url";

export function arrayify< T >(
	value:
		T | Array< T > | Readonly< T > | ReadonlyArray< T > | undefined | null
)
: Array< T >
{
	if ( value != null && Array.isArray( value ) )
		return value;

	return value == null
		? [ ]
		: Array.isArray( value )
		? [ ...value ]
		: [ value ];
}

export function parseLocation(
	location: string | Array< string > | undefined, origin: string
)
{
	if ( "string" !== typeof location )
		return null;

	const url = new URL( location, origin );
	return url.href;
}

export const isRedirectStatus: { [ status: string ]: boolean; } = {
	300: true,
	301: true,
	302: true,
	303: true,
	305: true,
	307: true,
	308: true,
};

export function makeOkError( err: Error ): Error
{
	( < any >err ).metaData = ( < any >err ).metaData || { };
	( < any >err ).metaData.ok = true;
	return err;
}

export function parseInput( url: string )
{
	const explicitProtocol =
		( url.startsWith( "http2://" ) || url.startsWith( "http1://" ) )
		? url.substr( 0, 5 )
		: null;

	url = url.replace( /^http[12]:\/\//, "http://" );

	const { origin, hostname, port, protocol } = new URL( url );

	return {
		hostname,
		origin,
		port: port || ( protocol === "https:" ? "443" : "80" ),
		protocol: explicitProtocol || protocol.replace( ":", "" ),
		url,
	};
}
