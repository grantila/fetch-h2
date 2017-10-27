'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const chai_1 = require("chai");
const already_1 = require("already");
const through2 = require("through2");
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
    listen(port = void 0) {
        return new Promise((resolve, reject) => {
            this._server.listen(port, '0.0.0.0', resolve);
        })
            .then(() => this._server.address().port);
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
        const port = await server.listen();
        const response = await _1.fetch(`http://localhost:${port}/`);
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
        const testData = '{"foo": "data"}';
        const response = await _1.fetch('https://nghttp2.org/httpbin/post', {
            method: 'POST',
            body: new _1.DataBody(testData),
        });
        const data = await response.json();
        chai_1.expect(data.data).to.equal(testData);
        chai_1.expect(Object.keys(data.headers)).to.not.contain('Content-Type');
    });
    it('should be possible to POST already ended stream-data', async () => {
        const stream = through2();
        stream.write("foo");
        stream.write("bar");
        stream.end();
        const response = await _1.fetch('https://nghttp2.org/httpbin/post', {
            method: 'POST',
            body: new _1.StreamBody(stream),
            headers: { 'content-length': '6' },
        });
        const data = await response.json();
        chai_1.expect(data.data).to.equal("foobar");
    });
    it('should be possible to POST not yet ended stream-data', async () => {
        const stream = through2();
        const eventual_response = _1.fetch('https://nghttp2.org/httpbin/post', {
            method: 'POST',
            body: new _1.StreamBody(stream),
            headers: { 'content-length': '6' },
        });
        await already_1.delay(1);
        stream.write("foo");
        stream.write("bar");
        stream.end();
        const response = await eventual_response;
        const data = await response.json();
        chai_1.expect(data.data).to.equal("foobar");
    });
    it('should save and forward cookies', async () => {
        const { fetch, disconnectAll } = _1.context();
        const responseSet = await fetch('https://nghttp2.org/httpbin/cookies/set?foo=bar', { redirect: 'manual' });
        chai_1.expect(responseSet.headers.has('location')).to.be.true;
        const redirectedTo = responseSet.headers.get('location');
        const response = await fetch('https://nghttp2.org' + redirectedTo);
        const data = await response.json();
        chai_1.expect(data.cookies).to.deep.equal({ foo: 'bar' });
        await disconnectAll();
    });
});
//# sourceMappingURL=index.js.map