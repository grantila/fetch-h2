'use strict'

import { CookieJar as ToughCookieJar, Cookie } from 'tough-cookie'


export class CookieJar
{
	private _jar: ToughCookieJar;

	constructor( jar = new ToughCookieJar( ) )
	{
		this.reset( jar );
	}

	reset( jar = new ToughCookieJar( ) )
	{
		this._jar = jar;
	}

	setCookie( cookie: string | Cookie, url: string ): Promise< Cookie >
	{
		return new Promise< Cookie >( ( resolve, reject ) =>
		{
			this._jar.setCookie( cookie, url, ( err, cookie ) =>
			{
				if ( err )
					return reject( err );
				resolve( cookie );
			} );
		} );
	}

	setCookies( cookies: ReadonlyArray< string | Cookie >, url: string )
	: Promise< ReadonlyArray< Cookie > >
	{
		return Promise.all(
			cookies.map( cookie => this.setCookie( cookie, url ) )
		);
	}

	getCookies( url: string ): Promise< ReadonlyArray< Cookie > >
	{
		return new Promise< ReadonlyArray< Cookie > >( ( resolve, reject ) =>
		{
			this._jar.getCookies( url, ( err, cookies ) =>
			{
				if ( err )
					return reject( err );
				resolve( cookies );
			} );
		} );
	}
}
