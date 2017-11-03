'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http2_1 = require("http2");
const crypto_1 = require("crypto");
const get_stream_1 = require("get-stream");
const already_1 = require("already");
const { HTTP2_HEADER_PATH, HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH, } = http2_1.constants;
class Server {
    constructor() {
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
            const hash = crypto_1.createHash('sha256');
            const responseHeaders = {
                ':status': 200,
            };
            const data = await get_stream_1.buffer(stream);
            const json = JSON.parse(data.toString());
            stream.respond(responseHeaders, {
                getTrailers(trailers) {
                    Object.assign(trailers, json);
                }
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
        else {
            stream.respond({ ':status': 400 });
            stream.end();
        }
    }
    listen(port = void 0) {
        return new Promise((resolve, reject) => {
            this._server.listen(port, '0.0.0.0', resolve);
        })
            .then(() => this._server.address().port)
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
async function makeServer(port = null) {
    const server = new Server();
    await server.listen(port);
    return { server, port: server.port };
}
exports.makeServer = makeServer;
//# sourceMappingURL=server.js.map