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
    it('should not be able to send both json and body', async () => {
        const { server, port } = await server_1.makeServer();
        const eventual_response = _1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            body: 'foo',
            json: { foo: '' }
        });
        const err = await getRejection(eventual_response);
        chai_1.expect(err.message).to.contain('Cannot specify both');
        await server.shutdown();
    });
    it('should be able to send json', async () => {
        const { server, port } = await server_1.makeServer();
        const json = { foo: 'bar' };
        const response = await _1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            json
        });
        const data = await response.json();
        const { headers } = response;
        chai_1.expect(headers.get('content-type')).to.equal('application/json');
        chai_1.expect(data).to.deep.equal(json);
        await server.shutdown();
    });
    it('should be able to send body as string', async () => {
        const { server, port } = await server_1.makeServer();
        const body = "foobar";
        const response = await _1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            body
        });
        const data = await response.text();
        const { headers } = response;
        chai_1.expect(data).to.deep.equal(body);
        await server.shutdown();
    });
    it('should be able to send body as buffer', async () => {
        const { server, port } = await server_1.makeServer();
        const body = Buffer.from("foobar");
        const response = await _1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            body
        });
        const data = await response.arrayBuffer();
        chai_1.expect(Buffer.compare(Buffer.from(data), body)).to.equal(0);
        await server.shutdown();
    });
    it('should be able to send body as readable stream', async () => {
        const { server, port } = await server_1.makeServer();
        const stream = through2();
        stream.write("foo");
        stream.write("bar");
        stream.end();
        const response = await _1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            body: stream,
        });
        const data = await response.text();
        chai_1.expect(data).to.equal("foobar");
        await server.shutdown();
    });
    it('should trigger onTrailers', async () => {
        const { server, port } = await server_1.makeServer();
        const trailers = { foo: 'bar' };
        let onTrailers;
        const trailerPromise = new Promise(resolve => {
            onTrailers = resolve;
        });
        const response = await _1.fetch(`http://localhost:${port}/trailers`, {
            method: 'POST',
            json: trailers,
            onTrailers,
        });
        const data = await response.text();
        const receivedTrailers = await trailerPromise;
        chai_1.expect(data).to.not.be.empty;
        Object.keys(trailers)
            .forEach(key => {
            chai_1.expect(receivedTrailers.get(key)).to.equal(trailers[key]);
        });
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
    it('should not timeout on a fast request', async () => {
        const { server, port } = await server_1.makeServer();
        const response = await _1.fetch(`http://localhost:${port}/wait/1`, {
            method: 'POST',
            timeout: 100,
        });
        chai_1.expect(response.status).to.equal(200);
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
//# sourceMappingURL=index.js.map