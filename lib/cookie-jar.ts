'use strict'

import { CookieJar as ToughCookieJar, Cookie } from 'tough-cookie'


export class CookieJar
{
	private _jar: ToughCookieJar;

	constructor( )
	{
		this._jar = new ToughCookieJar( );
	}

	setCookie( cookie: string | Cookie, url: string ): Promise< any >
	{
		return new Promise< any >( ( resolve, reject ) =>
		{
			this._jar.setCookie( cookie, url, ( err, cookie ) =>
			{
				if ( err )
					return reject( err );
				resolve( cookie );
			} );
		} );
	}

	async setCookies( cookies: ReadonlyArray< string | Cookie >, url: string )
	: Promise< any >
	{
		await Promise.all(
			cookies.map( cookie => this.setCookie( cookie, url ) )
		);
	}

	getCookies( url: string ): Promise< any >
	{
		return new Promise< any >( ( resolve, reject ) =>
		{
			this._jar.getCookies( url, ( err, cookie ) =>
			{
				if ( err )
					return reject( err );
				resolve( cookie );
			} );
		} );
	}
}
