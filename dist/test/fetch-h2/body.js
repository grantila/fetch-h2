'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const chai_1 = require("chai");
const get_stream_1 = require("get-stream");
const through2 = require("through2");
const crypto_1 = require("crypto");
const utils_1 = require("../lib/utils");
const __1 = require("../../");
async function makeSync(fn) {
    try {
        const val = await fn();
        return () => val;
    }
    catch (err) {
        return () => { throw err; };
    }
}
function setHash(body, data, hashType = 'sha256') {
    body._integrity = utils_1.createIntegrity(data, hashType);
}
class IntegrityBody extends __1.Body {
    constructor(data, hashData, integrityHashType = 'sha256') {
        super();
        const hash = crypto_1.createHash('sha256');
        hash.update(hashData);
        const v = integrityHashType + "-" + hash.digest("base64");
        this.setBody(data, null, v);
    }
}
describe('body', () => {
    describe('multiple reads', () => {
        it('throw on multiple reads', async () => {
            const body = new __1.DataBody("foo");
            chai_1.expect(body.bodyUsed).to.be.false;
            chai_1.expect(await body.text()).to.equal("foo");
            chai_1.expect(body.bodyUsed).to.be.true;
            chai_1.expect(await makeSync(() => body.text()))
                .to.throw(ReferenceError);
        });
    });
    describe('unimplemented', () => {
        it('throw on unimplemented blob()', async () => {
            const body = new __1.DataBody("foo");
            chai_1.expect(await makeSync(() => body.blob()))
                .to.throw();
        });
        it('throw on unimplemented formData()', async () => {
            const body = new __1.DataBody("foo");
            chai_1.expect(await makeSync(() => body.formData())).to.throw();
        });
    });
    describe('invalid data', () => {
        it('handle invalid body type when reading as arrayBuffer', async () => {
            const body = new __1.DataBody(1);
            chai_1.expect(await makeSync(() => body.arrayBuffer()))
                .to.throw("Unknown body data");
        });
        it('handle invalid body type when reading as json', async () => {
            const body = new __1.DataBody(1);
            chai_1.expect(await makeSync(() => body.json()))
                .to.throw("Unknown body data");
        });
        it('handle invalid body type when reading as text', async () => {
            const body = new __1.DataBody(1);
            chai_1.expect(await makeSync(() => body.text()))
                .to.throw("Unknown body data");
        });
        it('handle invalid body type when reading as readable', async () => {
            const body = new __1.DataBody(1);
            chai_1.expect(await makeSync(() => body.readable()))
                .to.throw("Unknown body data");
        });
    });
    describe('arrayBuffer', () => {
        describe('without validation', () => {
            it('handle null', async () => {
                const body = new __1.DataBody(null);
                const data = Buffer.from(await body.arrayBuffer());
                chai_1.expect(data.toString()).to.equal("");
            });
            it('handle string', async () => {
                const body = new __1.DataBody('foo');
                const data = Buffer.from(await body.arrayBuffer());
                chai_1.expect(data.toString()).to.deep.equal("foo");
            });
            it('handle buffer', async () => {
                const body = new __1.DataBody(Buffer.from("foo"));
                const data = Buffer.from(await body.arrayBuffer());
                chai_1.expect(data.toString()).to.deep.equal("foo");
            });
            it('handle JsonBody', async () => {
                const body = new __1.JsonBody({ foo: "bar" });
                const data = Buffer.from(await body.arrayBuffer());
                chai_1.expect(data.toString()).to.deep.equal('{"foo":"bar"}');
            });
            it('handle stream', async () => {
                const stream = through2();
                stream.end("foo");
                const body = new __1.StreamBody(stream);
                const data = Buffer.from(await body.arrayBuffer());
                chai_1.expect(data.toString()).to.deep.equal("foo");
            });
        });
        describe('matching validation', () => {
            it('handle null', async () => {
                const body = new IntegrityBody(null, "");
                const data = Buffer.from(await body.arrayBuffer());
                chai_1.expect(data.toString()).to.equal("");
            });
            it('handle string', async () => {
                const testData = "foo";
                const body = new IntegrityBody(testData, testData);
                const data = Buffer.from(await body.arrayBuffer());
                chai_1.expect(data.toString()).to.deep.equal(testData);
            });
            it('handle buffer', async () => {
                const testData = "foo";
                const body = new IntegrityBody(Buffer.from(testData), testData);
                const data = Buffer.from(await body.arrayBuffer());
                chai_1.expect(data.toString()).to.deep.equal(testData);
            });
            it('handle stream', async () => {
                const testData = "foo";
                const stream = through2();
                stream.end(testData);
                const body = new IntegrityBody(stream, testData);
                const data = Buffer.from(await body.arrayBuffer());
                chai_1.expect(data.toString()).to.deep.equal(testData);
            });
        });
        describe('mismatching validation', () => {
            it('handle invalid hash type', async () => {
                const body = new IntegrityBody(null, "", "acme-hash");
                chai_1.expect(await makeSync(() => body.arrayBuffer()))
                    .to.throw("not supported");
            });
            it('handle null', async () => {
                const body = new IntegrityBody(null, "" + "x");
                chai_1.expect(await makeSync(() => body.arrayBuffer()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle string', async () => {
                const testData = "foo";
                const body = new IntegrityBody(testData, testData + "x");
                chai_1.expect(await makeSync(() => body.arrayBuffer()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle buffer', async () => {
                const testData = "foo";
                const body = new IntegrityBody(Buffer.from(testData), testData + "x");
                chai_1.expect(await makeSync(() => body.arrayBuffer()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle stream', async () => {
                const testData = "foo";
                const stream = through2();
                stream.end(testData);
                const body = new IntegrityBody(stream, testData + "x");
                chai_1.expect(await makeSync(() => body.arrayBuffer()))
                    .to.throw("Resource integrity mismatch");
            });
        });
    });
    describe('json', () => {
        describe('without validation', () => {
            it('handle null', async () => {
                const body = new __1.DataBody(null);
                chai_1.expect(await body.json()).to.be.null;
            });
            it('handle invalid string', async () => {
                const body = new __1.DataBody("invalid json");
                chai_1.expect(await makeSync(() => body.json())).to.throw();
            });
            it('handle valid string', async () => {
                const body = new __1.DataBody('{"foo":"bar"}');
                chai_1.expect(await body.json()).to.deep.equal({ foo: 'bar' });
            });
            it('handle invalid buffer', async () => {
                const body = new __1.DataBody(Buffer.from("invalid json"));
                chai_1.expect(await makeSync(() => body.json())).to.throw();
            });
            it('handle valid buffer', async () => {
                const body = new __1.DataBody(Buffer.from('{"foo":"bar"}'));
                chai_1.expect(await body.json()).to.deep.equal({ foo: 'bar' });
            });
            it('handle valid JsonBody', async () => {
                const body = new __1.JsonBody({ foo: "bar" });
                chai_1.expect(await body.json()).to.deep.equal({ foo: 'bar' });
            });
            it('handle invalid stream', async () => {
                const stream = through2();
                stream.end("invalid json");
                const body = new __1.StreamBody(stream);
                chai_1.expect(await makeSync(() => body.json())).to.throw();
            });
            it('handle valid stream', async () => {
                const stream = through2();
                stream.end('{"foo":"bar"}');
                const body = new __1.StreamBody(stream);
                chai_1.expect(await body.json()).to.deep.equal({ foo: 'bar' });
            });
        });
        describe('matching validation', () => {
            it('handle null', async () => {
                const body = new __1.DataBody(null);
                setHash(body, '');
                chai_1.expect(await body.json()).to.be.null;
            });
            it('handle string', async () => {
                const testData = '{"foo":"bar"}';
                const body = new __1.DataBody(testData);
                setHash(body, testData);
                chai_1.expect(await body.json()).to.deep.equal({ foo: 'bar' });
            });
            it('handle buffer', async () => {
                const testData = '{"foo":"bar"}';
                const body = new __1.DataBody(Buffer.from(testData));
                setHash(body, testData);
                chai_1.expect(await body.json()).to.deep.equal({ foo: 'bar' });
            });
            it('handle JsonBody', async () => {
                const body = new __1.JsonBody({ foo: "bar" });
                setHash(body, '{"foo":"bar"}');
                chai_1.expect(await body.json()).to.deep.equal({ foo: 'bar' });
            });
            it('handle stream', async () => {
                const testData = '{"foo":"bar"}';
                const stream = through2();
                stream.end(testData);
                const body = new __1.StreamBody(stream);
                setHash(body, testData);
                chai_1.expect(await body.json()).to.deep.equal({ foo: 'bar' });
            });
        });
        describe('mismatching validation', () => {
            it('handle null', async () => {
                const body = new __1.DataBody(null);
                setHash(body, '' + "x");
                chai_1.expect(await makeSync(() => body.json()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle string', async () => {
                const testData = '{"foo":"bar"}';
                const body = new __1.DataBody(testData);
                setHash(body, testData + "x");
                chai_1.expect(await makeSync(() => body.json()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle buffer', async () => {
                const testData = '{"foo":"bar"}';
                const body = new __1.DataBody(Buffer.from(testData));
                setHash(body, testData + "x");
                chai_1.expect(await makeSync(() => body.json()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle JsonBody', async () => {
                const body = new __1.JsonBody({ foo: "bar" });
                setHash(body, '{"foo":"bar"}' + "x");
                chai_1.expect(await makeSync(() => body.json()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle stream', async () => {
                const testData = '{"foo":"bar"}';
                const stream = through2();
                stream.end(testData);
                const body = new __1.StreamBody(stream);
                setHash(body, testData + "x");
                chai_1.expect(await makeSync(() => body.json()))
                    .to.throw("Resource integrity mismatch");
            });
        });
    });
    describe('text', () => {
        describe('without validation', () => {
            it('handle null', async () => {
                const body = new __1.DataBody(null);
                chai_1.expect(await body.text()).to.be.null;
            });
            it('handle string', async () => {
                const body = new __1.DataBody("foo");
                chai_1.expect(await body.text()).to.equal("foo");
            });
            it('handle buffer', async () => {
                const body = new __1.DataBody(Buffer.from("foo"));
                chai_1.expect(await body.text()).to.equal("foo");
            });
            it('handle stream', async () => {
                const stream = through2();
                stream.end("foo");
                const body = new __1.StreamBody(stream);
                chai_1.expect(await body.text()).to.equal("foo");
            });
        });
        describe('matching validation', () => {
            it('handle null', async () => {
                const body = new __1.DataBody(null);
                setHash(body, "");
                chai_1.expect(await body.text()).to.be.null;
            });
            it('handle string', async () => {
                const testData = "foo";
                const body = new __1.DataBody(testData);
                setHash(body, testData);
                chai_1.expect(await body.text()).to.equal(testData);
            });
            it('handle buffer', async () => {
                const testData = "foo";
                const body = new __1.DataBody(Buffer.from(testData));
                setHash(body, testData);
                chai_1.expect(await body.text()).to.equal(testData);
            });
            it('handle stream', async () => {
                const testData = "foo";
                const stream = through2();
                stream.end(testData);
                const body = new __1.StreamBody(stream);
                setHash(body, testData);
                chai_1.expect(await body.text()).to.equal(testData);
            });
        });
        describe('mismatching validation', () => {
            it('handle null', async () => {
                const body = new __1.DataBody(null);
                setHash(body, "" + "x");
                chai_1.expect(await makeSync(() => body.text()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle string', async () => {
                const testData = "foo";
                const body = new __1.DataBody(testData);
                setHash(body, testData + "x");
                chai_1.expect(await makeSync(() => body.text()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle buffer', async () => {
                const testData = "foo";
                const body = new __1.DataBody(Buffer.from(testData));
                setHash(body, testData + "x");
                chai_1.expect(await makeSync(() => body.text()))
                    .to.throw("Resource integrity mismatch");
            });
            it('handle stream', async () => {
                const testData = "foo";
                const stream = through2();
                stream.end(testData);
                const body = new __1.StreamBody(stream);
                setHash(body, testData + "x");
                chai_1.expect(await makeSync(() => body.text()))
                    .to.throw("Resource integrity mismatch");
            });
        });
    });
    describe('readable', () => {
        it('handle null', async () => {
            const body = new __1.DataBody(null);
            const data = await get_stream_1.buffer(await body.readable());
            chai_1.expect(data.toString()).to.equal("");
        });
        it('handle string', async () => {
            const body = new __1.DataBody("foo");
            const data = await get_stream_1.buffer(await body.readable());
            chai_1.expect(data.toString()).to.equal("foo");
        });
        it('handle buffer', async () => {
            const body = new __1.DataBody(Buffer.from("foo"));
            const data = await get_stream_1.buffer(await body.readable());
            chai_1.expect(data.toString()).to.equal("foo");
        });
        it('handle stream', async () => {
            const stream = through2();
            stream.end("foo");
            const body = new __1.StreamBody(stream);
            const data = await get_stream_1.buffer(await body.readable());
            chai_1.expect(data.toString()).to.equal("foo");
        });
    });
});
//# sourceMappingURL=body.js.map