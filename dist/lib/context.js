'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http2_1 = require("http2");
const url_1 = require("url");
const callguard_1 = require("callguard");
const core_1 = require("./core");
const request_1 = require("./request");
const response_1 = require("./response");
const version_1 = require("./generated/version");
const fetch_1 = require("./fetch");
const cookie_jar_1 = require("./cookie-jar");
const utils_1 = require("./utils");
const { HTTP2_HEADER_PATH, } = http2_1.constants;
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
        this._h2staleSessions = new Map();
        this.setup(opts);
    }
    setup(opts) {
        opts = opts || {};
        this._userAgent =
            ('userAgent' in opts &&
                'overwriteUserAgent' in opts &&
                opts.overwriteUserAgent)
                ? opts.userAgent
                : 'userAgent' in opts
                    ? opts.userAgent + " " + defaultUserAgent
                    : defaultUserAgent;
        this._accept = 'accept' in opts
            ? opts.accept
            : defaultAccept;
        this._cookieJar = 'cookieJar' in opts
            ? opts.cookieJar
            : new cookie_jar_1.CookieJar();
        this._decoders = 'decoders' in opts
            ? opts.decoders || []
            : [];
        this._sessionOptions = 'session' in opts
            ? opts.session || {}
            : {};
    }
    onPush(pushHandler) {
        this._pushHandler = pushHandler;
    }
    handlePush(origin, pushedStream, requestHeaders) {
        if (!this._pushHandler)
            return; // Drop push. TODO: Signal through error log: #8
        const path = requestHeaders[HTTP2_HEADER_PATH];
        // Remove pseudo-headers
        Object.keys(requestHeaders)
            .filter(name => name.charAt(0) === ':')
            .forEach(name => { delete requestHeaders[name]; });
        const pushedRequest = new request_1.Request(path, { headers: requestHeaders });
        const futureResponse = new Promise((resolve, reject) => {
            const guard = callguard_1.syncGuard(reject, { catchAsync: true });
            pushedStream.once('aborted', () => reject(new core_1.AbortError("Response aborted")));
            pushedStream.once('frameError', () => reject(new Error("Push request failed")));
            pushedStream.once('error', reject);
            pushedStream.once('push', guard(responseHeaders => {
                const response = new response_1.H2StreamResponse(this._decoders, path, pushedStream, responseHeaders, false, null);
                resolve(response);
            }));
        });
        futureResponse
            .catch(err => { }); // TODO: #8
        const getResponse = () => futureResponse;
        return this._pushHandler(origin, pushedRequest, getResponse);
    }
    connect(origin) {
        const makeConnectionTimeout = () => new core_1.TimeoutError(`Connection timeout to ${origin}`);
        const makeError = (event) => event
            ? new Error(`Unknown connection error (${event}): ${origin}`)
            : new Error(`Connection closed`);
        let session;
        // TODO: #8
        const aGuard = callguard_1.asyncGuard(console.error.bind(console));
        const pushHandler = aGuard((stream, headers) => this.handlePush(origin, stream, headers));
        const options = this._sessionOptions;
        const promise = new Promise((resolve, reject) => {
            session =
                http2_1.connect(origin, options, () => resolve(session));
            session.on('stream', pushHandler);
            session.once('close', () => reject(makeOkError(makeError())));
            session.once('timeout', () => reject(makeConnectionTimeout()));
            session.once('error', reject);
        });
        return { promise, session };
    }
    getOrCreate(origin, created = false) {
        const willCreate = !this._h2sessions.has(origin);
        if (willCreate) {
            const sessionItem = this.connect(origin);
            const { promise } = sessionItem;
            // Handle session closure (delete from store)
            promise
                .then(session => {
                session.once('close', () => this.disconnect(origin, session));
                session.once('goaway', (errorCode, lastStreamID, opaqueData) => {
                    utils_1.setGotGoaway(session);
                    this.releaseSession(origin);
                });
            })
                .catch(() => {
                if (sessionItem.session)
                    this.disconnect(origin, sessionItem.session);
            });
            this._h2sessions.set(origin, sessionItem);
        }
        return this._h2sessions.get(origin).promise
            .catch(err => {
            if (willCreate || created)
                // Created in this request, forward error
                throw err;
            // Not created in this request, try again
            return this.getOrCreate(origin, true);
        });
    }
    get(url) {
        const { origin } = new url_1.URL(url);
        return this.getOrCreate(origin);
    }
    handleDisconnect(sessionItem) {
        const { promise, session } = sessionItem;
        if (session)
            session.destroy();
        return promise
            .then(h2session => { })
            .catch(err => {
            const debugMode = false;
            if (debugMode)
                console.warn("Disconnect error", err);
        });
    }
    fetch(input, init) {
        const sessionGetter = {
            get: (url) => this.get(url),
            userAgent: () => this._userAgent,
            accept: () => this._accept,
            cookieJar: this._cookieJar,
            contentDecoders: () => this._decoders,
        };
        return fetch_1.fetch(sessionGetter, input, init);
    }
    releaseSession(origin) {
        const sessionItem = this.deleteActiveSession(origin);
        if (!sessionItem)
            return;
        if (!this._h2staleSessions.has(origin))
            this._h2staleSessions.set(origin, new Set());
        this._h2staleSessions.get(origin).add(sessionItem.session);
    }
    deleteActiveSession(origin) {
        if (!this._h2sessions.has(origin))
            return;
        const sessionItem = this._h2sessions.get(origin);
        this._h2sessions.delete(origin);
        return sessionItem;
    }
    disconnectSession(session) {
        return new Promise(resolve => {
            if (session.destroyed)
                return resolve();
            session.once('close', () => resolve());
            session.destroy();
        });
    }
    disconnectStaleSessions(origin) {
        const promises = [];
        if (this._h2staleSessions.has(origin)) {
            const sessionSet = this._h2staleSessions.get(origin);
            this._h2staleSessions.delete(origin);
            for (let session of sessionSet)
                promises.push(this.disconnectSession(session));
        }
        return Promise.all(promises).then(() => { });
    }
    disconnect(url, session) {
        const { origin } = new url_1.URL(url);
        const promises = [];
        const sessionItem = this.deleteActiveSession(origin);
        if (sessionItem && (!session || sessionItem.session === session))
            promises.push(this.handleDisconnect(sessionItem));
        if (!session) {
            promises.push(this.disconnectStaleSessions(origin));
        }
        else if (this._h2staleSessions.has(origin)) {
            const sessionSet = this._h2staleSessions.get(origin);
            if (sessionSet.has(session)) {
                sessionSet.delete(session);
                promises.push(this.disconnectSession(session));
            }
        }
        return Promise.all(promises).then(() => { });
    }
    disconnectAll() {
        const promises = [];
        for (let eventualH2session of this._h2sessions.values()) {
            promises.push(this.handleDisconnect(eventualH2session));
        }
        this._h2sessions.clear();
        for (let origin of this._h2staleSessions.keys()) {
            promises.push(this.disconnectStaleSessions(origin));
        }
        return Promise.all(promises).then(() => { });
    }
}
exports.Context = Context;
//# sourceMappingURL=context.js.map