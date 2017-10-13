import { Method, ModeTypes, CredentialsTypes, CacheTypes, RedirectTypes, ReferrerTypes, ReferrerPolicyTypes, RequestInit } from './core';
import { Headers } from './headers';
import { Body } from './body';
export declare class Request extends Body {
    private _url;
    private _init;
    readonly method: Method;
    readonly url: string;
    readonly headers: Headers;
    readonly referrer: ReferrerTypes;
    readonly referrerPolicy: ReferrerPolicyTypes;
    readonly mode: ModeTypes;
    readonly credentials: CredentialsTypes;
    readonly redirect: RedirectTypes;
    readonly integrity: string;
    readonly cache: CacheTypes;
    constructor(input: string | Request, init?: Partial<RequestInit>);
    clone(newUrl?: string): Request;
}
