import {
	ClientHttp2Session,
	ClientHttp2Stream,
	connect as http2Connect,
	constants as h2constants,
	IncomingHttpHeaders as IncomingHttp2Headers,
	SecureClientSessionOptions,
} from "http2";

import { asyncGuard, syncGuard } from "callguard";
import { URL } from "url";

import { CookieJar } from "./cookie-jar";
import {
	AbortError,
	Decoder,
	FetchInit,
	SimpleSession,
	TimeoutError,
} from "./core";
import { fetch } from "./fetch";
import { version } from "./generated/version";
import { Request } from "./request";
import { H2StreamResponse, Response } from "./response";
import { setGotGoaway } from "./utils";

const {
	HTTP2_HEADER_PATH,
} = h2constants;

function makeDefaultUserAgent( ): string
{
	const name = `fetch-h2/${version} (+https://github.com/grantila/fetch-h2)`;
	const node = `nodejs/${process.versions.node}`;
	const nghttp2 = `nghttp2/${( < any >process.versions ).nghttp2}`;
	const uv = `uv/${process.versions.uv}`;

	return `${name} ${node} ${nghttp2} ${uv}`;
}

const defaultUserAgent = makeDefaultUserAgent( );
const defaultAccept = "application/json, text/*;0.9, */*;q=0.8";

export interface ContextOptions
{
	userAgent: string;
	overwriteUserAgent: boolean;
	accept: string;
	cookieJar: CookieJar;
	decoders: ReadonlyArray< Decoder >;
	session: SecureClientSessionOptions;
}

interface SessionItem
{
	session: ClientHttp2Session;
	promise: Promise< ClientHttp2Session >;
}

function makeOkError( err: Error ): Error
{
	( < any >err ).metaData = ( < any >err ).metaData || { };
	( < any >err ).metaData.ok = true;
	return err;
}

export type PushHandler =
	(
		origin: string,
		request: Request,
		getResponse: ( ) => Promise< Response >
	) => void;

export class Context
{
	private _h2sessions: Map< string, SessionItem >;
	private _h2staleSessions: Map< string, Set< ClientHttp2Session > >;
	private _userAgent: string;
	private _accept: string;
	private _cookieJar: CookieJar;
	private _decoders: ReadonlyArray< Decoder >;
	private _sessionOptions: SecureClientSessionOptions;
	private _pushHandler?: PushHandler;

	constructor( opts?: Partial< ContextOptions > )
	{
		this._h2sessions = new Map( );
		this._h2staleSessions = new Map( );

		this._userAgent = "";
		this._accept = "";
		this._cookieJar = < CookieJar >< any >void 0;
		this._decoders = [ ];
		this._sessionOptions = { };

		this.setup( opts );
	}

	public setup( opts?: Partial< ContextOptions > )
	{
		opts = opts || { };

		this._userAgent =
			(
				"userAgent" in opts &&
				"overwriteUserAgent" in opts &&
				opts.overwriteUserAgent
			)
			? ( opts.userAgent || "" )
			: "userAgent" in opts
			? opts.userAgent + " " + defaultUserAgent
			: defaultUserAgent;

		this._accept = "accept" in opts
			? ( opts.accept || defaultAccept )
			: defaultAccept;

		this._cookieJar = "cookieJar" in opts
			? ( opts.cookieJar || new CookieJar( ) )
			: new CookieJar( );

		this._decoders = "decoders" in opts
			? opts.decoders || [ ]
			: [ ];

		this._sessionOptions = "session" in opts
			? opts.session || { }
			: { };
	}

	public onPush( pushHandler?: PushHandler )
	{
		this._pushHandler = pushHandler;
	}

	public fetch( input: string | Request, init?: Partial< FetchInit > )
	: Promise< Response >
	{
		const sessionGetter: SimpleSession = {
			accept: ( ) => this._accept,
			contentDecoders: ( ) => this._decoders,
			cookieJar: this._cookieJar,
			get: ( url: string ) => this.get( url ),
			userAgent: ( ) => this._userAgent,
		};
		return fetch( sessionGetter, input, init );
	}

	public releaseSession( origin: string ): void
	{
		const sessionItem = this.deleteActiveSession( origin );

		if ( !sessionItem )
			return;

		if ( !this._h2staleSessions.has( origin ) )
			this._h2staleSessions.set( origin, new Set( ) );

		( < Set< ClientHttp2Session > >this._h2staleSessions.get( origin ) )
			.add( sessionItem.session );
	}

	public deleteActiveSession( origin: string ): SessionItem | void
	{
		if ( !this._h2sessions.has( origin ) )
			return;

		const sessionItem = this._h2sessions.get( origin );
		this._h2sessions.delete( origin );

		return sessionItem;
	}

	public disconnectSession( session: ClientHttp2Session ): Promise< void >
	{
		return new Promise< void >( resolve =>
		{
			if ( session.destroyed )
				return resolve( );

			session.once( "close", ( ) => resolve( ) );
			session.destroy( );
		} );
	}

	public disconnectStaleSessions( origin: string ): Promise< void >
	{
		const promises: Array< Promise< void > > = [ ];

		if ( this._h2staleSessions.has( origin ) )
		{
			const sessionSet =
				< Set< ClientHttp2Session > >
					this._h2staleSessions.get( origin );
			this._h2staleSessions.delete( origin );

			for ( const session of sessionSet )
				promises.push( this.disconnectSession( session ) );
		}

		return Promise.all( promises ).then( ( ) => { } );
	}

