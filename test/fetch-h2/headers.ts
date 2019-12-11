import { Headers } from "../../index"
import { GuardedHeaders } from "../../lib/headers"


describe( "headers", ( ) =>
{
	describe( "regular", ( ) =>
	{
		it( "empty", async ( ) =>
		{
			const headers = new Headers( );

			expect( headers ).toMatchObject( new Map( ) );
		} );

		it( "value", async ( ) =>
		{
			const headers = new Headers( { a: "b" } );

			expect( headers ).toMatchObject( new Map( [ [ "a", "b" ] ] ) );
		} );
	} );

	describe( "gaurded", ( ) =>
	{
		it( "empty", async ( ) =>
		{
			const headers = new GuardedHeaders( "response" );

			expect( headers ).toMatchObject( new Map( ) );
		} );

		it( "value", async ( ) =>
		{
			const headers = new GuardedHeaders( "response", { a: "b" } );

			expect( headers ).toMatchObject( new Map( [ [ "a", "b" ] ] ) );
		} );
	} );
} );
