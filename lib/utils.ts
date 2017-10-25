'use strict'

import { Try } from 'already'

export function arrayify< T >( value: T | Array< T > ): Array< T >;
export function arrayify< T >( value: Readonly< T > | ReadonlyArray< T > )
: Array< T >;
export function arrayify< T >( value: T | Array< T > ): Array< T >
{
	return Array.isArray( value ) ? value : [ value ];
}
