import { PeerCertificate } from "tls"


export type AltNameMatcher =  ( name: string ) => boolean;

export interface AltNameMatch
{
	names: Array< string >;
	dynamic?: AltNameMatcher;
}


function getNames( cert: PeerCertificate )
{
	const CN = cert.subject?.CN;
	const sans = ( cert.subjectaltname ?? '' )
		.split( ',' )
		.map( name => name.trim( ) )
		.filter( name => name.startsWith( 'DNS:' ) )
		.map( name => name.substr( 4 ) );

	if ( cert.subjectaltname )
		// Ignore CN if SAN:s are present; https://stackoverflow.com/a/29600674
		return [ ...new Set( sans ) ];
	else
		return [ CN ];
}

export function makeRegex( name: string )
{
	return "^" + name
		.split( '*' )
		.map( part => part.replace( /[^a-zA-Z0-9]/g, val => `\\${val}` ) )
		.join( '[^.]+' ) + "$";
}

function makeMatcher( regexes: ReadonlyArray< RegExp > ): AltNameMatcher
{
	return ( name: string ) => regexes.some( regex => name.match( regex ) );
}

export function parseOrigin( cert?: PeerCertificate ): AltNameMatch
{
	const names: Array< string > = [ ];
	const regexes: Array< RegExp > = [ ];

	if ( cert )
	{
		getNames( cert ).forEach( name =>
		{
			if ( name.match( /.*\*.*\*.*/ ) )
				throw new Error( `Invalid CN/subjectAltNames: ${name}` );

			if ( name.includes( "*" ) )
				regexes.push( new RegExp( makeRegex( name ) ) );
			else
				names.push( name );
		} );
	}

	const ret: AltNameMatch = {
		names,
		...( !regexes.length ? { } : { dynamic: makeMatcher( regexes ) } ),
	};

	return ret;
}
