import { createHash } from "crypto";

import { tap } from "already";
import getStream from "get-stream";
import * as through2 from "through2";
import * as toArrayBuffer from "to-arraybuffer";

import { AbortSignal } from "./abort";
import { AbortError, BodyTypes, IBody, StorageBodyTypes } from "./core";


const abortError = new AbortError( "Response aborted" );

function makeUnknownDataError( )
{
	return new Error( "Unknown body data" );
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
	const [ algorithm, ...expectedHash ] = integrity.split( "-" );
	return { algorithm, hash: expectedHash.join( "-" ) };
}

function isStream( body: StorageBodyTypes ): body is NodeJS.ReadableStream
{
	return body &&
		( "readable" in ( < NodeJS.ReadableStream >Object( body ) ) );
}

const emptyBuffer = new ArrayBuffer( 0 );

export class Body implements IBody
{
	// @ts-ignore
	public readonly bodyUsed: boolean;
	protected _length: number | null;
	protected _mime?: string;
	protected _body?: StorageBodyTypes | null;
	private _used: boolean;
	private _integrity?: string;
	private _signal?: AbortSignal;

	constructor( )
	{
		this._length = null;
		this._used = false;

		Object.defineProperties( this, {
			bodyUsed: {
				enumerable: true,
				get: ( ) => this._used,
			},
		} );
	}

	public async arrayBuffer( allowIncomplete = false ): Promise< ArrayBuffer >
	{
		this._ensureUnused( );
		this._ensureNotAborted( );

		if ( this._body == null )
			return this.validateIntegrity( emptyBuffer, allowIncomplete );

		else if ( isStream( this._body ) )
			return this.awaitBuffer( < NodeJS.ReadableStream >this._body )
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

	public async formData( ): Promise< never /* FormData */ >
	{
		throw new Error( "Body.formData() is not yet implemented" );
	}

	public async json( ): Promise< any >
	{
		this._ensureUnused( );
		this._ensureNotAborted( );

		if ( this._body == null )
			return Promise.resolve(
				this.validateIntegrity( emptyBuffer, false )
			)
			.then( ( ) => this._body );
		else if ( isStream( this._body ) )
			return this.awaitBuffer( < NodeJS.ReadableStream >this._body )
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

	public async text( allowIncomplete = false ): Promise< string >
	{
		this._ensureUnused( );
		this._ensureNotAborted( );

		if ( this._body == null )
			return Promise.resolve(
				this.validateIntegrity( emptyBuffer, allowIncomplete )
			)
			.then( ( ) => < string >< BodyTypes >this._body );
		else if ( isStream( this._body ) )
			return this.awaitBuffer( < NodeJS.ReadableStream >this._body )
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

	public async readable( ): Promise< NodeJS.ReadableStream >
	{
		this._ensureUnused( );
		this._ensureNotAborted( );

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

	protected setSignal( signal: AbortSignal | undefined )
	{
		this._signal = signal;
	}

	protected hasBody( ): boolean
	{
		return "_body" in this;
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
		else if ( typeof body === "string" )
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

	private async awaitBuffer( readable: NodeJS.ReadableStream )
	: Promise< Buffer >
	{
		if ( !this._signal )
			return getStream.buffer( readable );

		// Race the readable against the abort signal
		let callback: ( ) => void = ( ) => { };
		const onAborted = new Promise< Buffer >( ( _, reject ) =>
		{
			callback = ( ) => { reject( abortError ); };
			this._signal?.addListener( 'abort', callback );
		} );

		try
		{
			this._ensureNotAborted( );

			return await Promise.race( [
				getStream.buffer( readable ),
				onAborted,
			] );
		}
		finally
		{
			this._signal.removeListener( 'abort', callback );
			// Could happen if abort and other error happen practically
			// simultaneously. Ensure Node.js won't get mad about this.
			onAborted.catch( ( ) => { } );
		}
	}

	private validateIntegrity< T extends Buffer | ArrayBuffer >(
		data: T,
		allowIncomplete: boolean
	)
	: T
	{
		this._ensureNotAborted( );

		if (
			!allowIncomplete &&
			this._length != null &&
			data.byteLength !== this._length
		)
			throwLengthMismatch( );

		if ( !this._integrity )
			// This is valid
			return data;

		const { algorithm, hash: expectedHash } =
			parseIntegrity( this._integrity );

		// jest (I presume) modifies ArrayBuffer, breaking instanceof
		const instanceOfArrayBuffer = ( val: any ) =>
			val && val.constructor && val.constructor.name === "ArrayBuffer";

		const hash = createHash( algorithm )
			.update(
				instanceOfArrayBuffer( data )
				? new DataView( data )
				: < Buffer >data
			)
			.digest( "base64" );

		if ( expectedHash.toLowerCase( ) !== hash.toLowerCase( ) )
			throwIntegrityMismatch( );

		return data;
	}

	private _ensureNotAborted( )
	{
		if ( this._signal && this._signal.aborted )
			throw abortError;
	}

	private _ensureUnused( )
	{
		if ( this._used )
			throw new ReferenceError( "Body already used" );
		this._used = true;
	}

	// @ts-ignore
	private async blob( ): Promise< never >
	{
		throw new Error(
			"Body.blob() is not implemented (makes no sense in Node.js), " +
			"use another getter." );
	}
}

export class JsonBody extends Body
{
	constructor( obj: any )
	{
		super( );

		const body = Buffer.from( JSON.stringify( obj ) );
		this.setBody( body, "application/json" );
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

	private _getBody( )
	{
		return this._body;
	}

	get mime( )
	{
		return this._getMime.call( this._ref );
	}

	get length( )
	{
		return this._getLength.call( this._ref );
	}

	get stream( )
	{
		const rawBody = this._getBody.call( this._ref );
		return rawBody && isStream( rawBody ) ? rawBody : undefined;
	}
}
