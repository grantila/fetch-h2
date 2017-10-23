import { Cookie } from 'tough-cookie';
export declare class CookieJar {
    private _jar;
    constructor();
    setCookie(cookie: string | Cookie, url: string): Promise<any>;
    setCookies(cookies: ReadonlyArray<string | Cookie>, url: string): Promise<any>;
    getCookies(url: string): Promise<any>;
}
