'use strict'

import { arrayify } from './utils'


export const Guards =
	[ 'immutable', 'request', 'request-no-cors', 'response', 'none' ];
export type GuardTypes =
	'immutable' | 'request' | 'request-no-cors' | 'response' | 'none';

export type RawHeaders = { [ key: string ]: string | string[] };

type HeaderMap = Map< string, Array< string > >;


const forbiddenHeaders = [
	'accept-charset',
	'accept-encoding',
	'access-control-request-headers',
	'access-control-request-method',
	'connection',
	'content-length',
	'cookie',
	'cookie2',
	'date',
	'dnt',
	'expect',
	'host',
	'keep-alive',
	'origin',
	'referer',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'via',
];

function isForbiddenHeader( name: string ): boolean
{
	if ( name.startsWith( 'proxy-' ) || name.startsWith( 'sec-' ) )
		// Safe headers
		return false;

	return forbiddenHeaders.includes( name );
}

function isForbiddenResponseHeader( name: string )
{
	return [ 'set-cookie', 'set-cookie2' ].includes( name );
}

function isSimpleHeader( name: string, value: string ): boolean
{
	const simpleHeaders = [
		'accept',
		'accept-language',
		'content-language',

		'dpr',
		'downlink',
		'save-data',
		'viewport-width',
		'width',
	];

	if ( simpleHeaders.includes( name ) )
		return true;

	if ( name !== 'content-type' )
		return false;

	const mimeType = value.replace( /;.*/, '' ).toLowerCase( );

	return [
		'application/x-www-form-urlencoded',
		'multipart/form-data',
		'text/plain'
	].includes( mimeType );
}

function filterName( name: string ): string
{
	if ( /[^A-Za-z0-9\-#$%&'*+.\^_`|~]/.test( name ) )
		throw new TypeError( 'Invalid character in header field name' );

	return name.toLowerCase( );
}

function _ensureGuard(
	guard: GuardTypes,
	name?: string,
	value?: string
)
: void
{
	if ( guard === 'immutable' )
		throw new TypeError(
			'Header guard error: Cannot change immutable header' );

	if ( !name )
		return;

	if ( guard === 'request' && isForbiddenHeader( name ) )
		throw new TypeError(
			'Header guard error: ' +
			'Cannot set forbidden header for requests' +
			` (${name})` );

	if ( guard === 'request-no-cors' && !isSimpleHeader( name, value ) )
		throw new TypeError(
			'Header guard error: ' +
			'Cannot set non-simple header for no-cors requests' +
			` (${name})` );

	if ( guard === 'response' && isForbiddenResponseHeader( name ) )
		throw new TypeError(
			'Header guard error: ' +
			'Cannot set forbidden response header for response' +
			` (${name})` );
}

let _guard = null;

export class Headers
{
	protected _guard: GuardTypes;
	private _data: HeaderMap;

	constructor( init?: RawHeaders | Headers )
	{
		this._guard = _guard || 'none';
		_guard = null;
		this._data = new Map( );

		if ( !init )
			return;

		else if ( init instanceof Headers )
		{
			for ( let [ name, value ] of init._data.entries( ) )
				this._data.set( name, [ ...value ] );
		}

		else
		{
			for ( let _name of Object.keys( init ) )
			{
				const name = filterName( _name );
				const value = arrayify( init[ name ] );
				this._data.set( name, [ ...value ] );
			}
		}
	}

	append( name: string, value: string ): void
	{
		const _name = filterName( name );

		_ensureGuard( this._guard, _name, value );

		if ( !this._data.has( _name ) )
			this._data.set( _name, [ value ] );

		else
			this._data.get( _name ).push( value );
	}

	delete( name: string ): void
	{
		const _name = filterName( name );

		_ensureGuard( this._guard );

		this._data.delete( _name );
	}

	*entries( ): IterableIterator< [ string, string ] >
	{
		for ( let [ name ] of this._data.entries( ) )
			yield [ name, this._data.get( name ).join( ',' ) ];
	}

	get( name: string ): string
	{
		const _name = filterName( name );

		return this._data.has( name )
			? this._data.get( name ).join( ',' )
			: null;
	}

	has( name: string ): boolean
	{
		return this._data.has( filterName( name ) );
	}

	keys( ): IterableIterator< string >
	{
		return this._data.keys( );
	}

	set( name: string, value: string ): void
	{
		const _name = filterName( name );

		_ensureGuard( this._guard, _name, value );

		this._data.set( _name, [ value ] );
	}

	*values( ): IterableIterator< string >
	{
		for ( let value of this._data.values( ) )
			yield value.join( ',' );
	}
}

export class GuardedHeaders extends Headers
{
	constructor( guard: GuardTypes, init?: RawHeaders | Headers )
	{
		super( ( _guard = guard, init ) );
	}
}
