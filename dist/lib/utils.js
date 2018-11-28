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
function hasGotGoaway(session) {
    return !!session.__fetch_h2_goaway;
}
exports.hasGotGoaway = hasGotGoaway;
function setGotGoaway(session) {
    session.__fetch_h2_goaway = true;
}
exports.setGotGoaway = setGotGoaway;
//# sourceMappingURL=utils.js.map