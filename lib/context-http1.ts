import { request as requestHttp } from "http";
import { request as requestHttps, RequestOptions } from "https";
import { createConnection, Socket } from "net";
import { URL } from "url";

import { defer, Deferred } from "already";

import {
	Http1Options,
} from "./core";
import {
	Request
} from "./request";
import { parseInput } from "./utils";


export interface FreeSocketInfo
{
	socket?: Socket;
	shouldCreateNew: boolean;
}

export interface ConnectOptions
{
	rejectUnauthorized: boolean | undefined;
	createConnection: ( ) => Socket;
}

class OriginPool
{
	private usedSockets = new Set< Socket >( );
	private unusedSockets = new Set< Socket >( );
	private waiting: Array< Deferred< Socket > > = [ ];

	private keepAlive: boolean;
	private keepAliveMsecs: number;
	private maxSockets: number;
	private maxFreeSockets: number;
	private connOpts: { timeout?: number; };

	constructor(
		keepAlive: boolean,
		keepAliveMsecs: number,
		maxSockets: number,
		maxFreeSockets: number,
		timeout: number | void
	)
	{
		this.keepAlive = keepAlive;
		this.keepAliveMsecs = keepAliveMsecs;
		this.maxSockets = maxSockets;
		this.maxFreeSockets = maxFreeSockets;
		this.connOpts = timeout == null ? {  } : { timeout };
	}

	public connect( options: RequestOptions )
	{
		const request =
			options.protocol === "https:"
			? requestHttps
			: requestHttp;

		const opts = { ...options };
		if ( opts.rejectUnauthorized == null || options.protocol === "https" )
			delete opts.rejectUnauthorized;

		const req = request( { ...this.connOpts, ...opts } );

		return req;
	}

	public addUsed( socket: Socket )
	{
		if ( this.keepAlive )
			socket.setKeepAlive( true, this.keepAliveMsecs );

		socket.once( "close", ( ) =>
		{
			this.usedSockets.delete( socket );
			this.unusedSockets.delete( socket );
		} );

		this.usedSockets.add( socket );
	}

	public getFreeSocket( ): FreeSocketInfo
	{
		const socket = this.getFirstUnused( );

		if ( socket )
			return { socket, shouldCreateNew: false };

		const shouldCreateNew = this.maxSockets >= this.usedSockets.size;

		return { shouldCreateNew };
	}

	public waitForSocket( ): Promise< Socket >
	{
		const deferred = defer< Socket >( );

		this.waiting.push( deferred );

		// Trigger due to potential race-condition
		this.pumpWaiting( );

		return deferred.promise;
	}

	public async disconnectAll( )
	{
		await Promise.all(
			[ ...this.usedSockets, ...this.unusedSockets ]
			.map( socket =>
				socket.destroyed ? void 0 : this.disconnectSocket( socket )
			)
		);

		const waiting = this.waiting;
		this.waiting.length = 0;
		waiting.forEach( waiter =>
			// TODO: Better error class + message
			waiter.reject( new Error( "Disconnected" ) )
		);
	}

	private getFirstUnused( )
	{
		for ( const socket of this.unusedSockets.values( ) )
			// We obviously have a socket
			return this.moveToUsed( socket );

		return null;
	}

	private tryReuse( socket: Socket ): boolean
	{
		if ( this.waiting.length === 0 )
			return false;

		const waiting = < Deferred< Socket > >this.waiting.shift( );
		waiting.resolve( socket );
		return true;
	}

	private pumpWaiting( )
	{
		while ( this.waiting.length > 0 && this.unusedSockets.size > 0 )
		{
			const socket = < Socket >this.getFirstUnused( );
			const waiting = < Deferred< Socket > >this.waiting.shift( );
			waiting.resolve( socket );
		}
	}

	private async disconnectSocket( socket: Socket )
	{
		await new Promise< void >( ( resolve ) =>
			socket.end( Buffer.from( [ ] ), ( ) => resolve )
		);
	}

