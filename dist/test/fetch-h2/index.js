'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const chai_1 = require("chai");
const already_1 = require("already");
const through2 = require("through2");
const from2 = require("from2");
const crypto_1 = require("crypto");
const server_1 = require("../lib/server");
const _1 = require("../../");
afterEach(_1.disconnectAll);
async function getRejection(promise) {
    try {
        await promise;
    }
    catch (err) {
        return err;
    }
    throw new Error("Expected exception");
}
function ensureStatusSuccess(response) {
    if (response.status < 200 || response.status >= 300)
        throw new Error("Status not 2xx");
    return response;
}
describe('basic', () => {
    it('should be able to perform simple GET', async () => {
        const { server, port } = await server_1.makeServer();
        const response = ensureStatusSuccess(await _1.fetch(`http://localhost:${port}/headers`));
        const res = await response.json();
        chai_1.expect(res[':path']).to.equal('/headers');
        await server.shutdown();
    });
    it('should be able to set upper-case headers', async () => {
        const { server, port } = await server_1.makeServer();
        const headers = {
            'Content-Type': 'text/foo+text',
            'Content-Length': '6',
        };
        const response = ensureStatusSuccess(await _1.fetch(`http://localhost:${port}/headers`, {
            method: 'POST',
            body: new _1.DataBody("foobar"),
            headers,
        }));
        const res = await response.json();
        for (let [key, val] of Object.entries(headers))
            chai_1.expect(res[key.toLowerCase()]).to.equal(val);
        await server.shutdown();
    });
    it('should be able to set numeric headers', async () => {
        const { server, port } = await server_1.makeServer();
        const headers = {
            'content-type': 'text/foo+text',
            'content-length': 6,
        };
        const response = ensureStatusSuccess(await _1.fetch(`http://localhost:${port}/headers`, {
            method: 'POST',
            body: new _1.DataBody("foobar"),
            headers,
        }));
        const res = await response.json();
        for (let [key, val] of Object.entries(headers))
            chai_1.expect(res[key]).to.equal(`${val}`);
        await server.shutdown();
    });
    it('should be able to POST stream-data with known length', async () => {
        const { server, port } = await server_1.makeServer();
        const stream = through2();
        stream.write("foo");
        const eventual_response = _1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            body: new _1.StreamBody(stream),
            headers: { 'content-length': '6' },
        });
        await already_1.delay(1);
        stream.write("bar");
        stream.end();
        const response = ensureStatusSuccess(await eventual_response);
        const data = await response.text();
        chai_1.expect(data).to.equal("foobar");
        await server.shutdown();
    });
    it('should be able to POST stream-data with unknown length', async () => {
        const { server, port } = await server_1.makeServer();
        const stream = through2();
        stream.write("foo");
        const eventual_response = _1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            body: new _1.StreamBody(stream),
        });
        await already_1.delay(1);
        stream.write("bar");
        stream.end();
        const response = ensureStatusSuccess(await eventual_response);
        const data = await response.text();
        chai_1.expect(data).to.equal("foobar");
        await server.shutdown();
    });
    it('should timeout on a slow request', async () => {
        const { server, port } = await server_1.makeServer();
        const eventual_response = _1.fetch(`http://localhost:${port}/wait/10`, {
            method: 'POST',
            timeout: 8,
        });
        const err = await getRejection(eventual_response);
        chai_1.expect(err.message).to.contain("timed out");
        await server.shutdown();
    });
    it.skip('should be able to POST large stream with known length', async () => {
        const { server, port } = await server_1.makeServer();
        const chunkSize = 16 * 1024;
        const chunks = 1024;
        const chunk = Buffer.allocUnsafe(chunkSize);
        const hash = crypto_1.createHash('sha256');
        let referenceHash;
        let chunkNum = 0;
        const stream = from2((size, next) => {
            if (chunkNum++ === chunks) {
                next(null, null);
                referenceHash = hash.digest("hex");
                return;
            }
            hash.update(chunk);
            next(null, chunk);
        });
        const eventual_response = _1.fetch(`http://localhost:${port}/sha256`, {
            method: 'POST',
            body: new _1.StreamBody(stream),
            headers: { 'content-length': '' + chunkSize * chunks },
        });
        await already_1.delay(1);
        const response = ensureStatusSuccess(await eventual_response);
        const data = await response.text();
        chai_1.expect(data).to.equal(referenceHash);
        await server.shutdown();
    });
    it.skip('should be able to POST large stream with unknown length', async () => {
        //
    });
});
describe('nghttp2.org/httpbin', () => {
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