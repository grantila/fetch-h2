'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http2_1 = require("http2");
const crypto_1 = require("crypto");
const zlib_1 = require("zlib");
const get_stream_1 = require("get-stream");
const already_1 = require("already");
const { HTTP2_HEADER_PATH, HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH, HTTP2_HEADER_ACCEPT_ENCODING, HTTP2_HEADER_SET_COOKIE, } = http2_1.constants;
class Server {
    constructor(opts) {
        this._opts = opts || {};
        if (this._opts.serverOptions)
            this._server = http2_1.createSecureServer(this._opts.serverOptions);
        else
            this._server = http2_1.createServer();
        this._sessions = new Set();
        this.port = null;
        this._server.on('stream', (stream, headers) => {
            this.onStream(stream, headers)
                .catch(err => {
                console.error("Unit test server failed", err);
                process.exit(1);
            });
        });
    }
    async onStream(stream, headers) {
        this._sessions.add(stream.session);
        stream.session.once('close', () => this._sessions.delete(stream.session));
        const path = headers[HTTP2_HEADER_PATH];
        let m;
        if (path === '/headers') {
            stream.respond({
                'content-type': 'application/json',
                ':status': 200,
            });
            stream.end(JSON.stringify(headers));
        }
        else if (path === '/echo') {
            const responseHeaders = {
                ':status': 200,
            };
            [HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH]
                .forEach(name => {
                responseHeaders[name] = headers[name];
            });
            stream.respond(responseHeaders);
            stream.pipe(stream);
        }
        else if (path === '/set-cookie') {
            const responseHeaders = {
                ':status': 200,
                [HTTP2_HEADER_SET_COOKIE]: [],
            };
            const data = await get_stream_1.buffer(stream);
            const json = JSON.parse(data.toString());
            json.forEach(cookie => {
                responseHeaders[HTTP2_HEADER_SET_COOKIE].push(cookie);
            });
            stream.respond(responseHeaders);
            stream.end();
        }
        else if (m = path.match(/\/wait\/(.+)/)) {
            const timeout = parseInt(m[1]);
            await already_1.delay(timeout);
            const responseHeaders = {
                ':status': 200,
            };
            [HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH]
                .forEach(name => {
                responseHeaders[name] = headers[name];
            });
            try {
                stream.respond(responseHeaders);
                stream.pipe(stream);
            }
            catch (err) 
            // We ignore errors since this route is used to intentionally
            // timeout, which causes us to try to write to a closed stream.
            { }
        }
        else if (path === '/trailers') {
            const responseHeaders = {
                ':status': 200,
            };
            const data = await get_stream_1.buffer(stream);
            const json = JSON.parse(data.toString());
            stream.once('wantTrailers', () => {
                stream.sendTrailers(json);
            });
            stream.respond(responseHeaders, {
                waitForTrailers: true,
            });
            stream.write("trailers will be sent");
            stream.end();
        }
        else if (path === '/sha256') {
            const hash = crypto_1.createHash('sha256');
            const responseHeaders = {
                ':status': 200,
            };
            stream.respond(responseHeaders);
            hash.on('readable', () => {
                const data = hash.read();
                if (data) {
                    stream.write(data.toString('hex'));
                    stream.end();
                }
            });
            stream.pipe(hash);
        }
        else if (path === '/push') {
            const responseHeaders = {
                ':status': 200,
            };
            const data = await get_stream_1.buffer(stream);
            const json = JSON.parse(data.toString());
            json.forEach(pushable => {
                function cb(err, pushStream) {
                    if (err)
                        return;
                    if (pushable.data)
                        pushStream.write(pushable.data);
                    pushStream.end();
                }
                stream.pushStream(pushable.headers || {}, cb);
            });
            stream.respond(responseHeaders);
            stream.write("push-route");
            stream.end();
        }
        else if (path.startsWith('/compressed/')) {
            const encoding = path.replace('/compressed/', '');
            const accept = headers[HTTP2_HEADER_ACCEPT_ENCODING];
            if (!accept.includes(encoding)) {
                stream.destroy();
                return;
            }
            const encoder = encoding === 'gzip'
                ? zlib_1.createGzip()
                : encoding === 'deflate'
                    ? zlib_1.createDeflate()
                    : null;
            const responseHeaders = {
                ':status': 200,
                'content-encoding': encoding,
            };
            stream.respond(responseHeaders);
            stream.pipe(encoder).pipe(stream);
        }
        else {
            const matched = (this._opts.matchers || [])
                .some(matcher => matcher({ path, stream, headers }));
            if (!matched) {
                stream.respond({ ':status': 400 });
                stream.end();
            }
        }
    }
    listen(port = void 0) {
        return new Promise((resolve, reject) => {
            this._server.listen(port, '0.0.0.0', resolve);
        })
            .then(() => {
            const address = this._server.address();
            if (typeof address === 'string')
                return 0;
            return address.port;
        })
            .then(port => {
            this.port = port;
            return port;
        });
    }
    shutdown() {
        return new Promise((resolve, reject) => {
            for (let session of this._sessions) {
                session.destroy();
            }
            this._server.close(resolve);
        });
    }
}
exports.Server = Server;
async function makeServer(opts = {}) {
    opts = opts || {};
    const server = new Server(opts);
    await server.listen(opts.port);
    return { server, port: server.port };
}
exports.makeServer = makeServer;
//# sourceMappingURL=server.js.map