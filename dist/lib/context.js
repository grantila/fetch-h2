'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http2_1 = require("http2");
const url_1 = require("url");
const version_1 = require("./generated/version");
const fetch_1 = require("./fetch");
const cookie_jar_1 = require("./cookie-jar");
function makeDefaultUserAgent() {
    const name = `fetch-h2/${version_1.version} (+https://github.com/grantila/fetch-h2)`;
    const node = `nodejs/${process.versions.node}`;
    const nghttp2 = `nghttp2/${process.versions.nghttp2}`;
    const uv = `uv/${process.versions.uv}`;
    return `${name} ${node} ${nghttp2} ${uv}`;
}
const defaultUserAgent = makeDefaultUserAgent();
const defaultAccept = 'application/json, text/*;0.9, */*;q=0.8';
class Context {
    constructor(opts) {
        this._h2sessions = new Map();
        this._userAgent =
            (opts &&
                'userAgent' in opts &&
                'overwriteUserAgent' in opts &&
                opts.overwriteUserAgent)
                ? opts.userAgent
                : opts && 'userAgent' in opts
                    ? opts.userAgent + " " + defaultUserAgent
                    : defaultUserAgent;
        this._accept = opts && 'accept' in opts
            ? opts.accept
            : defaultAccept;
        this._cookieJar = opts && 'cookieJar' in opts
            ? opts.cookieJar
            : new cookie_jar_1.CookieJar();
    }
    connect(url, options) {
        const _url = 'string' === typeof url ? url : url.toString();
        return new Promise((resolve, reject) => {
            const h2session = options
                ? http2_1.connect(_url, options, () => resolve(h2session))
                : http2_1.connect(_url, () => resolve(h2session));
            h2session.once('error', reject);
        });
    }
    getOrCreate(origin, options, created = false) {
        const willCreate = !this._h2sessions.has(origin);
        if (willCreate) {
            const h2Session = this.connect(origin, options);
            // Handle session closure (delete from store)
            h2Session
                .then(session => {
                session.once('close', () => this.disconnect(origin));
            })
                .catch(() => {
                this.disconnect(origin);
            });
            this._h2sessions.set(origin, h2Session);
        }
        return this._h2sessions.get(origin)
            .catch(err => {
            if (willCreate || created)
                // Created in this request, forward error
                throw err;
            // Not created in this request, try again
            return this.getOrCreate(origin, options, true);
        });
    }
    get(url, options) {
        const { origin } = new url_1.URL(url);
        return this.getOrCreate(origin, options);
    }
    handleDisconnect(eventualH2session) {
        return eventualH2session
            .then(h2session => {
            h2session.destroy();
        })
            .catch(err => { });
    }
    fetch(input, init) {
        const sessionGetter = {
            get: (url, options) => this.get(url, options),
            userAgent: () => this._userAgent,
            accept: () => this._accept,
            cookieJar: this._cookieJar,
        };
        return fetch_1.fetch(sessionGetter, input, init);
    }
    disconnect(url) {
        const { origin } = new url_1.URL(url);
        if (!this._h2sessions.has(origin))
            return;
        const prom = this.handleDisconnect(this._h2sessions.get(origin));
        this._h2sessions.delete(origin);
        return prom;
    }
    disconnectAll() {
        const promises = [];
        for (let [origin, eventualH2session] of this._h2sessions) {
            promises.push(this.handleDisconnect(eventualH2session));
        }
        this._h2sessions.clear();
        return Promise.all(promises).then(() => { });
    }
}
exports.Context = Context;
//# sourceMappingURL=context.js.map