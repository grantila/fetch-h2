'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const chai_1 = require("chai");
const _1 = require("../../");
afterEach(_1.disconnectAll);
const http2 = require("http2");
class Server {
    constructor() {
        this._server = http2.createServer();
        this._sessions = new Set();
        this._server.on('stream', (stream, headers) => {
            stream.respond({
                'content-type': 'text/plain',
                ':status': 200,
            });
            stream.end(JSON.stringify({ path: headers[':path'] }));
            this._sessions.add(stream.session);
            stream.session.once('close', () => this._sessions.delete(stream.session));
        });
    }
    listen(port) {
        return new Promise((resolve, reject) => {
            this._server.listen(port, '0.0.0.0', resolve);
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
describe('basic', () => {
    it('should be able to perform simple GET', async () => {
        const server = new Server();
        await server.listen(4711);
        const response = await _1.fetch('http://localhost:4711/');
        const res = await response.json();
        chai_1.expect(res.path).to.equal('/');
        await server.shutdown();
    });
    it('should be possible to GET HTTPS/2', async () => {
        const response = await _1.fetch('https://nghttp2.org/httpbin/user-agent');
        const data = await response.json();
        chai_1.expect(data['user-agent']).to.include('fetch-h2/');
    });
    it('should be possible to POST JSON', async () => {
        const testData = { foo: 'bar' };
        const response = await _1.fetch('https://nghttp2.org/httpbin/post', {
            method: 'POST',
            body: new _1.JsonBody(testData),
        });
        const data = await response.json();
        chai_1.expect(testData).to.deep.equal(data.json);
        // fetch-h2 should set content type for JsonBody
        chai_1.expect(data.headers['Content-Type']).to.equal('application/json');
    });
    it('should be possible to POST buffer-data', async () => {
        const testData = '{"foo":"data"}';
        const response = await _1.fetch('https://nghttp2.org/httpbin/post', {
            method: 'POST',
            body: new _1.DataBody(testData),
        });
        const data = await response.json();
        chai_1.expect(data.data).to.equal(testData);
        chai_1.expect(Object.keys(data.headers)).to.not.contain('Content-Type');
    });
});
//# sourceMappingURL=index.js.map