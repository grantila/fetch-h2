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
export declare type PushHandler = (origin: string, request: Request, getResponse: () => Promise<Response>) => void;
export declare class Context {
    private _h2sessions;
    private _userAgent;
    private _accept;
    private _cookieJar;
    private _pushHandler;
    constructor(opts?: Partial<ContextOptions>);
    onPush(pushHandler: PushHandler): void;
    private handlePush(origin, pushedStream, requestHeaders);
    private connect(origin, options?);
    private getOrCreate(origin, options, created?);
    private get(url, options?);
    private handleDisconnect(sessionItem);
    fetch(input: string | Request, init?: Partial<FetchInit>): Promise<Response>;
    disconnect(url: string): Promise<void>;
    disconnectAll(): Promise<void>;
}
