import OriginCache from "../../lib/origin-cache"
import { makeRegex } from "../../lib/san"


describe( "Origin cache", ( ) =>
{
	it( "should handle not-found origins", async ( ) =>
	{
		const oc = new OriginCache( );

		expect( oc.get( "http1", "foo.com" ) ).toBeUndefined( );
	} );

	it( "should handle static and dynamic (wildcard) alt-names", async ( ) =>
	{
		const oc = new OriginCache( );

		const firstOrigin = "example.com";
		const protocol = "http1";
		const session = { };

		oc.set(
			firstOrigin,
			protocol,
			session,
			{
				names: [ firstOrigin, "example.org" ],
				dynamic: ( origin: string ) =>
					!!origin.match( makeRegex( "*.example.com" ) ),
			}
		);

		const result = {
			protocol,
			session,
			firstOrigin,
		};

		expect( oc.get( protocol, "foo.com" ) ).toBeUndefined( );
		expect( oc.get( protocol, "example.com" ) ).toEqual( result );
		expect( oc.get( protocol, "example.org" ) ).toEqual( result );
		expect( oc.get( protocol, "foo.example.com" ) ).toEqual( result );
		expect( oc.get( "http2", "example.com" ) ).toBeUndefined( );
		expect( oc.get( "http2", "example.org" ) ).toBeUndefined( );
		expect( oc.get( "http2", "foo.example.com" ) ).toBeUndefined( );
		expect( oc.get( protocol, "sub.foo.example.com" ) ).toBeUndefined( );
	} );

	it( "should handle origin without alt-names (non-TLS)", async ( ) =>
	{
		const oc = new OriginCache( );

		const firstOrigin = "example.com";
		const protocol = "http1";
		const session = { };

		oc.set(
			firstOrigin,
			protocol,
			session
		);

		const result = {
			protocol,
			session,
			firstOrigin,
		};

		expect( oc.get( protocol, "foo.com" ) ).toBeUndefined( );
		expect( oc.get( protocol, "example.com" ) ).toEqual( result );
		expect( oc.get( protocol, "foo.example.com" ) ).toBeUndefined( );
		expect( oc.get( "http2", "example.com" ) ).toBeUndefined( );
		expect( oc.get( "http2", "example.org" ) ).toBeUndefined( );
		expect( oc.get( "http2", "foo.example.com" ) ).toBeUndefined( );
		expect( oc.get( protocol, "sub.foo.example.com" ) ).toBeUndefined( );
	} );

	it( "should cleanup properly", async ( ) =>
	{
		const oc = new OriginCache( );

		const firstOrigin = "example.com";
		const protocol = "http1";
		const session = { };

		oc.set(
			firstOrigin,
			protocol,
			session,
			{
				names: [ firstOrigin, "example.org" ],
				dynamic: ( origin: string ) =>
					!!origin.match( makeRegex( "*.example.com" ) ),
			}
		);

		oc.get( protocol, "foo.com" );
		oc.get( protocol, "example.com" );
		oc.get( protocol, "example.org" );
		oc.get( protocol, "foo.example.com" );
		oc.get( protocol, "sub.foo.example.com" );

		expect( oc.delete( session ) ).toBe( true );

		expect( ( oc as any ).sessionMap.size ).toBe( 0 );
		expect( ( oc as any ).staticMap.size ).toBe( 0 );

		expect( oc.delete( session ) ).toBe( false );
		expect( oc.delete( "foo" ) ).toBe( false );
	} );
} );
