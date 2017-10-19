'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const get_stream_1 = require("get-stream");
const through2 = require("through2");
const isBuffer = require("is-buffer");
const toArrayBuffer = require("to-arraybuffer");
function throwUnknownData() {
    throw new Error("Unknown body data");
}
function throwIntegrityMismatch() {
    throw new Error("Resource integrity mismatch");
}
function parseIntegrity(integrity) {
    const [algorithm, ...expectedHash] = integrity.split('-');
    return { algorithm, hash: expectedHash.join('-') };
}
function validateIntegrity(data, integrity) {
    if (!integrity)
        // This is valid
        return;
    const { algorithm, hash: expectedHash } = parseIntegrity(integrity);
    const hash = crypto_1.createHash(algorithm)
        .update(data instanceof ArrayBuffer
        ? new DataView(data)
        : data)
        .digest('base64');
    if (expectedHash.toLowerCase() !== hash.toLowerCase())
        throwIntegrityMismatch();
    return data;
}
class Body {
    constructor() {
        this._length = null;
        this._used = false;
        Object.defineProperties(this, {
            bodyUsed: {
                enumerable: true,
                get: () => this._used
            }
        });
    }
    hasBody() {
        return '_body' in this;
    }
    setBody(body, mime, integrity) {
        this._ensureUnused();
        this._length = null;
        this._used = false;
        if (body instanceof Body) {
            body._ensureUnused();
            this._body = body._body;
            this._mime = body._mime;
        }
        else if (typeof body === 'string')
            this._body = Buffer.from(body);
        else
            this._body = body;
        if (isBuffer(this._body))
            this._length = this._body.length;
        if (mime)
            this._mime = mime;
        if (integrity)
            this._integrity = integrity;
    }
    _ensureUnused() {
        if (this._used)
            throw new ReferenceError("Body already used");
        this._used = true;
    }
    async arrayBuffer() {
        this._ensureUnused();
        if (this._body == null)
            return validateIntegrity(new ArrayBuffer(0), this._integrity);
        else if (typeof this._body === 'string')
            return validateIntegrity(toArrayBuffer(Buffer.from(this._body)), this._integrity);
        else if ('readable' in this._body)
            return get_stream_1.buffer(this._body)
                .then(buffer => validateIntegrity(buffer, this._integrity))
                .then(buffer => toArrayBuffer(buffer));
        else if (isBuffer(this._body))
            return validateIntegrity(toArrayBuffer(this._body), this._integrity);
        else
            throwUnknownData();
    }
    async blob() {
        throw new Error("Body.blob() is not implemented (makes no sense in Node.js), " +
            "use another getter.");
    }
    async formData() {
        throw new Error("Body.formData() is not yet implemented");
    }
    async json() {
        this._ensureUnused();
        if (this._body == null)
            return Promise.resolve(this._body);
        else if (typeof this._body === 'string')
            return Promise.resolve(this._body).then(JSON.parse);
        else if ('readable' in this._body)
            return get_stream_1.buffer(this._body)
                .then(buffer => JSON.parse(buffer.toString()));
        else if (isBuffer(this._body))
            return Promise.resolve(this._body.toString())
                .then(JSON.parse);
        else
            throwUnknownData();
    }
    async text() {
        this._ensureUnused();
        if (this._body == null)
            return Promise.resolve(null);
        else if (typeof this._body === 'string')
            return Promise.resolve(this._body);
        else if ('readable' in this._body)
            return get_stream_1.buffer(this._body)
                .then(buffer => buffer.toString());
        else if (isBuffer(this._body))
            return Promise.resolve(this._body.toString());
        else
            throwUnknownData();
    }
    async readable() {
        this._ensureUnused();
        const stream = through2();
        if (this._body == null) {
            stream.end();
            return Promise.resolve(stream);
        }
        else if ('readable' in Object(this._body))
            return Promise.resolve(this._body);
        else if (isBuffer(this._body) || typeof this._body === 'string')
            return Promise.resolve()
                .then(() => {
                stream.write(this._body);
                stream.end();
                return stream;
            });
        else
            throwUnknownData();
    }
}
exports.Body = Body;
class JsonBody extends Body {
    constructor(obj) {
        super();
        const body = Buffer.from(JSON.stringify(obj));
        this.setBody(body, 'application/json');
    }
}
exports.JsonBody = JsonBody;
class StreamBody extends Body {
    constructor(readable) {
        super();
        this.setBody(readable);
    }
}
exports.StreamBody = StreamBody;
class DataBody extends Body {
    constructor(data) {
        super();
        this.setBody(data);
    }
}
exports.DataBody = DataBody;
class BodyInspector extends Body {
    constructor(body) {
        super();
        this._ref = body;
    }
    _getMime() {
        return this._mime;
    }
    _getLength() {
        return this._length;
    }
    get mime() {
        return this._getMime.call(this._ref);
    }
    get length() {
        return this._getLength.call(this._ref);
    }
}
exports.BodyInspector = BodyInspector;
//# sourceMappingURL=body.js.map