import { arrayify } from "./utils";


export type GuardTypes =
	"immutable" | "request" | "request-no-cors" | "response" | "none";

export interface RawHeaders
{
	[ key: string ]: string | Array< string > | undefined;
}

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
	if ( /[^A-Za-z0-9\-#$%&'*+.^_`|~]/.test( name ) )
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

export class Headers extends Map < string, string >
{
	protected _guard: GuardTypes;

	constructor( init?: RawHeaders | Headers )
	{
		super();
		this._guard = < GuardTypes >_guard || "none";
		_guard = null;

		const set = ( name: string, value: string ) =>
		{
			this.append( name, value );
		};

		if ( !init )
			return;

		else if ( init instanceof Headers )
		{
			for ( const [ name, value ] of init.entries( ) )
				set( name, value );
		}

		else
		{
			for ( const _name of Object.keys( init ) )
			{
				const name = filterName( _name );
				const value = arrayify( init[ _name ] )
					.map( val => `${val}` );
				set( name, [ ...value ].join(",") );
			}
		}
	}

	public append( name: string, value: string ): void
	{
		const _name = filterName( name );

		_ensureGuard( this._guard, _name, value );

		if ( !!super.get( _name ) )
			super.set( _name, super.get( _name ) + "," + value );

		else
			super.set( _name, value );
	}

	public delete( name: string ): boolean
	{
		const _name = filterName( name );

		_ensureGuard( this._guard );

		return super.delete( _name );
	}

	public get( name: string ): string | undefined
	{
		const _name = filterName( name );

		return super.get( _name );
	}

	public has( name: string ): boolean
	{
		return super.has( filterName( name ) );
	}

	public set( name: string, value: string ): this
	{
		const _name = filterName( name );

		_ensureGuard( this._guard, _name, value );

		return super.set( _name, value );
	}
}

export class GuardedHeaders extends Headers
{
	constructor( guard: GuardTypes, init?: RawHeaders | Headers )
	{
		super( ( _guard = guard, init ) );
		_guard = null;
	}
}

export function ensureHeaders( headers: RawHeaders | Headers | undefined )
{
	return headers instanceof Headers ? headers : new Headers( headers );
}
