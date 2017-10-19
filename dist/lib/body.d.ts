/// <reference types="node" />
import { IBody, BodyTypes } from './core';
export declare class Body implements IBody {
    private _body;
    private _length;
    private _used;
    private _mime?;
    private _integrity?;
    readonly bodyUsed: boolean;
    constructor();
    protected hasBody(): boolean;
    protected setBody(body: BodyTypes | IBody, mime?: string, integrity?: string): void;
    readonly mime: string;
    readonly length: number;
    private _ensureUnused();
    arrayBuffer(): Promise<ArrayBuffer>;
    private blob();
    formData(): Promise<never>;
    json(): Promise<any>;
    text(): Promise<string>;
    readable(): Promise<NodeJS.ReadableStream>;
}
export declare class JsonBody extends Body {
    constructor(obj: any);
}
export declare class StreamBody extends Body {
    constructor(readable: NodeJS.ReadableStream);
}
export declare class DataBody extends Body {
    constructor(data: Buffer | string);
}
