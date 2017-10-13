'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http2_1 = require("http2");
const { HTTP2_HEADER_LOCATION, HTTP2_HEADER_STATUS, HTTP2_HEADER_CONTENT_TYPE, } = http2_1.constants;
const headers_1 = require("./headers");
const body_1 = require("./body");
class Response extends body_1.Body {
    constructor(body, init, extra) {
        super();
        if (body) {
            const contentType = init.headers[HTTP2_HEADER_CONTENT_TYPE];
            if (contentType)
                this.setBody(body, contentType);
            else
                this.setBody(body);
        }
        const _extra = (extra || {});
        const type = _extra.type || 'basic';
        const redirected = !!_extra.redirected || false;
        const url = !!_extra.url || '';
        Object.defineProperties(this, {
            headers: {
                enumerable: true,
                value: init.headers,
            },
            ok: {
                enumerable: true,
                get: () => this.status >= 200 && this.status < 300,
            },
            redirected: {
                enumerable: true,
                value: redirected,
            },
            status: {
                enumerable: true,
                value: init.status,
            },
            statusText: {
                enumerable: true,
                value: init.statusText,
            },
            type: {
                enumerable: true,
                value: type,
            },
            url: {
                enumerable: true,
                value: url,
            },
            useFinalURL: {
                enumerable: true,
                value: undefined,
            },
        });
    }
    // Creates a clone of a Response object.
    clone() {
        const { headers, status, statusText } = this;
        return new Response(this, { headers, status, statusText });
    }
    // Returns a new Response object associated with a network error.
    static error() {
        const headers = new headers_1.GuardedHeaders('immutable');
        const status = 521;
        const statusText = "Web Server Is Down";
        return new Response(null, { headers, status, statusText }, { type: 'error' });
    }
    // Creates a new response with a different URL.
    static redirect(url, status) {
        status = status || 302;
        const headers = {
            [HTTP2_HEADER_LOCATION]: url,
        };
        return new Response(null, { headers, status });
    }
}
exports.Response = Response;
function makeHeadersFromH2Headers(headers) {
    const out = new headers_1.GuardedHeaders('response');
    for (let key of Object.keys(headers)) {
        if (key.startsWith(':'))
            // We ignore pseudo-headers
            continue;
        const value = headers[key];
        if (Array.isArray(value))
            value.forEach(val => out.append(key, val));
        else
            out.set(key, value);
    }
    return out;
}
function makeInit(inHeaders) {
    const status = parseInt('' + inHeaders[HTTP2_HEADER_STATUS]);
    const statusText = ''; // Not supported in H2
    const headers = makeHeadersFromH2Headers(inHeaders);
    return { status, statusText, headers };
}
function makeExtra(url, stream, headers, redirected) {
    const type = 'basic'; // TODO: Implement CORS
    return { redirected, type, url };
}
class H2StreamResponse extends Response {
    constructor(url, stream, headers, redirected) {
        super(stream, makeInit(headers), makeExtra(url, stream, headers, redirected));
    }
}
exports.H2StreamResponse = H2StreamResponse;
//# sourceMappingURL=response.js.map