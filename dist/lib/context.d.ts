/// <reference types="node" />
import { SecureClientSessionOptions } from 'http2';
import { FetchInit, Decoder } from './core';
import { Request } from './request';
import { Response } from './response';
import { CookieJar } from './cookie-jar';
export interface ContextOptions {
    userAgent: string;
    overwriteUserAgent: boolean;
    accept: string;
    cookieJar: CookieJar;
    decoders: ReadonlyArray<Decoder>;
    session: SecureClientSessionOptions;
}
export declare type PushHandler = (origin: string, request: Request, getResponse: () => Promise<Response>) => void;
export declare class Context {
    private _h2sessions;
    private _userAgent;
    private _accept;
    private _cookieJar;
    private _pushHandler;
    private _decoders;
    private _sessionOptions;
    constructor(opts?: Partial<ContextOptions>);
    setup(opts?: Partial<ContextOptions>): void;
    onPush(pushHandler: PushHandler): void;
    private handlePush;
    private connect;
    private getOrCreate;
    private get;
    private handleDisconnect;
    fetch(input: string | Request, init?: Partial<FetchInit>): Promise<Response>;
    disconnect(url: string): Promise<void>;
    disconnectAll(): Promise<void>;
}
