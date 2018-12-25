import { Cookie, CookieJar as ToughCookieJar } from "tough-cookie";


export class CookieJar
{
	private _jar: ToughCookieJar;

	constructor( jar = new ToughCookieJar( ) )
	{
		this._jar = jar;
	}

	public reset( jar = new ToughCookieJar( ) )
	{
		this._jar = jar;
	}

	public setCookie( cookie: string | Cookie, url: string ): Promise< Cookie >
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

	public setCookies( cookies: ReadonlyArray< string | Cookie >, url: string )
	: Promise< ReadonlyArray< Cookie > >
	{
		return Promise.all(
			cookies.map( cookie => this.setCookie( cookie, url ) )
		);
	}

	public getCookies( url: string ): Promise< ReadonlyArray< Cookie > >
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
