'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const http2_1 = require("http2");
const crypto_1 = require("crypto");
const { HTTP2_HEADER_PATH, HTTP2_HEADER_CONTENT_TYPE, HTTP2_HEADER_CONTENT_LENGTH, } = http2_1.constants;
class Server {
    constructor() {
        this._server = http2_1.createServer();
        this._sessions = new Set();
        this.port = null;
        this._server.on('stream', this.onStream.bind(this));
    }
    onStream(stream, headers) {
        this._sessions.add(stream.session);
        stream.session.once('close', () => this._sessions.delete(stream.session));
        const path = headers[HTTP2_HEADER_PATH];
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