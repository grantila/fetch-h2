/// <reference types="node" />
import { ClientHttp2Stream, IncomingHttpHeaders } from 'http2';
import { BodyTypes, ResponseInit, ResponseTypes, Decoder } from './core';
import { Headers } from './headers';
import { Body } from './body';
interface Extra {
    redirected: boolean;
    integrity: string;
    type: ResponseTypes;
    url: string;
}
export declare class Response extends Body {
    readonly headers: Headers;
    readonly ok: boolean;
    readonly redirected: boolean;
    readonly status: number;
    readonly statusText: string;
    readonly type: ResponseTypes;
    readonly url: string;
    readonly useFinalURL: boolean;
    constructor(body?: BodyTypes | Body, init?: Partial<ResponseInit>, extra?: Partial<Extra>);
    clone(): Response;
    static error(): Response;
    static redirect(url: string, status?: number): Response;
}
export declare class H2StreamResponse extends Response {
    constructor(contentDecoders: ReadonlyArray<Decoder>, url: string, stream: ClientHttp2Stream, headers: IncomingHttpHeaders, redirected: boolean, integrity: string);
}
export {};
