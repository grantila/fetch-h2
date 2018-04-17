'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const url_1 = require("url");
function arrayify(value) {
    return Array.isArray(value) ? value : [value];
}
exports.arrayify = arrayify;
function parseLocation(location, origin) {
    if ('string' !== typeof location)
        return null;
    const url = new url_1.URL(location, origin);
    return url.href;
}
exports.parseLocation = parseLocation;
//# sourceMappingURL=utils.js.map