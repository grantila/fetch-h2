import { Body, JsonBody, StreamBody, DataBody } from './lib/body';
import { Headers } from './lib/headers';
import { Request } from './lib/request';
import { Response } from './lib/response';
import { AbortError, PushMessage, FetchInit } from './lib/core';
import { ContextOptions } from './lib/context';
declare const fetch: (input: string | Request, init?: Partial<FetchInit>) => Promise<Response>;
declare const disconnect: (url: string) => Promise<void>;
declare const disconnectAll: () => Promise<void>;
declare function context(opts?: ContextOptions): {
    fetch: (input: string | Request, init?: Partial<FetchInit>) => Promise<Response>;
    disconnect: (url: string) => Promise<void>;
    disconnectAll: () => Promise<void>;
};
export { context, fetch, disconnect, disconnectAll, Body, JsonBody, StreamBody, DataBody, Headers, Request, Response, AbortError, PushMessage };
