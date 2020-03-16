import { ClientRequest } from "http";
import {
	SecureClientSessionOptions,
} from "http2";
import { Socket } from "net";
import { URL } from "url";
import { funnel, once, specific } from "already";

import { H1Context, OriginPool } from "./context-http1";
import { CacheableH2Session, H2Context, PushHandler } from "./context-http2";
import { connectTLS } from "./context-https";
import { CookieJar } from "./cookie-jar";
import {
	Decoder,
	FetchError,
	FetchInit,
	getByOrigin,
	Http1Options,
	HttpProtocols,
	parsePerOrigin,
	PerOrigin,
	SimpleSession,
	SimpleSessionHttp1,
	SimpleSessionHttp2,
	RetryError,
} from "./core";
import { fetch as fetchHttp1 } from "./fetch-http1";
import { fetch as fetchHttp2 } from "./fetch-http2";
import { version } from "./generated/version";
import { Request } from "./request";
import { Response } from "./response";
import { parseInput } from "./utils";
import OriginCache from "./origin-cache";


function makeDefaultUserAgent( ): string
{
	const name = `fetch-h2/${version} (+https://github.com/grantila/fetch-h2)`;
	const node = `nodejs/${process.versions.node}`;
	const nghttp2 = `nghttp2/${( < any >process.versions ).nghttp2}`;
	const uv = `uv/${process.versions.uv}`;

	return `${name} ${node} ${nghttp2} ${uv}`;
}

const defaultUserAgent = makeDefaultUserAgent( );
const defaultAccept = "application/json,text/*;q=0.9,*/*;q=0.8";

export interface ContextOptions
{
	userAgent: string | PerOrigin< string >;
	overwriteUserAgent: boolean | PerOrigin< boolean >;
	accept: string | PerOrigin< string >;
	cookieJar: CookieJar;
	decoders:
		ReadonlyArray< Decoder > | PerOrigin< ReadonlyArray< Decoder > >;
	session:
		SecureClientSessionOptions | PerOrigin< SecureClientSessionOptions >;
	httpProtocol: HttpProtocols | PerOrigin< HttpProtocols >;
	httpsProtocols:
		ReadonlyArray< HttpProtocols > |
		PerOrigin< ReadonlyArray< HttpProtocols > >;
	http1: Partial< Http1Options > | PerOrigin< Partial< Http1Options > >;
}

interface SessionMap
{
	http1: OriginPool;
	https1: OriginPool;
	http2: CacheableH2Session;
	https2: CacheableH2Session;
}

export class Context
{
	private h1Context: H1Context;
	private h2Context: H2Context;

	private _userAgent: string | PerOrigin< string >;
	private _overwriteUserAgent: boolean | PerOrigin< boolean >;
	private _accept: string | PerOrigin< string >;
	private _cookieJar: CookieJar;
	private _decoders:
		ReadonlyArray< Decoder > | PerOrigin< ReadonlyArray< Decoder > >;
	private _sessionOptions:
		SecureClientSessionOptions | PerOrigin< SecureClientSessionOptions >;
	private _httpProtocol: HttpProtocols | PerOrigin< HttpProtocols >;
	private _httpsProtocols:
		ReadonlyArray< HttpProtocols > |
		PerOrigin< ReadonlyArray< HttpProtocols > >;
	private _http1Options: Partial< Http1Options | PerOrigin< Http1Options > >;
	private _httpsFunnel = funnel< Response >( );
	private _http1Funnel = funnel< Response >( );
	private _http2Funnel = funnel< Response >( );
	private _originCache = new OriginCache< SessionMap >( );

	constructor( opts?: Partial< ContextOptions > )
	{
		this._userAgent = "";
		this._overwriteUserAgent = false;
		this._accept = "";
		this._cookieJar = < CookieJar >< any >void 0;
		this._decoders = [ ];
		this._sessionOptions = { };
		this._httpProtocol = "http1";
		this._httpsProtocols = [ "http2", "http1" ];
		this._http1Options = { };

		this.setup( opts );

		this.h1Context = new H1Context( this._http1Options );
		this.h2Context = new H2Context(
			this.decoders.bind( this ),
			this.sessionOptions.bind( this )
		);
	}

	public setup( opts?: Partial< ContextOptions > )
	{
		opts = opts || { };

		this._cookieJar = "cookieJar" in opts
			? ( opts.cookieJar || new CookieJar( ) )
			: new CookieJar( );

		this._userAgent = parsePerOrigin( opts.userAgent, "" );
		this._overwriteUserAgent =
			parsePerOrigin( opts.overwriteUserAgent, false );
		this._accept = parsePerOrigin( opts.accept, defaultAccept );
		this._decoders = parsePerOrigin( opts.decoders, [ ] );
		this._sessionOptions = parsePerOrigin( opts.session, { } );
		this._httpProtocol = parsePerOrigin( opts.httpProtocol, "http1" );

		this._httpsProtocols = parsePerOrigin(
			opts.httpsProtocols,
			[ "http2", "http1" ]
		);

		Object.assign( this._http1Options, opts.http1 || { } );
	}

