'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const get_stream_1 = require("get-stream");
const through2 = require("through2");
const isBuffer = require("is-buffer");
const toArrayBuffer = require("to-arraybuffer");
const already_1 = require("already");
function throwUnknownData() {
    throw new Error("Unknown body data");
}
function throwIntegrityMismatch() {
    throw new Error("Resource integrity mismatch");
}
function throwLengthMismatch() {
    throw new RangeError("Resource length mismatch (possibly incomplete body)");
}
function parseIntegrity(integrity) {
    const [algorithm, ...expectedHash] = integrity.split('-');
    return { algorithm, hash: expectedHash.join('-') };
}
function isStream(body) {
    return body &&
        ('readable' in Object(body));
}
const emptyBuffer = new ArrayBuffer(0);
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
    validateIntegrity(data, allowIncomplete) {
        if (!allowIncomplete &&
            this._length != null &&
            data.byteLength != this._length)
            throwLengthMismatch();
        if (!this._integrity)
            // This is valid
            return data;
        const { algorithm, hash: expectedHash } = parseIntegrity(this._integrity);
        const hash = crypto_1.createHash(algorithm)
            .update(data instanceof ArrayBuffer
            ? new DataView(data)
            : data)
            .digest('base64');
        if (expectedHash.toLowerCase() !== hash.toLowerCase())
            throwIntegrityMismatch();
        return data;
    }
    hasBody() {
        return '_body' in this;
    }
    setBody(body, mime, integrity, length = null) {
        this._ensureUnused();
        this._length = length;
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
    async arrayBuffer(allowIncomplete = false) {
        this._ensureUnused();
        if (this._body == null)
            return this.validateIntegrity(emptyBuffer, allowIncomplete);
        else if (isStream(this._body))
            return get_stream_1.buffer(this._body)
                .then(buffer => this.validateIntegrity(buffer, allowIncomplete))
                .then(buffer => toArrayBuffer(buffer));
        else if (isBuffer(this._body))
            return this.validateIntegrity(toArrayBuffer(this._body), allowIncomplete);
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
            return Promise.resolve(this.validateIntegrity(emptyBuffer, false))
                .then(() => this._body);
        else if (isStream(this._body))
            return get_stream_1.buffer(this._body)
                .then(already_1.tap(buffer => this.validateIntegrity(buffer, false)))
                .then(buffer => JSON.parse(buffer.toString()));
        else if (isBuffer(this._body))
            return Promise.resolve(this._body)
                .then(already_1.tap(buffer => this.validateIntegrity(buffer, false)))
                .then(buffer => JSON.parse(buffer.toString()));
        else
            throwUnknownData();
    }
    async text(allowIncomplete = false) {
        this._ensureUnused();
        if (this._body == null)
            return Promise.resolve(this.validateIntegrity(emptyBuffer, allowIncomplete))
                .then(() => this._body);
        else if (isStream(this._body))
            return get_stream_1.buffer(this._body)
                .then(already_1.tap(buffer => this.validateIntegrity(buffer, allowIncomplete)))
                .then(buffer => buffer.toString());
        else if (isBuffer(this._body))
            return Promise.resolve(this._body)
                .then(already_1.tap(buffer => this.validateIntegrity(buffer, allowIncomplete)))
                .then(buffer => buffer.toString());
        else
            return throwUnknownData();
    }
    async readable() {
        this._ensureUnused();
        if (this._body == null) {
            const stream = through2();
            stream.end();
            return Promise.resolve(stream);
        }
        else if (isStream(this._body))
            return Promise.resolve(this._body);
        else if (isBuffer(this._body))
            return Promise.resolve(through2())
                .then(stream => {
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