	// @ts-ignore
	private async moveToUnused( socket: Socket )
	{
		if ( this.tryReuse( socket ) )
			return;

		this.usedSockets.delete( socket );

		if ( this.maxFreeSockets >= this.unusedSockets.size + 1 )
		{
			await this.disconnectSocket( socket );
			return;
		}

		this.unusedSockets.add( socket );
		socket.unref( );
	}

	private moveToUsed( socket: Socket )
	{
		this.unusedSockets.delete( socket );
		this.usedSockets.add( socket );
		socket.ref( );
		return socket;
	}
}

class ContextPool
{
	private options: Http1Options;
	private pools = new Map< string, OriginPool >( );

	constructor( options: Http1Options )
	{
		this.options = options;
	}

	public hasOrigin( origin: string )
	{
		return this.pools.has( origin );
	}

	public getOriginPool( origin: string ): OriginPool
	{
		const pool = this.pools.get( origin );

		if ( !pool )
		{
			const runIfFunction =
				< T extends number | boolean | void >
				( value: T | ( ( origin: string ) => T ) ) =>
					typeof value === "function" ? value( origin ) : value;

			const keepAlive = runIfFunction( this.options.keepAlive );
			const keepAliveMsecs = runIfFunction( this.options.keepAliveMsecs );
			const maxSockets = runIfFunction( this.options.maxSockets );
			const maxFreeSockets = runIfFunction( this.options.maxFreeSockets );
			const timeout = runIfFunction( this.options.timeout );

			const newPool = new OriginPool(
				keepAlive,
				keepAliveMsecs,
				maxSockets,
				maxFreeSockets,
				timeout
			);
			this.pools.set( origin, newPool );
			return newPool;
		}

		return pool;
	}

	public async disconnect( origin: string )
	{
		const pool = this.pools.get( origin );
		if ( pool )
			await pool.disconnectAll( );
	}

	public async disconnectAll( )
	{
		const pools = [ ...this.pools.values( ) ];
		await Promise.all( pools.map( pool => pool.disconnectAll( ) ) );
	}
}

export class H1Context
{
	private contextPool: ContextPool;

	constructor( options: Http1Options )
	{
		this.contextPool = new ContextPool( options );
	}

	public getFreeSocketForOrigin( origin: string ): FreeSocketInfo
	{
		return this.contextPool.hasOrigin( origin )
			? this.contextPool.getOriginPool( origin ).getFreeSocket( )
			: { shouldCreateNew: true };
	}

	public addUsedSocket( origin: string, socket: Socket )
	{
		return this.contextPool.getOriginPool( origin ).addUsed( socket );
	}

	public waitForSocket( origin: string ): Promise< Socket >
	{
		return this.contextPool.getOriginPool( origin ).waitForSocket( );
	}

	public connect( url: URL, extraOptions: ConnectOptions, request: Request )
	{
		const {
			origin,
			protocol,
			hostname,
			password,
			pathname,
			search,
			username,
		} = url;

		const path =  pathname + search;

		const port = parseInt( parseInput( url.href ).port, 10 );

		const method = request.method;

		const auth =
			( username || password )
			? { auth: `${username}:${password}` }
			: { };

		const options: RequestOptions = {
			...extraOptions,
			agent: false,
			hostname,
			method,
			path,
			port,
			protocol,
			...auth,
		};

		return this.contextPool.getOriginPool( origin ).connect( options );
	}

	public async makeNewConnection( url: string )
	{
		return new Promise< Socket >( ( resolve, reject ) =>
		{
			const { hostname, port } = parseInput( url );

			const socket = createConnection(
				parseInt( port, 10 ),
				hostname,
				( ) =>
					{
						resolve( socket );
					}
			);

			socket.once( "error", reject );

			return socket;
		} );
	}

	public disconnect( url: string )
	{
		const { origin } = new URL( url );

		this.contextPool.disconnect( origin );
	}

	public disconnectAll( )
	{
		this.contextPool.disconnectAll( );
	}
}
