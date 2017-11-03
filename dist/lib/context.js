'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http2_1 = require("http2");
const url_1 = require("url");
const core_1 = require("./core");
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
function makeOkError(err) {
    err.metaData = err.metaData || {};
    err.metaData.ok = true;
    return err;
}
function isOkError(err) {
    return err.metaData && err.metaData.ok;
}
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
        const makeConnectionTimeout = () => new core_1.TimeoutError(`Connection timeout to ${_url}`);
        const makeError = (event) => event
            ? new Error(`Unknown connection error (${event}): ${_url}`)
            : new Error(`Connection closed`);
        let session;
        const promise = new Promise((resolve, reject) => {
            session =
                options
                    ? http2_1.connect(_url, options, () => resolve(session))
                    : http2_1.connect(_url, () => resolve(session));
            session.once('close', () => reject(makeOkError(makeError())));
            session.once('timeout', () => reject(makeConnectionTimeout()));
            session.once('frameError', (frameType, errorCode, stream) => reject(makeError(`frameError ${errorCode} [type ${frameType}]`)));
            session.once('error', reject);
        });
        return { promise, session };
    }
    getOrCreate(origin, options, created = false) {
        const willCreate = !this._h2sessions.has(origin);
        if (willCreate) {
            const sessionItem = this.connect(origin, options);
            const { promise } = sessionItem;
            // Handle session closure (delete from store)
            promise
                .then(session => {
                session.once('close', () => this.disconnect(origin));
            })
                .catch(() => {
                this.disconnect(origin);
            });
            this._h2sessions.set(origin, sessionItem);
        }
        return this._h2sessions.get(origin).promise
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
    handleDisconnect(sessionItem) {
        const { promise, session } = sessionItem;
        session.destroy();
        return promise
            .then(h2session => { })
            .catch(err => {
            if (!isOkError(err))
                console.warn("Disconnect error", err);
        });
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