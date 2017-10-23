import { FetchInit } from './core';
import { Request } from './request';
import { Response } from './response';
import { CookieJar } from './cookie-jar';
export interface ContextOptions {
    userAgent: string;
    overwriteUserAgent: boolean;
    accept: string;
    cookieJar: CookieJar;
}
export declare class Context {
    private _h2sessions;
    private _userAgent;
    private _accept;
    private _cookieJar;
    constructor(opts?: Partial<ContextOptions>);
    private connect(url, options?);
    private getOrCreate(origin, options, created?);
    private get(url, options?);
    private handleDisconnect(eventualH2session);
    fetch(input: string | Request, init?: Partial<FetchInit>): Promise<Response>;
    disconnect(url: string): Promise<void>;
    disconnectAll(): Promise<void>;
}
