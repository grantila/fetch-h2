"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
function createIntegrity(data, hashType = 'sha256') {
    const hash = crypto_1.createHash(hashType);
    hash.update(data);
    return hashType + "-" + hash.digest("base64");
}
exports.createIntegrity = createIntegrity;
//# sourceMappingURL=utils.js.map