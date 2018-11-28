'use strict'

import { ClientHttp2Session } from 'http2'
import { URL } from 'url'

export function arrayify< T >( value: T | Array< T > ): Array< T >;
export function arrayify< T >( value: Readonly< T > | ReadonlyArray< T > )
: Array< T >;
export function arrayify< T >( value: T | Array< T > ): Array< T >
{
	return Array.isArray( value ) ? value : [ value ];
}

export function parseLocation( location: string, origin: string )
{
	if ( 'string' !== typeof location )
		return null;

	const url = new URL( location, origin );
	return url.href;
}

export function hasGotGoaway( session: ClientHttp2Session )
{
	return !!( < any >session ).__fetch_h2_goaway;
}

export function setGotGoaway( session: ClientHttp2Session )
{
	( < any >session ).__fetch_h2_goaway = true;
}
