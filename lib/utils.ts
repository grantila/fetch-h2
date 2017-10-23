'use strict'

import { Try } from 'already'

export function arrayify< T >( value: T | Array< T > ): Array< T >;
export function arrayify< T >( value: Readonly< T > | ReadonlyArray< T > )
: Array< T >;
export function arrayify< T >( value: T | Array< T > ): Array< T >
{
	return Array.isArray( value ) ? value : [ value ];
}


export type GuardFunAny =
	( fn: ( ...args ) => void | PromiseLike< void > ) =>
		( ...args ) =>
			void;

export function makeGuard( rejector: ( err: Error ) => void )
: GuardFunAny
{
	return function( fn: ( ...args ) => void | PromiseLike< void > )
	{
		return function( ...args )
		{
			Try( ( ) => fn( ...args ) )
			.catch( err => rejector( err ) );
		}
	}
}
