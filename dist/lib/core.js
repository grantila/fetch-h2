'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class AbortError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, AbortError.prototype);
    }
}
exports.AbortError = AbortError;
class TimeoutError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, TimeoutError.prototype);
    }
}
exports.TimeoutError = TimeoutError;
//# sourceMappingURL=core.js.map