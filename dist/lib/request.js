'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const headers_1 = require("./headers");
const body_1 = require("./body");
const defaultInit = {
    method: 'GET',
    mode: 'same-origin',
    credentials: 'omit',
    cache: 'default',
    redirect: 'manual',
    referrer: 'client',
};
class Request extends body_1.Body {
    constructor(input, init) {
        super();
        // TODO: Consider throwing a TypeError if the URL has credentials
        this._url =
            input instanceof Request
                ? input._url
                : input;
        if (input instanceof Request) {
            if (input.hasBody())
                // Move body to this request
                this.setBody(input);
            const newInit = Object.assign({}, input, init);
            input = input._url;
            init = newInit;
            // TODO: Follow MDN:
            //       If this object exists on another origin to the
            //       constructor call, the Request.referrer is stripped out.
            //       If this object has a Request.mode of navigate, the mode
            //       value is converted to same-origin.
        }
        this._init = Object.assign({}, defaultInit, init);
        const headers = new headers_1.GuardedHeaders(this._init.mode === 'no-cors'
            ? 'request-no-cors'
            : 'request', this._init.headers);
        if (this._init.body) {
            if (headers.has('content-type'))
                this.setBody(this._init.body, headers.get('content-type'));
            else
                this.setBody(this._init.body);
        }
        Object.defineProperties(this, {
            method: {
                enumerable: true,
                value: this._init.method,
            },
            url: {
                enumerable: true,
                value: this._url,
            },
            headers: {
                enumerable: true,
                value: headers,
            },
            referrer: {
                enumerable: true,
                value: this._init.referrer,
            },
            referrerPolicy: {
                enumerable: true,
                value: this._init.referrerPolicy,
            },
            mode: {
                enumerable: true,
                value: this._init.mode,
            },
            credentials: {
                enumerable: true,
                value: this._init.credentials,
            },
            redirect: {
                enumerable: true,
                value: this._init.redirect,
            },
            integrity: {
                enumerable: true,
                value: this._init.integrity,
            },
            cache: {
                enumerable: true,
                value: this._init.cache,
            },
        });
    }
    clone(newUrl) {
        const ret = new Request(this);
        if (newUrl)
            ret._url = newUrl;
        return ret;
    }
}
exports.Request = Request;
//# sourceMappingURL=request.js.map