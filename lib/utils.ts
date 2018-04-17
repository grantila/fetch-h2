'use strict'

import { URL } from 'url'
import { Try } from 'already'

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
