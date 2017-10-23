'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
exports.Guards = ['immutable', 'request', 'request-no-cors', 'response', 'none'];
const forbiddenHeaders = [
    'accept-charset',
    'accept-encoding',
    'access-control-request-headers',
    'access-control-request-method',
    'connection',
    'content-length',
    'cookie',
    'cookie2',
    'date',
    'dnt',
    'expect',
    'host',
    'keep-alive',
    'origin',
    'referer',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'via',
];
function isForbiddenHeader(name) {
    if (name.startsWith('proxy-') || name.startsWith('sec-'))
        // Safe headers
        return false;
    return forbiddenHeaders.includes(name);
}
function isForbiddenResponseHeader(name) {
    return ['set-cookie', 'set-cookie2'].includes(name);
}
function isSimpleHeader(name, value) {
    const simpleHeaders = [
        'accept',
        'accept-language',
        'content-language',
        'dpr',
        'downlink',
        'save-data',
        'viewport-width',
        'width',
    ];
    if (simpleHeaders.includes(name))
        return true;
    if (name !== 'content-type')
        return false;
    const mimeType = value.replace(/;.*/, '').toLowerCase();
    return [
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/plain'
    ].includes(mimeType);
}
function filterName(name) {
    if (/[^A-Za-z0-9\-#$%&'*+.\^_`|~]/.test(name))
        throw new TypeError('Invalid character in header field name');
    return name.toLowerCase();
}
function _ensureGuard(guard, name, value) {
    if (guard === 'immutable')
        throw new TypeError('Header guard error: Cannot change immutable header');
    if (!name)
        return;
    if (guard === 'request' && isForbiddenHeader(name))
        throw new TypeError('Header guard error: ' +
            'Cannot set forbidden header for requests' +
            ` (${name})`);
    if (guard === 'request-no-cors' && !isSimpleHeader(name, value))
        throw new TypeError('Header guard error: ' +
            'Cannot set non-simple header for no-cors requests' +
            ` (${name})`);
    if (guard === 'response' && isForbiddenResponseHeader(name))
        throw new TypeError('Header guard error: ' +
            'Cannot set forbidden response header for response' +
            ` (${name})`);
}
let _guard = null;
class Headers {
    constructor(init) {
        this._guard = _guard || 'none';
        _guard = null;
        this._data = new Map();
        if (!init)
            return;
        else if (init instanceof Headers) {
            for (let [name, value] of init._data.entries())
                this._data.set(name, [...value]);
        }
        else {
            for (let _name of Object.keys(init)) {
                const name = filterName(_name);
                const value = utils_1.arrayify(init[name]);
                this._data.set(name, [...value]);
            }
        }
    }
    append(name, value) {
        const _name = filterName(name);
        _ensureGuard(this._guard, _name, value);
        if (!this._data.has(_name))
            this._data.set(_name, [value]);
        else
            this._data.get(_name).push(value);
    }
    delete(name) {
        const _name = filterName(name);
        _ensureGuard(this._guard);
        this._data.delete(_name);
    }
    *entries() {
        for (let [name] of this._data.entries())
            yield [name, this._data.get(name).join(',')];
    }
    get(name) {
        const _name = filterName(name);
        return this._data.has(name)
            ? this._data.get(name).join(',')
            : null;
    }
    has(name) {
        return this._data.has(filterName(name));
    }
    keys() {
        return this._data.keys();
    }
    set(name, value) {
        const _name = filterName(name);
        _ensureGuard(this._guard, _name, value);
        this._data.set(_name, [value]);
    }
    *values() {
        for (let value of this._data.values())
            yield value.join(',');
    }
}
exports.Headers = Headers;
class GuardedHeaders extends Headers {
    constructor(guard, init) {
        super((_guard = guard, init));
    }
}
exports.GuardedHeaders = GuardedHeaders;
//# sourceMappingURL=headers.js.map