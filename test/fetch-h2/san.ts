import { parseOrigin, makeRegex } from "../../lib/san"
import { PeerCertificate } from "tls"


describe( "SAN", ( ) =>
{
	describe( "makeRegex", ( ) =>
	{
		it( "should handle non alpha-numeric characters right", async ( ) =>
		{
			const regex = makeRegex( "*.example-domain.com" );

			expect( regex ).toBe( "^[^.]+\\.example\\-domain\\.com$" );

			const re = new RegExp( regex );
			const testOrigin = "foo.example-domain.com";
			const m = testOrigin.match( re ) as RegExpMatchArray;

			expect( m[ 0 ] ).toBe( testOrigin );
		} );

		it( "should not allow sub-domains", async ( ) =>
		{
			const regex = makeRegex( "*.example-domain.com" );

			const re = new RegExp( regex );
			const testOrigin = "sub.foo.example-domain.com";

			expect( testOrigin.match( re ) ).toBeNull( );
		} );
	} );

	it( "Should match on CN when no SAN is provided (plain)", ( ) =>
	{
		const cert = { subject: { CN: "foo.com" } } as PeerCertificate;
		const { names, dynamic } = parseOrigin( cert );
		expect( names ).toStrictEqual( [ "foo.com" ] );
		expect( dynamic ).toBe( undefined );
	} );

	it( "Should match on CN when no SAN is provided (dynamic)", ( ) =>
	{
		const cert = { subject: { CN: "*.foo.com" } } as PeerCertificate;
		const { names, dynamic } = parseOrigin( cert );
		expect( names.length ).toBe( 0 );
		expect( dynamic?.( "test.foo.com" ) ).toBe( true );
	} );

	describe( "Multi wildcard domains", ( ) =>
	{
		it( "Should throw on double-wildcards", ( ) =>
		{
			const cert = { subject: { CN: "*.*.foo.com" } } as PeerCertificate;
			const test = ( ) => parseOrigin( cert );
			expect( test ).toThrow( /invalid/i );
		} );

		const subjectaltname = [
			"DNS:foo.com",
			"DNS:bar.com",
			"DNS:example1.com",
			"DNS:*.example1.com",
			"DNS:*.example2.com",
		].join( ", " );

		const certs = [
			{
				name: "CN is wildcard",
				cert: {
					subject: { CN: "*.example1.com" },
					subjectaltname,
				} as PeerCertificate,
			},
			{
				name: "CN is plain",
				cert: {
					subject: { CN: "example1.com" },
					subjectaltname,
				} as PeerCertificate,
			},
			{
				name: "CN is wildcard but not in SAN",
				cert: {
					subject: { CN: "*.invalid.com" },
					subjectaltname,
				} as PeerCertificate,
			},
			{
				name: "CN is plain but not in SAN",
				cert: {
					subject: { CN: "invalid.com" },
					subjectaltname,
				} as PeerCertificate,
			},
		];

		certs.forEach( ( { name, cert } ) => describe( name, ( ) =>
		{
			it( `Should not match other domains`, ( ) =>
			{
				const { names, dynamic } = parseOrigin( cert );

				expect( names.includes( "invalid.com" ) ).toBe( false );
				expect( dynamic?.( "invalid.com" ) ).toBe( false );
				expect( dynamic?.( "test.invalid.com" ) ).toBe( false );
				expect( dynamic?.( "sub.foo.com" ) ).toBe( false );
				expect( dynamic?.( "sub.bar.com" ) ).toBe( false );
			} );

			it( `Should handle plain names`, ( ) =>
			{
				const match = parseOrigin( cert );

				expect( match.dynamic?.( "foo.com" ) ).toBe( false );
				expect( match.dynamic?.( "bar.com" ) ).toBe( false );
				expect( match.names.includes( "foo.com" ) ).toBe( true );
				expect( match.names.includes( "bar.com" ) ).toBe( true );
				expect( match.names.includes( "example1.com" ) ).toBe( true );
			} );

			it( `Should not wildcard plain names`, ( ) =>
			{
				const match = parseOrigin( cert );

				expect( match.dynamic?.( "sub.example1.com" ) ).toBe( true );
				expect( match.dynamic?.( "sub.example2.com" ) ).toBe( true );
			} );
		} ) );
	} );
} );
