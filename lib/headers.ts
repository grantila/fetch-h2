import { arrayify } from "./utils";


export type GuardTypes =
	"immutable" | "request" | "request-no-cors" | "response" | "none";

export interface RawHeaders
{
	[ key: string ]: string | Array< string > | undefined;
}

type HeaderMap = Map< string, Array< string > >;


const forbiddenHeaders = [
	"accept-charset",
	"accept-encoding",
	"access-control-request-headers",
	"access-control-request-method",
	"connection",
	"content-length",
	"cookie",
	"cookie2",
	"date",
	"dnt",
	"expect",
	"host",
	"keep-alive",
	"origin",
	"referer",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"via",
];

function isForbiddenHeader( name: string ): boolean
{
	if ( name.startsWith( "proxy-" ) || name.startsWith( "sec-" ) )
		// Safe headers
		return false;

	return forbiddenHeaders.includes( name );
}

function isForbiddenResponseHeader( name: string )
{
	return [ "set-cookie", "set-cookie2" ].includes( name );
}

function isSimpleHeader( name: string, value?: string ): boolean
{
	const simpleHeaders = [
		"accept",
		"accept-language",
		"content-language",

		"dpr",
		"downlink",
		"save-data",
		"viewport-width",
		"width",
	];

	if ( simpleHeaders.includes( name ) )
		return true;

	if ( name !== "content-type" )
		return false;

	if ( value == null )
		return false;

	const mimeType = value.replace( /;.*/, "" ).toLowerCase( );

	return [
		"application/x-www-form-urlencoded",
		"multipart/form-data",
		"text/plain",
	].includes( mimeType );
}

function filterName( name: string ): string
{
	if ( /[^A-Za-z0-9\-#$%&'*+.\^_`|~]/.test( name ) )
		throw new TypeError(
			"Invalid character in header field name: " + name );

	return name.toLowerCase( );
}

function _ensureGuard(
	guard: GuardTypes,
	name?: string,
	value?: string
)
: void
{
	if ( guard === "immutable" )
		throw new TypeError(
			"Header guard error: Cannot change immutable header" );

	if ( !name )
		return;

	if ( guard === "request" && isForbiddenHeader( name ) )
		throw new TypeError(
			"Header guard error: " +
			"Cannot set forbidden header for requests" +
			` (${name})` );

	if ( guard === "request-no-cors" && !isSimpleHeader( name, value ) )
		throw new TypeError(
			"Header guard error: " +
			"Cannot set non-simple header for no-cors requests" +
			` (${name})` );

	if ( guard === "response" && isForbiddenResponseHeader( name ) )
		throw new TypeError(
			"Header guard error: " +
			"Cannot set forbidden response header for response" +
			` (${name})` );
}

let _guard: GuardTypes | null = null;

export class Headers
{
	protected _guard: GuardTypes;
	private _data: HeaderMap;

	constructor( init?: RawHeaders | Headers )
	{
		this._guard = < GuardTypes >_guard || "none";
		_guard = null;
		this._data = new Map( );

		const set = ( name: string, values: ReadonlyArray< string > ) =>
		{
			if ( values.length === 1 )
				this.set( name, values[ 0 ] );
			else
				for ( const value of values )
					this.append( name, value );
		};

		if ( !init )
			return;

		else if ( init instanceof Headers )
		{
			for ( const [ name, values ] of init._data.entries( ) )
				set( name, values );
		}

		else
		{
			for ( const _name of Object.keys( init ) )
			{
				const name = filterName( _name );
				const value = arrayify( init[ _name ] )
					.map( val => `${val}` );
				set( name, [ ...value ] );
			}
		}
	}

	public append( name: string, value: string ): void
	{
		const _name = filterName( name );

		_ensureGuard( this._guard, _name, value );

		if ( !this._data.has( _name ) )
			this._data.set( _name, [ value ] );

		else
			( < Array< string > >this._data.get( _name ) ).push( value );
	}

	public delete( name: string ): void
	{
		const _name = filterName( name );

		_ensureGuard( this._guard );

		this._data.delete( _name );
	}

	public *entries( ): IterableIterator< [ string, string ] >
	{
		for ( const [ name, value ] of this._data.entries( ) )
			yield [ name, value.join( "," ) ];
	}

	public get( name: string ): string | null
	{
		const _name = filterName( name );

		return this._data.has( _name )
			? ( < Array< string > >this._data.get( _name ) ).join( "," )
			: null;
	}

	public has( name: string ): boolean
	{
		return this._data.has( filterName( name ) );
	}

	public keys( ): IterableIterator< string >
	{
		return this._data.keys( );
	}

	public set( name: string, value: string ): void
	{
		const _name = filterName( name );

		_ensureGuard( this._guard, _name, value );

		this._data.set( _name, [ value ] );
	}

	public *values( ): IterableIterator< string >
	{
		for ( const value of this._data.values( ) )
			yield value.join( "," );
	}
}

export class GuardedHeaders extends Headers
{
	constructor( guard: GuardTypes, init?: RawHeaders | Headers )
	{
		super( ( _guard = guard, init ) );
	}
}

export function ensureHeaders( headers: RawHeaders | Headers | undefined )
{
	return headers instanceof Headers ? headers : new Headers( headers );
}
