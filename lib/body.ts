'use strict'

import { createHash } from 'crypto'

import { buffer as getStreamAsBuffer } from 'get-stream'
import * as through2 from 'through2'
import * as isBuffer from 'is-buffer'
import * as toArrayBuffer from 'to-arraybuffer'

import { IBody, BodyTypes, StorageBodyTypes } from './core'


function throwUnknownData( ): never
{
	throw new Error( "Unknown body data" );
}

function throwIntegrityMismatch( ): never
{
	throw new Error( "Resource integrity mismatch" );
}

function parseIntegrity( integrity: string )
{
	const [ algorithm, ...expectedHash ] = integrity.split( '-' );
	return { algorithm, hash: expectedHash.join( '-' ) };
}

function validateIntegrity< T extends Buffer | string | ArrayBuffer >(
	data: T,
	integrity: string
)
: T
{
	if ( !integrity )
		// This is valid
		return;

	const { algorithm, hash: expectedHash } = parseIntegrity( integrity );

	const hash = createHash( algorithm )
		.update(
			data instanceof ArrayBuffer
			? new DataView( data ) as any
			: < Buffer | string >data
		)
		.digest( 'base64' );

	if ( expectedHash.toLowerCase( ) !== hash.toLowerCase( ) )
		throwIntegrityMismatch( );

	return data;
}

export class Body implements IBody
{
	private _body: StorageBodyTypes;
	protected _length: number;
	private _used: boolean;
	protected _mime?: string;
	private _integrity?: string;
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

	protected hasBody( ): boolean
	{
		return '_body' in this;
	}

	protected setBody(
		body: BodyTypes | IBody,
		mime?: string,
		integrity?: string
	)
	: void
	{
		this._ensureUnused( );
		this._length = null;
		this._used = false;

		if ( body instanceof Body )
		{
			body._ensureUnused( );
			this._body = body._body;
			this._mime = body._mime;
		}
		else if ( typeof body === 'string' )
			this._body = Buffer.from( body );
		else
			this._body = < StorageBodyTypes >body;

		if ( isBuffer( this._body ) )
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

	async arrayBuffer( ): Promise< ArrayBuffer >
	{
		this._ensureUnused( );

		if ( this._body == null )
			return validateIntegrity( new ArrayBuffer( 0 ), this._integrity );

		else if ( typeof this._body === 'string' )
			return validateIntegrity(
				toArrayBuffer( Buffer.from( this._body ) ),
				this._integrity
			);

		else if ( 'readable' in ( < NodeJS.ReadableStream >this._body ) )
			return getStreamAsBuffer( < NodeJS.ReadableStream >this._body )
			.then( buffer => validateIntegrity( buffer, this._integrity ) )
			.then( buffer => toArrayBuffer( buffer ) );

		else if ( isBuffer( this._body ) )
			return validateIntegrity(
				toArrayBuffer( < Buffer >this._body ),
				this._integrity
			);

		else
			throwUnknownData( );
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
			return Promise.resolve( this._body );
		else if ( typeof this._body === 'string' )
			return Promise.resolve( this._body ).then( JSON.parse );
		else if ( 'readable' in ( < NodeJS.ReadableStream >this._body ) )
			return getStreamAsBuffer( < NodeJS.ReadableStream >this._body )
				.then( buffer => JSON.parse( buffer.toString( ) ) );
		else if ( isBuffer( this._body ) )
			return Promise.resolve( this._body.toString( ) )
				.then( JSON.parse );
		else
			throwUnknownData( );
	}

	async text( ): Promise< string >
	{
		this._ensureUnused( );

		if ( this._body == null )
			return Promise.resolve( null );
		else if ( typeof this._body === 'string' )
			return Promise.resolve( this._body );
		else if ( 'readable' in ( < NodeJS.ReadableStream >this._body ) )
			return getStreamAsBuffer( < NodeJS.ReadableStream >this._body )
				.then( buffer => buffer.toString( ) );
		else if ( isBuffer( this._body ) )
			return Promise.resolve( this._body.toString( ) );
		else
			throwUnknownData( );
	}

	async readable( ): Promise< NodeJS.ReadableStream >
	{
		this._ensureUnused( );

		const stream = through2( );

		if ( this._body == null )
		{
			stream.end( );
			return Promise.resolve( stream );
		}
		else if ( 'readable' in Object( < NodeJS.ReadableStream >this._body ) )
			return Promise.resolve( < NodeJS.ReadableStream >this._body );
		else if ( isBuffer( this._body ) || typeof this._body === 'string' )
			return Promise.resolve( )
				.then( ( ) =>
				{
					stream.write( this._body );
					stream.end( );
					return stream;
				} );
		else
			throwUnknownData( );
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
	constructor( data: Buffer | string )
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
