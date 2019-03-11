import { URL } from "url";
import { createBrotliCompress } from "zlib";

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

export const identity = < T >( t: T ) => t;

export function uniq< T >( arr: ReadonlyArray< T > ): Array< T >;
export function uniq< T, U >( arr: ReadonlyArray< T >, pred: ( t: T ) => U )
: Array< T >;
export function uniq< T, U >( arr: ReadonlyArray< T >, pred?: ( t: T ) => U )
: Array< T >
{
	if ( !pred )
		return Array.from( new Set< T >( arr ) );

	const known = new Set< U >( );
	return arr.filter( value =>
	{
		const u = pred( value );
		const first = !known.has( u );

		known.add( u );

		return first;
	} );
}

export function hasBuiltinBrotli( )
{
	return typeof createBrotliCompress === "function";
}
