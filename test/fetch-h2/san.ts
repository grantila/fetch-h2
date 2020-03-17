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

	describe( "Multi wildcard domains", ( ) =>
	{
		it( "Should throw on double-wildcards", ( ) =>
		{
			const cert = { subject: { CN: "*.*.foo.com" } } as PeerCertificate;
			const test = ( ) => parseOrigin( cert );
			expect( test ).toThrow( /invalid/i );
		} );

		const certs = [
			{
				name: "CN is wildcard",
				cert: {
					subject: { CN: "*.example1.com" },
					subjectaltname:
						"DNS:foo.com, DNS:bar.com, DNS:*.example2.com",
				} as PeerCertificate,
			},
			{
				name: "CN is plain",
				cert: {
					subject: { CN: "foo.com" },
					subjectaltname:
						"DNS:bar.com, DNS:*.example1.com, DNS:*.example2.com",
				} as PeerCertificate,
			},
		];

		certs.forEach( ( { name, cert } ) => describe( name, ( ) =>
		{
			it( `Should not match other domains`, ( ) =>
			{
				const match = parseOrigin( cert );

				expect( match.dynamic?.( "other.com" ) ).toBe( false );
				expect( match.dynamic?.( "sub.foo.com" ) ).toBe( false );
				expect( match.dynamic?.( "sub.bar.com" ) ).toBe( false );
			} );

			it( `Should not plain origins`, ( ) =>
			{
				const match = parseOrigin( cert );

				expect( match.dynamic?.( "foo.com" ) ).toBe( false );
				expect( match.dynamic?.( "bar.com" ) ).toBe( false );
				expect( match.names.includes( "foo.com" ) ).toBe( true );
				expect( match.names.includes( "bar.com" ) ).toBe( true );
			} );

			it( `Should not wildcard origins`, ( ) =>
			{
				const match = parseOrigin( cert );

				expect( match.dynamic?.( "sub.example1.com" ) ).toBe( true );
				expect( match.dynamic?.( "sub.example2.com" ) ).toBe( true );
			} );
		} ) );
	} );
} );
