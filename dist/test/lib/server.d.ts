export declare class Server {
    private _server;
    private _sessions;
    port: number;
    constructor();
    private onStream(stream, headers);
    listen(port?: number): Promise<number>;
    shutdown(): Promise<void>;
}
export declare function makeServer(port?: number): Promise<{
    server: Server;
    port: number;
}>;
