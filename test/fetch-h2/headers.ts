import { Headers } from "../../index";
import { GuardedHeaders } from "../../lib/headers";


const toObject = ( keyvals: IterableIterator< [ string, string ] > ) =>
	[ ...keyvals ].reduce(
		( prev, cur ) =>
			Object.assign( prev, { [ cur[ 0 ] ]: cur[ 1 ] } )
		,
		{ }
	);

describe( "headers", ( ) =>
{
	describe( "regular", ( ) =>
	{
		it( "empty", async ( ) =>
		{
			const headers = new Headers( );

			expect( toObject( headers.entries( ) ) ).toMatchObject( { } );
		} );

		it( "value", async ( ) =>
		{
			const headers = new Headers( { a: "b" } );

			expect( toObject( headers.entries( ) ) )
				.toMatchObject( { a: "b" } );
		} );
	} );

	describe( "guarded", ( ) =>
	{
		it( "empty", async ( ) =>
		{
			const headers = new GuardedHeaders( "response" );

			expect( toObject( headers.entries( ) ) ).toMatchObject( { } );
		} );

		it( "value", async ( ) =>
		{
			const headers = new GuardedHeaders( "response", { a: "b" } );

			expect( toObject( headers.entries( ) ) )
				.toMatchObject( { a: "b" } );
		} );
	} );

	describe( "iterable", ( ) =>
	{
		it( "for-of iterable", async ( ) =>
		{
			const headers = new GuardedHeaders( "response" );
			headers.append( "foo", "bar" );
			headers.append( "foo", "baz" );
			headers.append( "a", "b" );

			const test: any = { };
			for ( const [ key, value ] of headers )
			{
				test[ key ] = value;
			}

			expect( test ).toMatchObject( {
				a: "b",
				foo: "bar,baz",
			} );
		} );
	} );
} );
