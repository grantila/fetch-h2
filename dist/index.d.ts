import { Body, JsonBody, StreamBody, DataBody } from './lib/body';
import { Headers } from './lib/headers';
import { Request } from './lib/request';
import { Response } from './lib/response';
import { AbortError, TimeoutError, FetchInit, OnTrailers } from './lib/core';
import { ContextOptions, PushHandler } from './lib/context';
declare const fetch: (input: string | Request, init?: Partial<FetchInit>) => Promise<Response>;
declare const disconnect: (url: string) => Promise<void>;
declare const disconnectAll: () => Promise<void>;
declare const onPush: (handler: PushHandler) => void;
declare function context(opts?: Partial<ContextOptions>): {
    fetch: (input: string | Request, init?: Partial<FetchInit>) => Promise<Response>;
    disconnect: (url: string) => Promise<void>;
    disconnectAll: () => Promise<void>;
    onPush: (handler: PushHandler) => void;
};
export { context, fetch, disconnect, disconnectAll, onPush, Body, JsonBody, StreamBody, DataBody, Headers, Request, Response, AbortError, TimeoutError, OnTrailers };
