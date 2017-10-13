/// <reference types="node" />
import { IBody, BodyTypes } from './core';
export declare class Body implements IBody {
    private _body;
    private _used;
    private _mime?;
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
