/// <reference types="node" />
import { ClientHttp2Session } from 'http2';
export declare function arrayify<T>(value: T | Array<T>): Array<T>;
export declare function arrayify<T>(value: Readonly<T> | ReadonlyArray<T>): Array<T>;
export declare function parseLocation(location: string, origin: string): string;
export declare function hasGotGoaway(session: ClientHttp2Session): boolean;
export declare function setGotGoaway(session: ClientHttp2Session): void;
