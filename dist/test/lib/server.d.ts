/// <reference types="node" />
import { ServerHttp2Stream, IncomingHttpHeaders } from 'http2';
export interface MatchData {
    path: string;
    stream: ServerHttp2Stream;
    headers: IncomingHttpHeaders;
}
export declare type Matcher = (matchData: MatchData) => boolean;
export interface ServerOptions {
    port?: number;
    matchers?: ReadonlyArray<Matcher>;
}
export declare class Server {
    private _opts;
    private _server;
    private _sessions;
    port: number;
    constructor(opts: ServerOptions);
    private onStream(stream, headers);
    listen(port?: number): Promise<number>;
    shutdown(): Promise<void>;
}
export declare function makeServer(opts?: ServerOptions): Promise<{
    server: Server;
    port: number;
}>;
