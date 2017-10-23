export declare function arrayify<T>(value: T | Array<T>): Array<T>;
export declare function arrayify<T>(value: Readonly<T> | ReadonlyArray<T>): Array<T>;
export declare type GuardFunAny = (fn: (...args) => void | PromiseLike<void>) => (...args) => void;
export declare function makeGuard(rejector: (err: Error) => void): GuardFunAny;