	public userAgent( origin: string )
	{
		const combine = ( userAgent: string, overwriteUserAgent: boolean ) =>
		{
			const defaultUA = overwriteUserAgent ? "" : defaultUserAgent;

			return userAgent
				? defaultUA
				? userAgent + " " + defaultUA
				: userAgent
				: defaultUA;
		};

		return combine(
			getByOrigin( this._userAgent, origin ),
			getByOrigin( this._overwriteUserAgent, origin )
		);
	}

	public decoders( origin: string )
	{
		return getByOrigin( this._decoders, origin );
	}
	public sessionOptions( origin: string )
	{
		return getByOrigin( this._sessionOptions, origin );
	}

	public onPush( pushHandler?: PushHandler )
	{
		this.h2Context._pushHandler = pushHandler;
	}

	public async fetch( input: string | Request, init?: Partial< FetchInit > )
	{
		return this.retryFetch( input, init, 0 );
	}

	public async disconnect( url: string )
	{
		const { origin } = this.parseInput( url );
		this._originCache.disconnect( origin );

		await Promise.all( [
			this.h1Context.disconnect( url ),
			this.h2Context.disconnect( url ),
		] );
	}

	public async disconnectAll( )
	{
		this._originCache.disconnectAll( );

		await Promise.all( [
			this.h1Context.disconnectAll( ),
			this.h2Context.disconnectAll( ),
		] );
	}

	private async retryFetch(
		input: string | Request,
		init: Partial< FetchInit > | undefined,
		count: number
	)
	: Promise< Response >
	{
		++count;

		return this.retryableFetch( input, init )
		.catch( specific( RetryError, err =>
		{
			// TODO: Implement a more robust retry logic
			if ( count > 10 )
				throw err;
			return this.retryFetch( input, init, count );
		} ) );
	}

	private async retryableFetch(
		input: string | Request,
		init?: Partial< FetchInit >
	)
	: Promise< Response >
	{
		const { hostname, origin, port, protocol, url } =
			this.parseInput( input );

		// Rewrite url to get rid of "http1://" and "http2://"
		const request =
			input instanceof Request
			? input.url !== url
				? input.clone( url )
				: input
			: new Request( input, { ...( init || { } ), url } );

		const { rejectUnauthorized } = this.sessionOptions( origin );

		const makeSimpleSession = ( protocol: HttpProtocols ): SimpleSession =>
			( {
				accept: ( ) => getByOrigin( this._accept, origin ),
				contentDecoders: ( ) => getByOrigin( this._decoders, origin ),
				cookieJar: this._cookieJar,
				protocol,
				userAgent: ( ) => this.userAgent( origin ),
			} );

		const doFetchHttp1 = ( socket: Socket, cleanup: ( ) => void ) =>
		{
			const sessionGetterHttp1: SimpleSessionHttp1 = {
				get: ( url: string ) =>
					( {
						cleanup,
						req: this.getHttp1(
							url,
							socket,
							request,
							rejectUnauthorized ),
					} ),
				...makeSimpleSession( "http1" ),
			};
			return fetchHttp1( sessionGetterHttp1, request, init );
		};

		const doFetchHttp2 = async ( cacheableSession: CacheableH2Session ) =>
		{
			const { session, unref } = cacheableSession;
			const cleanup = once( unref );

			try
			{
				const sessionGetterHttp2: SimpleSessionHttp2 = {
					get: ( ) => ( { session, cleanup } ),
					...makeSimpleSession( "http2" ),
				};
				return await fetchHttp2( sessionGetterHttp2, request, init );
			}
			catch ( err )
			{
				cleanup( );
				throw err;
			}
		};

		const tryWaitForHttp1 = async ( session: OriginPool ) =>
		{
			const { socket: freeHttp1Socket, cleanup, shouldCreateNew } =
				this.h1Context.getFreeSocketForSession( session );

			if ( freeHttp1Socket )
				return doFetchHttp1( freeHttp1Socket, cleanup );

			if ( !shouldCreateNew )
			{
				// We've maxed out HTTP/1 connections, wait for one to be
				// freed.
				const { socket, cleanup } =
					await this.h1Context.waitForSocketBySession( session );
				return doFetchHttp1( socket, cleanup );
			}
		};

		if ( protocol === "http1" )
		{
			return this._http1Funnel( async ( shouldRetry, retry, shortcut ) =>
			{
				if ( shouldRetry( ) )
					return retry( );

				// Plain text HTTP/1(.1)
				const cacheItem = this._originCache.get( "http1", origin );

				const session =
					cacheItem?.session ??
					this.h1Context.getSessionForOrigin( origin );

				const resp = await tryWaitForHttp1( session );
				if ( resp )
					return resp;

				const socket = await this.h1Context.makeNewConnection( url );

				this._originCache.set( origin, "http1", session );

				shortcut( );

				const cleanup =
					this.h1Context.addUsedSocket( session, socket );
				return doFetchHttp1( socket, cleanup );
			} );
		}
		else if ( protocol === "http2" )
		{
			return this._http2Funnel( async ( _, __, shortcut ) =>
			{
				// Plain text HTTP/2
				const cacheItem = this._originCache.get( "http2", origin );

				if ( cacheItem )
				{
					cacheItem.session.ref( );
					shortcut( );
					return doFetchHttp2( cacheItem.session );
				}

				// Convert socket into http2 session, this will ref (*)
				const cacheableSession = this.h2Context.createHttp2(
					origin,
					( ) => { this._originCache.delete( cacheableSession ); }
				);

				this._originCache.set( origin, "http2", cacheableSession );

				shortcut( );

				// Session now lingering, it will be re-used by the next get()
				return doFetchHttp2( cacheableSession );
			} );
		}
		else // protocol === "https"
		{
			return this._httpsFunnel( ( shouldRetry, retry, shortcut ) =>
				shouldRetry( )
				? retry( )
				: this.connectSequenciallyTLS(
					shortcut,
					hostname,
					port,
					origin,
					tryWaitForHttp1,
					doFetchHttp1,
					doFetchHttp2
				)
			);
		}
	}

