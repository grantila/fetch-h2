import { AltNameMatch } from "./san"


export type Protocol = 'https1' | 'https2' | 'http1' | 'http2';

interface State< Session >
{
	protocol: Protocol;
	firstOrigin: string;
	session: Session;
	match?: AltNameMatch;
	resolved: Array< string >;
	cleanup?: ( ) => void;
}

function makeKey( protocol: Protocol, origin: string )
{
	return protocol + ":" + origin;
}

type AnySessionMap = { [ key in Protocol ]: unknown; };

export interface OriginCacheEntry< P, Session >
{
	protocol: P;
	session: Session;
	firstOrigin: string;
}

export default class OriginCache< SessionMap extends AnySessionMap >
{
	private sessionMap: Map< unknown, State< unknown > > = new Map( );
	private staticMap: Map< string, State< unknown > > = new Map( );

	public get< P extends Protocol >( protocol: P, origin: string )
	: OriginCacheEntry< typeof protocol, SessionMap[ P ] > | undefined
	{
		const key = makeKey( protocol, origin );

		const stateByStatic = this.staticMap.get( key );
		if ( stateByStatic )
			return {
				protocol: stateByStatic.protocol as P,
				session: stateByStatic.session,
				firstOrigin: stateByStatic.firstOrigin,
			};

		const stateByDynamic = [ ...this.sessionMap.values( ) ].find( state =>
			state.protocol === protocol &&
			state.match &&
			state.match.dynamic &&
			state.match.dynamic( origin )
		);

		if ( stateByDynamic )
		{
			// An origin matching a dynamic (wildcard) alt-name was found.
			// Cache this to find it statically in the future.
			stateByDynamic.resolved.push( origin );
			this.staticMap.set( key, stateByDynamic );
			return {
				protocol: stateByDynamic.protocol as P,
				session: stateByDynamic.session,
				firstOrigin: stateByDynamic.firstOrigin,
			};
		}
	}

	public set(
		origin: string,
		protocol: Protocol,
		session: SessionMap[ typeof protocol ],
		altNameMatch?: AltNameMatch,
		cleanup?: ( ) => void
	)
	{
		const state: State< typeof session > = {
			protocol,
			firstOrigin: origin,
			session,
			match: altNameMatch,
			resolved: [ ],
			cleanup,
		};

		this.sessionMap.set( session, state );

		if ( altNameMatch )
			altNameMatch.names.forEach( origin =>
			{
				this.staticMap.set( makeKey( protocol, origin ), state );
			} );

		this.staticMap.set( makeKey( protocol, origin ), state );
	}

	// Returns true if a session was deleted, false otherwise
	public delete( session: SessionMap[ keyof SessionMap ] )
	{
		const state = this.sessionMap.get( session );

		if ( !state )
			return false;

		[
			state.firstOrigin,
			...state.resolved,
			...( state.match?.names ?? [ ] ),
		]
		.forEach( origin =>
		{
			this.staticMap.delete( makeKey( state.protocol, origin ) );
		} );
		this.sessionMap.delete( session );

		return true;
	}

	public disconnectAll( )
	{
		[ ...this.sessionMap ].forEach( ( [ _, session ] ) =>
		{
			session.cleanup?.( );
		} );

		this.sessionMap.clear( );
		this.staticMap.clear( );
	}

	public disconnect( origin: string )
	{
		[
			this.get( 'https1', origin ),
			this.get( 'https2', origin ),
			this.get( 'http1', origin ),
			this.get( 'http2', origin ),
		]
		.filter( < T >( t: T ): t is NonNullable< T > => !!t )
		.forEach( ( { session } ) =>
		{
			this.sessionMap.get( session )?.cleanup?.( );
			this.delete( session );
		} );
	}
}
