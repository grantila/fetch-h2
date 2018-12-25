import { createHash } from 'crypto'

import { buffer as getStreamAsBuffer } from 'get-stream'
import * as through2 from 'through2'
import * as toArrayBuffer from 'to-arraybuffer'
import { tap } from 'already'

import { IBody, BodyTypes, StorageBodyTypes } from './core'


function makeUnknownDataError( )
{
	return new Error( "Unknown body data" );
}

function throwUnknownData( ): never
{
	throw makeUnknownDataError( );
}

function throwIntegrityMismatch( ): never
{
	throw new Error( "Resource integrity mismatch" );
}

function throwLengthMismatch( ): never
{
	throw new RangeError(
		"Resource length mismatch (possibly incomplete body)" );
}

function parseIntegrity( integrity: string )
{
	const [ algorithm, ...expectedHash ] = integrity.split( '-' );
	return { algorithm, hash: expectedHash.join( '-' ) };
}

function isStream( body: StorageBodyTypes ): boolean
{
	return body &&
		( 'readable' in ( < NodeJS.ReadableStream >Object( body ) ) );
}

const emptyBuffer = new ArrayBuffer( 0 );

export class Body implements IBody
{
	private _body?: StorageBodyTypes | null;
	protected _length: number | null;
	private _used: boolean;
	protected _mime?: string;
	private _integrity?: string;
	// @ts-ignore
	readonly bodyUsed: boolean;

	constructor( )
	{
		this._length = null;
		this._used = false;

		Object.defineProperties( this, {
			bodyUsed: {
				enumerable: true,
				get: ( ) => this._used
			}
		} );
	}

	private validateIntegrity< T extends Buffer | ArrayBuffer >(
		data: T,
		allowIncomplete: boolean
	)
	: T
	{
		if (
			!allowIncomplete &&
			this._length != null &&
			data.byteLength != this._length
		)
			throwLengthMismatch( );

		if ( !this._integrity )
			// This is valid
			return data;

		const { algorithm, hash: expectedHash } =
			parseIntegrity( this._integrity );

		const hash = createHash( algorithm )
			.update(
				data instanceof ArrayBuffer
				? new DataView( data ) as any
				: < Buffer >data
			)
			.digest( 'base64' );

		if ( expectedHash.toLowerCase( ) !== hash.toLowerCase( ) )
			throwIntegrityMismatch( );

		return data;
	}

	protected hasBody( ): boolean
	{
		return '_body' in this;
	}

	protected setBody(
		body: BodyTypes | IBody | null,
		mime?: string | null,
		integrity?: string | null,
		length: number | null = null
	)
	: void
	{
		this._ensureUnused( );
		this._length = length;
		this._used = false;

		if ( body instanceof Body )
		{
			body._ensureUnused( );
			this._body = body._body;
			this._mime = body._mime;
		}
		else if ( typeof body === 'string' )
			this._body = Buffer.from( body );
		else if ( body != null )
			this._body = < StorageBodyTypes >body;
		else
			this._body = body;

		if ( Buffer.isBuffer( this._body ) )
			this._length = ( < Buffer >this._body ).length;

		if ( mime )
			this._mime = mime;

		if ( integrity )
			this._integrity = integrity;
	}

	private _ensureUnused( )
	{
		if ( this._used )
			throw new ReferenceError( "Body already used" );
		this._used = true;
	}

	async arrayBuffer( allowIncomplete = false ): Promise< ArrayBuffer >
	{
		this._ensureUnused( );

		if ( this._body == null )
			return this.validateIntegrity( emptyBuffer, allowIncomplete );

		else if ( isStream( this._body ) )
			return getStreamAsBuffer( < NodeJS.ReadableStream >this._body )
			.then( buffer =>
				this.validateIntegrity( buffer, allowIncomplete )
			)
			.then( buffer => toArrayBuffer( buffer ) );

		else if ( Buffer.isBuffer( this._body ) )
			return this.validateIntegrity(
				toArrayBuffer( < Buffer >this._body ),
				allowIncomplete
			);

		else
			throw makeUnknownDataError( );
	}

	private async blob( ): Promise< never >
	{
		throw new Error(
			"Body.blob() is not implemented (makes no sense in Node.js), " +
			"use another getter." );
	}

	async formData( ): Promise< never /* FormData */ >
	{
		throw new Error( "Body.formData() is not yet implemented" );
	}

	async json( ): Promise< any >
	{
		this._ensureUnused( );

		if ( this._body == null )
			return Promise.resolve(
				this.validateIntegrity( emptyBuffer, false )
			)
			.then( ( ) => this._body );
		else if ( isStream( this._body ) )
			return getStreamAsBuffer( < NodeJS.ReadableStream >this._body )
				.then( tap( buffer =>
					< any >this.validateIntegrity( buffer, false )
				) )
				.then( buffer => JSON.parse( buffer.toString( ) ) );
		else if ( Buffer.isBuffer( this._body ) )
			return Promise.resolve( < Buffer >this._body )
				.then( tap( buffer =>
					< any >this.validateIntegrity( buffer, false )
				) )
				.then( buffer => JSON.parse( buffer.toString( ) ) );
		else
			throw makeUnknownDataError( );
	}

	async text( allowIncomplete = false ): Promise< string >
	{
		this._ensureUnused( );

		if ( this._body == null )
			return Promise.resolve(
				this.validateIntegrity( emptyBuffer, allowIncomplete )
			)
			.then( ( ) => < string >< BodyTypes >this._body );
		else if ( isStream( this._body ) )
			return getStreamAsBuffer( < NodeJS.ReadableStream >this._body )
				.then( tap( buffer =>
					< any >this.validateIntegrity( buffer, allowIncomplete )
				) )
				.then( buffer => buffer.toString( ) );
		else if ( Buffer.isBuffer( this._body ) )
			return Promise.resolve( < Buffer >this._body )
				.then( tap( buffer =>
					< any >this.validateIntegrity( buffer, allowIncomplete )
				) )
				.then( buffer => buffer.toString( ) );
		else
			throw makeUnknownDataError( );
	}

	async readable( ): Promise< NodeJS.ReadableStream >
	{
		this._ensureUnused( );

		if ( this._body == null )
		{
			const stream = through2( );
			stream.end( );
			return Promise.resolve( stream );
		}
		else if ( isStream( this._body ) )
			return Promise.resolve( < NodeJS.ReadableStream >this._body );
		else if ( Buffer.isBuffer( this._body ) )
			return Promise.resolve( through2( ) )
				.then( stream =>
				{
					stream.write( this._body );
					stream.end( );
					return stream;
				} );
		else
			throw makeUnknownDataError( );
	}
}

export class JsonBody extends Body
{
	constructor( obj: any )
	{
		super( );

		const body = Buffer.from( JSON.stringify( obj ) );
		this.setBody( body, 'application/json' );
	}
}

export class StreamBody extends Body
{
	constructor( readable: NodeJS.ReadableStream )
	{
		super( );

		this.setBody( readable );
	}
}

export class DataBody extends Body
{
	constructor( data: Buffer | string | null )
	{
		super( );

		this.setBody( data );
	}
}

export class BodyInspector extends Body
{
	private _ref: Body;

	constructor( body: Body )
	{
		super( );

		this._ref = body;
	}

	private _getMime( )
	{
		return this._mime;
	}

	private _getLength( )
	{
		return this._length;
	}

	get mime( )
	{
		return this._getMime.call( this._ref );
	}

	get length( )
	{
		return this._getLength.call( this._ref );
	}
}
