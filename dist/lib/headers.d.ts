export declare const Guards: string[];
export declare type GuardTypes = 'immutable' | 'request' | 'request-no-cors' | 'response' | 'none';
export declare type RawHeaders = {
    [key: string]: string | string[];
};
export declare class Headers {
    protected _guard: GuardTypes;
    private _data;
    constructor(init?: RawHeaders | Headers);
    append(name: string, value: string): void;
    delete(name: string): void;
    entries(): IterableIterator<[string, string]>;
    get(name: string): string;
    has(name: string): boolean;
    keys(): IterableIterator<string>;
    set(name: string, value: string): void;
    values(): IterableIterator<string>;
}
export declare class GuardedHeaders extends Headers {
    constructor(guard: GuardTypes, init?: RawHeaders | Headers);
}
