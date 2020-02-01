import { makeRegex } from "../../lib/san"


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
} );