	private async connectSequenciallyTLS(
		shortcut: ( ) => void,
		hostname: string,
		port: string,
		origin: string,
		tryWaitForHttp1:
			( session: OriginPool ) => Promise< Response | undefined >,
		doFetchHttp1:
			( socket: Socket, cleanup: ( ) => void ) => Promise< Response >,
		doFetchHttp2:
			( cacheableSession: CacheableH2Session ) => Promise< Response >
	)
	{
		const cacheItem =
			this._originCache.get( "https2", origin ) ??
			this._originCache.get( "https1", origin );

		if ( cacheItem )
		{
			if ( cacheItem.protocol === "https1" )
			{
				shortcut( );
				const resp = await tryWaitForHttp1( cacheItem.session );
				if ( resp )
					return resp;
			}
			else if ( cacheItem.protocol === "https2" )
			{
				cacheItem.session.ref( );
				shortcut( );
				return doFetchHttp2( cacheItem.session );
			}
		}

		// Use ALPN to figure out protocol lazily
		const { protocol, socket, altNameMatch } = await connectTLS(
			hostname,
			port,
			getByOrigin( this._httpsProtocols, origin ),
			getByOrigin( this._sessionOptions, origin )
		);

		const disconnect = once( ( ) =>
		{
			if ( !socket.destroyed )
			{
				socket.destroy( );
				socket.unref( );
			}
		} );

		if ( protocol === "http2" )
		{
			// Convert socket into http2 session, this will ref (*)
			// const { cleanup, session, didCreate } =
			const cacheableSession = this.h2Context.createHttp2(
					origin,
					( ) => { this._originCache.delete( cacheableSession ); },
					{
						createConnection: ( ) => socket,
					}
				);

			this._originCache.set(
				origin,
				"https2",
				cacheableSession,
				altNameMatch,
				disconnect
			);

			shortcut( );

			// Session now lingering, it will be re-used by the next get()
			return doFetchHttp2( cacheableSession );
		}
		else // protocol === "http1"
		{
			const session =
				cacheItem?.session ??
				this.h1Context.getSessionForOrigin( origin );

			// TODO: Update the alt-name list in the origin cache (if the new
			//       TLS socket contains more/other alt-names).
			if ( !cacheItem )
				this._originCache.set(
					origin,
					"https1",
					session,
					altNameMatch,
					disconnect
				);

			const cleanup = this.h1Context.addUsedSocket(
				session,
				socket
			);

			shortcut( );

			return doFetchHttp1( socket, cleanup );
		}
	}

	private getHttp1(
		url: string,
		socket: Socket,
		request: Request,
		rejectUnauthorized?: boolean
	)
	: ClientRequest
	{
		return this.h1Context.connect(
			new URL( url ),
			{
				createConnection: ( ) => socket,
				rejectUnauthorized,
			},
			request
		);
	}

	private parseInput( input: string | Request )
	{
		const { hostname, origin, port, protocol, url } =
			parseInput( typeof input !== "string" ? input.url : input );

		const defaultHttp = this._httpProtocol;

		if (
			( protocol === "http" && defaultHttp === "http1" )
			|| protocol === "http1"
		)
			return {
				hostname,
				origin,
				port,
				protocol: "http1",
				url,
			};
		else if (
			( protocol === "http" && defaultHttp === "http2" )
			|| protocol === "http2"
		)
			return {
				hostname,
				origin,
				port,
				protocol: "http2",
				url,
			};
		else if ( protocol === "https" )
			return {
				hostname,
				origin,
				port,
				protocol: "https",
				url,
			};
		else
			throw new FetchError( `Invalid protocol "${protocol}"` );
	}
}
