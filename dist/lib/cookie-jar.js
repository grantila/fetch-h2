'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const tough_cookie_1 = require("tough-cookie");
class CookieJar {
    constructor() {
        this._jar = new tough_cookie_1.CookieJar();
    }
    setCookie(cookie, url) {
        return new Promise((resolve, reject) => {
            this._jar.setCookie(cookie, url, (err, cookie) => {
                if (err)
                    return reject(err);
                resolve(cookie);
            });
        });
    }
    async setCookies(cookies, url) {
        await Promise.all(cookies.map(cookie => this.setCookie(cookie, url)));
    }
    getCookies(url) {
        return new Promise((resolve, reject) => {
            this._jar.getCookies(url, (err, cookie) => {
                if (err)
                    return reject(err);
                resolve(cookie);
            });
        });
    }
}
exports.CookieJar = CookieJar;
//# sourceMappingURL=cookie-jar.js.map