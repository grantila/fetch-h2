'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const chai_1 = require("chai");
const already_1 = require("already");
const through2 = require("through2");
const from2 = require("from2");
const crypto_1 = require("crypto");
const get_stream_1 = require("get-stream");
const server_1 = require("../lib/server");
const utils_1 = require("../lib/utils");
const __1 = require("../../");
afterEach(__1.disconnectAll);
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
        const response = ensureStatusSuccess(await __1.fetch(`http://localhost:${port}/headers`));
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
        const response = ensureStatusSuccess(await __1.fetch(`http://localhost:${port}/headers`, {
            method: 'POST',
            body: new __1.DataBody("foobar"),
            headers,
        }));
        const res = await response.json();
        for (let [key, val] of Object.entries(headers))
            chai_1.expect(res[key.toLowerCase()]).to.equal(val);
        await server.shutdown();
    });
    it('should be able to get upper-case headers', async () => {
        const { server, port } = await server_1.makeServer();
        const json = { foo: 'bar' };
        const response = await __1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            json
        });
        const data = await response.json();
        const { headers } = response;
        chai_1.expect(headers.get('Content-Type')).to.equal('application/json');
        chai_1.expect(data).to.deep.equal(json);
        await server.shutdown();
    });
    it('should be able to set numeric headers', async () => {
        const { server, port } = await server_1.makeServer();
        const headers = {
            'content-type': 'text/foo+text',
            'content-length': 6,
        };
        const response = ensureStatusSuccess(await __1.fetch(`http://localhost:${port}/headers`, {
            method: 'POST',
            body: new __1.DataBody("foobar"),
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
        const eventual_response = __1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            body: new __1.StreamBody(stream),
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
        const eventual_response = __1.fetch(`http://localhost:${port}/echo`, {
            method: 'POST',
            body: new __1.StreamBody(stream),
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
        const eventual_response = __1.fetch(`http://localhost:${port}/echo`, {
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
        const response = await __1.fetch(`http://localhost:${port}/echo`, {
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
        const response = await __1.fetch(`http://localhost:${port}/echo`, {
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
        const response = await __1.fetch(`http://localhost:${port}/echo`, {
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
        const response = await __1.fetch(`http://localhost:${port}/echo`, {
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
        const response = await __1.fetch(`http://localhost:${port}/trailers`, {
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
    it('should timeout on a slow request', async function () {
        this.timeout(500);
        const { server, port } = await server_1.makeServer();
        const eventual_response = __1.fetch(`http://localhost:${port}/wait/20`, {
            method: 'POST',
            timeout: 8,
        });
        const err = await getRejection(eventual_response);
        chai_1.expect(err.message).to.contain("timed out");
        await server.shutdown();
    });
    it('should not timeout on a fast request', async () => {
        const { server, port } = await server_1.makeServer();
        const response = await __1.fetch(`http://localhost:${port}/wait/1`, {
            method: 'POST',
            timeout: 100,
        });
        chai_1.expect(response.status).to.equal(200);
        await server.shutdown();
    });
    it('should be able to POST large (16MiB) stream with known length', async function () {
        this.timeout(2000);
        const { server, port } = await server_1.makeServer();
        const chunkSize = 1024 * 1024;
        const chunks = 16;
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
        const eventual_response = __1.fetch(`http://localhost:${port}/sha256`, {
            method: 'POST',
            body: new __1.StreamBody(stream),
            headers: { 'content-length': '' + chunkSize * chunks },
        });
        await already_1.delay(1);
        const response = ensureStatusSuccess(await eventual_response);
        const data = await response.text();
        chai_1.expect(data).to.equal(referenceHash);
        await server.shutdown();
    });
    it('should be able to POST large (16MiB) stream with unknown length', async function () {
        this.timeout(2000);
        const { server, port } = await server_1.makeServer();
        const chunkSize = 1024 * 1024;
        const chunks = 16;
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
        const eventual_response = __1.fetch(`http://localhost:${port}/sha256`, {
            method: 'POST',
            body: new __1.StreamBody(stream),
        });
        await already_1.delay(1);
        const response = ensureStatusSuccess(await eventual_response);
        const data = await response.text();
        chai_1.expect(data).to.equal(referenceHash);
        await server.shutdown();
    });
    it('should be able to receive pushed request', async () => {
        const { server, port } = await server_1.makeServer();
        const onPushPromise = new Promise((resolve, reject) => {
            __1.onPush((origin, request, getResponse) => {
                getResponse().then(resolve, reject);
            });
        });
        const data = { foo: 'bar' };
        const response = ensureStatusSuccess(await __1.fetch(`http://localhost:${port}/push`, {
            method: 'POST',
            json: [
                {
                    data: JSON.stringify(data),
                    headers: { 'content-type': 'application/json' },
                }
            ],
        }));
        const responseText = await response.text();
        chai_1.expect(responseText).to.equal("push-route");
        const pushedResponse = await onPushPromise;
        const pushedData = await pushedResponse.json();
        chai_1.expect(pushedData).to.deep.equal(data);
        __1.onPush(null);
        await server.shutdown();
    });
    it('should convert \'host\' to \':authority\'', async () => {
        const { server, port } = await server_1.makeServer();
        const host = 'localhost';
        const response = ensureStatusSuccess(await __1.fetch(`http://localhost:${port}/headers`, {
            headers: { host }
        }));
        const responseData = await response.json();
        chai_1.expect(responseData[':authority']).to.equal(host);
        await server.shutdown();
    });
    it('should send accept-encoding', async () => {
        const { server, port } = await server_1.makeServer();
        const host = 'localhost';
        const response = ensureStatusSuccess(await __1.fetch(`http://localhost:${port}/headers`));
        const responseData = await response.json();
        chai_1.expect(responseData['accept-encoding']).to.contain("gzip");
        await server.shutdown();
    });
    it('should accept content-encoding (gzip)', async () => {
        const { server, port } = await server_1.makeServer();
        const host = 'localhost';
        const testData = { foo: "bar" };
        const response = ensureStatusSuccess(await __1.fetch(`http://localhost:${port}/compressed/gzip`, {
            method: 'POST',
            json: testData,
        }));
        const stream = await response.readable();
        const data = await get_stream_1.buffer(stream);
        chai_1.expect(JSON.parse(data.toString())).to.deep.equal(testData);
        await server.shutdown();
    });
    it('should accept content-encoding (deflate)', async () => {
        const { server, port } = await server_1.makeServer();
        const host = 'localhost';
        const testData = { foo: "bar" };
        const response = ensureStatusSuccess(await __1.fetch(`http://localhost:${port}/compressed/deflate`, {
            method: 'POST',
            json: testData,
        }));
        const stream = await response.readable();
        const data = await get_stream_1.buffer(stream);
        chai_1.expect(JSON.parse(data.toString())).to.deep.equal(testData);
        await server.shutdown();
    });
});
describe('response', () => {
    it('should have a proper url', async () => {
        const { server, port } = await server_1.makeServer();
        const url = `http://localhost:${port}/headers`;
        const response = ensureStatusSuccess(await __1.fetch(url));
        chai_1.expect(response.url).to.equal(url);
        await __1.disconnectAll();
        await server.shutdown();
    });
});
describe('goaway', () => {
    it('handle session failover (race conditioned)', async () => {
        const { server, port } = await server_1.makeServer();
        const url1 = `http://localhost:${port}/goaway`;
        const url2 = `http://localhost:${port}/headers`;
        const response1 = ensureStatusSuccess(await __1.fetch(url1));
        chai_1.expect(response1.url).to.equal(url1);
        const response2 = ensureStatusSuccess(await __1.fetch(url2));
        chai_1.expect(response2.url).to.equal(url2);
        await response1.text();
        await response2.text();
        await __1.disconnectAll();
        await server.shutdown();
    });
    it('handle session failover (calm)', async () => {
        const { server, port } = await server_1.makeServer();
        const url1 = `http://localhost:${port}/goaway`;
        const url2 = `http://localhost:${port}/headers`;
        const response1 = ensureStatusSuccess(await __1.fetch(url1));
        chai_1.expect(response1.url).to.equal(url1);
        await already_1.delay(20);
        const response2 = ensureStatusSuccess(await __1.fetch(url2));
        chai_1.expect(response2.url).to.equal(url2);
        await response1.text();
        await response2.text();
        await __1.disconnectAll();
        await server.shutdown();
    });
    it('user-disconnect closes all sessions', async () => {
        const { server, port } = await server_1.makeServer();
        const url1 = `http://localhost:${port}/goaway/50`;
        const url2 = `http://localhost:${port}/slow/50`;
        const response1 = ensureStatusSuccess(await __1.fetch(url1));
        chai_1.expect(response1.url).to.equal(url1);
        await already_1.delay(10);
        const response2 = ensureStatusSuccess(await __1.fetch(url2));
        chai_1.expect(response2.url).to.equal(url2);
        await already_1.delay(10);
        await __1.disconnectAll();
        const text1 = await response1.text(true);
        const text2 = await response2.text(true);
        chai_1.expect(text1).to.equal('abcde');
        chai_1.expect(text2).to.equal('abcde');
        await server.shutdown();
    });
});
describe('integrity', () => {
    it('handle and succeed on valid integrity', async () => {
        const { server, port } = await server_1.makeServer();
        const url = `http://localhost:${port}/slow/0`;
        const data = "abcdefghij";
        const integrity = utils_1.createIntegrity(data);
        const response = ensureStatusSuccess(await __1.fetch(url, { integrity }));
        chai_1.expect(response.url).to.equal(url);
        chai_1.expect(await response.text()).to.equal(data);
        await __1.disconnectAll();
        await server.shutdown();
    });
    it('handle and fail on invalid integrity', async () => {
        const { server, port } = await server_1.makeServer();
        const url = `http://localhost:${port}/slow/0`;
        const data = "abcdefghij-x";
        const integrity = utils_1.createIntegrity(data);
        const response = ensureStatusSuccess(await __1.fetch(url, { integrity }));
        chai_1.expect(response.url).to.equal(url);
        try {
            await response.text();
            chai_1.expect(false).to.equal(true);
        }
        catch (err) {
            chai_1.expect(err.message).to.contain("integrity");
        }
        await __1.disconnectAll();
        await server.shutdown();
    });
});
//# sourceMappingURL=index.js.map