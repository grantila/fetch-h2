import { FetchInit, SimpleSession } from './core';
import { Request } from './request';
import { Response } from './response';
export declare function fetch(session: SimpleSession, input: string | Request, init?: Partial<FetchInit>): Promise<Response>;
