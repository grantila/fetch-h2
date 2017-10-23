'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const already_1 = require("already");
function arrayify(value) {
    return Array.isArray(value) ? value : [value];
}
exports.arrayify = arrayify;
function makeGuard(rejector) {
    return function (fn) {
        return function (...args) {
            already_1.Try(() => fn(...args))
                .catch(err => rejector(err));
        };
    };
}
exports.makeGuard = makeGuard;
//# sourceMappingURL=utils.js.map