	public disconnect( url: string, session?: ClientHttp2Session ): Promise< void >
	{
		const { origin } = new URL( url );
		const promises: Array< Promise< void > > = [ ];

		const sessionItem = this.deleteActiveSession( origin );

		if ( sessionItem && ( !session || sessionItem.session === session ) )
			promises.push( this.handleDisconnect( sessionItem ) );

		if ( !session )
		{
			promises.push( this.disconnectStaleSessions( origin ) );
		}
		else if ( this._h2staleSessions.has( origin ) )
		{
			const sessionSet =
				< Set< ClientHttp2Session > >
					this._h2staleSessions.get( origin );
			if ( sessionSet.has( session ) )
			{
				sessionSet.delete( session );
				promises.push( this.disconnectSession( session ) );
			}
		}

		return Promise.all( promises ).then( ( ) => { } );
	}

	public disconnectAll( ): Promise< void >
	{
		const promises: Array< Promise< void > > = [ ];

		for ( const eventualH2session of this._h2sessions.values( ) )
		{
			promises.push( this.handleDisconnect( eventualH2session ) );
		}
		this._h2sessions.clear( );

		for ( const origin of this._h2staleSessions.keys( ) )
		{
			promises.push( this.disconnectStaleSessions( origin ) );
		}

		return Promise.all( promises ).then( ( ) => { } );
	}

	private handlePush(
		origin: string,
		pushedStream: ClientHttp2Stream,
		requestHeaders: IncomingHttp2Headers
	)
	{
		if ( !this._pushHandler )
			return; // Drop push. TODO: Signal through error log: #8

		const path = requestHeaders[ HTTP2_HEADER_PATH ] as string;

		// Remove pseudo-headers
		Object.keys( requestHeaders )
		.filter( name => name.charAt( 0 ) === ":" )
		.forEach( name => { delete requestHeaders[ name ]; } );

		const pushedRequest = new Request( path, { headers: requestHeaders } );

		const futureResponse = new Promise< Response >( ( resolve, reject ) =>
		{
			const guard = syncGuard( reject, { catchAsync: true } );

			pushedStream.once( "aborted", ( ) =>
				reject( new AbortError( "Response aborted" ) )
			);
			pushedStream.once( "frameError", ( ) =>
				reject( new Error( "Push request failed" ) )
			);
			pushedStream.once( "error", reject );

			pushedStream.once( "push", guard(
				( responseHeaders: IncomingHttp2Headers ) =>
				{
					const response = new H2StreamResponse(
						this._decoders,
						path,
						pushedStream,
						responseHeaders,
						false
					);

					resolve( response );
				}
			) );
		} );

		futureResponse
		.catch( _err => { } ); // TODO: #8

		const getResponse = ( ) => futureResponse;

		return this._pushHandler( origin, pushedRequest, getResponse );
	}

	private connect( origin: string )
	: SessionItem
	{
		const makeConnectionTimeout = ( ) =>
			new TimeoutError( `Connection timeout to ${origin}` );

		const makeError = ( event?: string ) =>
			event
			? new Error( `Unknown connection error (${event}): ${origin}` )
			: new Error( `Connection closed` );

		let session: ClientHttp2Session = < ClientHttp2Session >< any >void 0;

		// TODO: #8
		// tslint:disable-next-line
		const aGuard = asyncGuard( console.error.bind( console ) );

		const pushHandler = aGuard(
			( stream: ClientHttp2Stream, headers: IncomingHttp2Headers ) =>
				this.handlePush( origin, stream, headers )
		);

		const options = this._sessionOptions;

		const promise = new Promise< ClientHttp2Session >(
			( resolve, reject ) =>
			{
				session =
					http2Connect( origin, options, ( ) => resolve( session ) );

				session.on( "stream", pushHandler );

				session.once( "close", ( ) =>
					reject( makeOkError( makeError( ) ) ) );

				session.once( "timeout", ( ) =>
					reject( makeConnectionTimeout( ) ) );

				session.once( "error", reject );
			}
		);

		return { promise, session };
	}

	private getOrCreate( origin: string, created = false )
	: Promise< ClientHttp2Session >
	{
		const willCreate = !this._h2sessions.has( origin );

		if ( willCreate )
		{
			const sessionItem = this.connect( origin );

			const { promise } = sessionItem;

			// Handle session closure (delete from store)
			promise
			.then( session =>
			{
				session.once(
					"close",
					( ) => this.disconnect( origin, session )
				);

				session.once(
					"goaway",
					(
						_errorCode: number,
						_lastStreamID: number,
						_opaqueData: Buffer
					) =>
					{
						setGotGoaway( session );
						this.releaseSession( origin );
					}
				);
			} )
			.catch( ( ) =>
			{
				if ( sessionItem.session )
					this.disconnect( origin, sessionItem.session );
			} );

			this._h2sessions.set( origin, sessionItem );
		}

		return ( < SessionItem >this._h2sessions.get( origin ) ).promise
		.catch( err =>
		{
			if ( willCreate || created )
				// Created in this request, forward error
				throw err;
			// Not created in this request, try again
			return this.getOrCreate( origin, true );
		} );
	}

	private get( url: string )
	: Promise< ClientHttp2Session >
	{
		const { origin } = new URL( url );

		return this.getOrCreate( origin );
	}

	private handleDisconnect( sessionItem: SessionItem ): Promise< void >
	{
		const { promise, session } = sessionItem;

		if ( session )
			session.destroy( );

		return promise
		.then( _h2session => { } )
		.catch( err =>
		{
			const debugMode = false;
			if ( debugMode )
				// tslint:disable-next-line
				console.warn( "Disconnect error", err );
		} );
	}
}
