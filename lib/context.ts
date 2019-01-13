import { ClientRequest } from "http";
import {
	ClientHttp2Session,
	SecureClientSessionOptions,
} from "http2";
import { Socket } from "net";
import { URL } from "url";

import { H1Context } from "./context-http1";
import { H2Context, PushHandler } from "./context-http2";
import { connectTLS } from "./context-https";
import { CookieJar } from "./cookie-jar";
import {
	BaseContext,
	Decoder,
	FetchError,
	FetchInit,
	Http1Options,
	HttpProtocols,
	SimpleSession,
	SimpleSessionHttp1,
	SimpleSessionHttp2,
} from "./core";
import { fetch as fetchHttp1 } from "./fetch-http1";
import { fetch as fetchHttp2 } from "./fetch-http2";
import { version } from "./generated/version";
import { Request } from "./request";
import { Response } from "./response";
import { parseInput } from "./utils";


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
	httpProtocol: HttpProtocols;
	httpsProtocols: ReadonlyArray< HttpProtocols >;
	http1: Partial< Http1Options >;
}

export class Context implements BaseContext
{
	public _decoders: ReadonlyArray< Decoder >;
	public _sessionOptions: SecureClientSessionOptions;

	private h1Context: H1Context;
	private h2Context = new H2Context( this );
	private _userAgent: string;
	private _accept: string;
	private _cookieJar: CookieJar;
	private _httpProtocol: HttpProtocols;
	private _httpsProtocols: Array< HttpProtocols >;
	private _http1Options: Http1Options;

	constructor( opts?: Partial< ContextOptions > )
	{
		this._userAgent = "";
		this._accept = "";
		this._cookieJar = < CookieJar >< any >void 0;
		this._decoders = [ ];
		this._sessionOptions = { };
		this._httpProtocol = "http1";
		this._httpsProtocols = [ "http2", "http1" ];
		this._http1Options = {
			keepAlive: false,
			keepAliveMsecs: 1000,
			maxFreeSockets: 256,
			maxSockets: Infinity,
			timeout: void 0,
		};

		this.setup( opts );

		this.h1Context = new H1Context( this._http1Options );
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

		this._httpProtocol = "httpProtocol" in opts
			? opts.httpProtocol || "http1"
			: "http1";

		this._httpsProtocols = "httpsProtocols" in opts
			? [ ...( opts.httpsProtocols || [ ] ) ]
			: [ "http2", "http1" ];

		Object.assign( this._http1Options, opts.http1 || { } );
	}

	public onPush( pushHandler?: PushHandler )
	{
		this.h2Context._pushHandler = pushHandler;
	}

	public async fetch( input: string | Request, init?: Partial< FetchInit > )
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

		const { rejectUnauthorized } = this._sessionOptions;

		const makeSimpleSession = ( protocol: HttpProtocols ): SimpleSession =>
			( {
				accept: ( ) => this._accept,
				contentDecoders: ( ) => this._decoders,
				cookieJar: this._cookieJar,
				protocol,
				userAgent: ( ) => this._userAgent,
			} );

		const doFetchHttp1 = ( socket: Socket ) =>
		{
			const sessionGetterHttp1: SimpleSessionHttp1 = {
				get: ( url: string ) =>
					this.getHttp1( url, socket, request, rejectUnauthorized ),
				...makeSimpleSession( "http1" ),
			};
			return fetchHttp1( sessionGetterHttp1, request, init );
		};

		const doFetchHttp2 = ( ) =>
		{
			const sessionGetterHttp2: SimpleSessionHttp2 = {
				get: ( url: string ) => this.getHttp2( url ),
				...makeSimpleSession( "http2" ),
			};
			return fetchHttp2( sessionGetterHttp2, request, init );
		};

		const tryWaitForHttp1 = async ( ) =>
		{
			const { socket: freeHttp1Socket, shouldCreateNew } =
				this.h1Context.getFreeSocketForOrigin( origin );

			if ( freeHttp1Socket )
				return doFetchHttp1( freeHttp1Socket );

			if ( !shouldCreateNew )
			{
				// We've maxed out HTTP/1 connections, wait for one to be
				// freed.
				const socket = await this.h1Context.waitForSocket( origin );
				return doFetchHttp1( socket );
			}
		};

		if ( protocol === "http1" )
		{
			// Plain text HTTP/1(.1)
			const resp = await tryWaitForHttp1( );
			if ( resp )
				return resp;

			const socket = await this.h1Context.makeNewConnection( url );
			this.h1Context.addUsedSocket( origin, socket );
			return doFetchHttp1( socket );
		}
		else if ( protocol === "http2" )
		{
			// Plain text HTTP/2
			return doFetchHttp2( );
		}
		else // protocol === "https"
		{
			// If we already have a session/socket open to this origin,
			// re-use it

			if ( this.h2Context.hasOrigin( origin ) )
				return doFetchHttp2( );

			const resp = await tryWaitForHttp1( );
			if ( resp )
				return resp;

			// TODO: Make queue for subsequent fetch requests to the same
			//       origin, so they can re-use the http2 session, or http1
			//       pool once we know what protocol will be used.
			//       This must apply to plain-text http1 too.

			// Use ALPN to figure out protocol lazily
			const { protocol, socket } = await connectTLS(
				hostname,
				port,
				this._httpsProtocols,
				this._sessionOptions
			);

			if ( protocol === "http2" )
			{
				// Convert socket into http2 session
				await this.h2Context.getOrCreateHttp2(
					origin,
					{
						createConnection: ( ) => socket,
					}
				);
				// Session now lingering, it will be re-used by the next get()
				return doFetchHttp2( );
			}
			else // protocol === "http1"
			{
				this.h1Context.addUsedSocket( origin, socket );
				return doFetchHttp1( socket );
			}
		}
	}

	public async disconnect( url: string )
	{
		await Promise.all( [
			this.h1Context.disconnect( url ),
			this.h2Context.disconnect( url ),
		] );
	}

	public async disconnectAll( )
	{
		await Promise.all([
			this.h1Context.disconnectAll( ),
			this.h2Context.disconnectAll( ),
		]);
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

	private getOrCreateHttp2( origin: string, created = false )
	: Promise< ClientHttp2Session >
	{
		const { didCreate, session } =
			this.h2Context.getOrCreateHttp2( origin );

		return session
		.catch( err =>
		{
			if ( didCreate || created )
				// Created in this request, forward error
				throw err;
			// Not created in this request, try again
			return this.getOrCreateHttp2( origin, true );
		} );
	}

	private getHttp2( url: string )
	: Promise< ClientHttp2Session >
	{
		const { origin } = typeof url === "string" ? new URL( url ) : url;

		return this.getOrCreateHttp2( origin );
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
