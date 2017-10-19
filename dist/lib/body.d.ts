/// <reference types="node" />
import { IBody, BodyTypes } from './core';
export declare class Body implements IBody {
    private _body;
    protected _length: number;
    private _used;
    protected _mime?: string;
    private _integrity?;
    readonly bodyUsed: boolean;
    constructor();
    protected hasBody(): boolean;
    protected setBody(body: BodyTypes | IBody, mime?: string, integrity?: string): void;
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
export declare class BodyInspector extends Body {
    private _ref;
    constructor(body: Body);
    private _getMime();
    private _getLength();
    readonly mime: any;
    readonly length: any;
}
