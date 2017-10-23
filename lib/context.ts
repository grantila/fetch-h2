'use strict'

import {
	connect as http2Connect,
	SessionOptions,
	SecureClientSessionOptions,
	ClientHttp2Session,
	OutgoingHttpHeaders,
	IncomingHttpHeaders as IncomingHttp2Headers,
	constants as h2constants,
} from 'http2'

import { URL } from 'url'

import { FetchInit, SimpleSession } from './core'
import { Request } from './request'
import { Response } from './response'
import { version } from './generated/version'
import { fetch } from './fetch'
import { CookieJar } from './cookie-jar'


function makeDefaultUserAgent( ): string
{
	const name = `fetch-h2/${version} (+https://github.com/grantila/fetch-h2)`;
	const node = `nodejs/${process.versions.node}`;
	const nghttp2 = `nghttp2/${( < any >process.versions ).nghttp2}`;
	const uv = `uv/${process.versions.uv}`;

	return `${name} ${node} ${nghttp2} ${uv}`;
}

const defaultUserAgent = makeDefaultUserAgent( );
const defaultAccept = 'application/json, text/*;0.9, */*;q=0.8';

export interface ContextOptions
{
	userAgent: string;
	overwriteUserAgent: boolean;
	accept: string;
	cookieJar: CookieJar;
}

export class Context
{
	private _h2sessions: Map< string, Promise< ClientHttp2Session > >;
	private _userAgent: string;
	private _accept: string;
	private _cookieJar: CookieJar;

	constructor( opts?: Partial< ContextOptions > )
	{
		this._h2sessions = new Map( );

		this._userAgent =
			(
				opts &&
				'userAgent' in opts &&
				'overwriteUserAgent' in opts &&
				opts.overwriteUserAgent
			)
			? opts.userAgent
			: opts && 'userAgent' in opts
			? opts.userAgent + " " + defaultUserAgent
			: defaultUserAgent;

		this._accept = opts && 'accept' in opts
			? opts.accept
			: defaultAccept;

		this._cookieJar = opts && 'cookieJar' in opts
			? opts.cookieJar
			: new CookieJar( );
	}

	private connect(
		url: string | URL,
		options?: SessionOptions | SecureClientSessionOptions
	)
	: Promise< ClientHttp2Session >
	{
		const _url = 'string' === typeof url ? url : url.toString( );

		return new Promise< ClientHttp2Session >( ( resolve, reject ) =>
		{
			const h2session: ClientHttp2Session =
				options
				? http2Connect( _url, options, ( ) => resolve( h2session ) )
				: http2Connect( _url, ( ) => resolve( h2session ) );

			h2session.once( 'error', reject );
		} );
	}

	private getOrCreate(
		origin: string,
		options: SessionOptions | SecureClientSessionOptions,
		created = false
	)
	: Promise< ClientHttp2Session >
	{
		const willCreate = !this._h2sessions.has( origin );

		if ( willCreate )
		{
			const h2Session = this.connect( origin, options );

			// Handle session closure (delete from store)
			h2Session
			.then( session =>
			{
				session.once( 'close', ( ) => this.disconnect( origin ) );
			} )
			.catch( ( ) =>
			{
				this.disconnect( origin )
			} );

			this._h2sessions.set( origin, h2Session );
		}

		return this._h2sessions.get( origin )
		.catch( err =>
		{
			if ( willCreate || created )
				// Created in this request, forward error
				throw err;
			// Not created in this request, try again
			return this.getOrCreate( origin, options, true );
		} );
	}

	private get(
		url: string,
		options?: SessionOptions | SecureClientSessionOptions
	)
	: Promise< ClientHttp2Session >
	{
		const { origin } = new URL( url );

		return this.getOrCreate( origin, options );
	}

	private handleDisconnect(
		eventualH2session: Promise< ClientHttp2Session >
	)
	: Promise< void >
	{
		return eventualH2session
		.then( h2session =>
		{
			h2session.destroy( );
		} )
		.catch( err => { } );
	}

	fetch( input: string | Request, init?: Partial< FetchInit > )
	: Promise< Response >
	{
		const sessionGetter: SimpleSession = {
			get: (
					url: string,
					options?: SessionOptions | SecureClientSessionOptions
				) => this.get( url, options ),
			userAgent: ( ) => this._userAgent,
			accept: ( ) => this._accept,
			cookieJar: this._cookieJar,
		};
		return fetch( sessionGetter, input, init );
	}

	disconnect( url: string ): Promise< void >
	{
		const { origin } = new URL( url );

		if ( !this._h2sessions.has( origin ) )
			return;

		const prom = this.handleDisconnect( this._h2sessions.get( origin ) );

		this._h2sessions.delete( origin );

		return prom;
	}

	disconnectAll( ): Promise< void >
	{
		const promises: Array< Promise< void > > = [ ];

		for ( let [ origin, eventualH2session ] of this._h2sessions )
		{
			promises.push( this.handleDisconnect( eventualH2session ) );
		}

		this._h2sessions.clear( );

		return Promise.all( promises ).then( ( ) => { } );
	}
}
