'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const chai_1 = require("chai");
//import { buffer as getStreamAsBuffer } from 'get-stream';
//import * as through2 from 'through2';
//import { createHash } from 'crypto';
const server_1 = require("../lib/server");
const _1 = require("../../");
afterEach(_1.disconnectAll);
function ensureStatusSuccess(response) {
    if (response.status < 200 || response.status >= 300)
        throw new Error("Status not 2xx");
    return response;
}
describe('context', () => {
    describe('options', () => {
        it('should be able to overwrite default user agent', async () => {
            const { server, port } = await server_1.makeServer();
            const { disconnectAll, fetch } = _1.context({
                userAgent: 'foobar',
                overwriteUserAgent: true,
            });
            const response = ensureStatusSuccess(await fetch(`http://localhost:${port}/headers`));
            const res = await response.json();
            chai_1.expect(res['user-agent']).to.equal('foobar');
            disconnectAll();
            await server.shutdown();
        });
        it('should be able to set (combined) user agent', async () => {
            const { server, port } = await server_1.makeServer();
            const { disconnectAll, fetch } = _1.context({
                userAgent: 'foobar'
            });
            const response = ensureStatusSuccess(await fetch(`http://localhost:${port}/headers`));
            const res = await response.json();
            chai_1.expect(res['user-agent']).to.contain('foobar');
            chai_1.expect(res['user-agent']).to.contain('fetch-h2');
            disconnectAll();
            await server.shutdown();
        });
        it('should be able to set default accept header', async () => {
            const { server, port } = await server_1.makeServer();
            const accept = 'application/foobar, text/*;0.9';
            const { disconnectAll, fetch } = _1.context({ accept });
            const response = ensureStatusSuccess(await fetch(`http://localhost:${port}/headers`));
            const res = await response.json();
            chai_1.expect(res['accept']).to.equal(accept);
            disconnectAll();
            await server.shutdown();
        });
    });
});
//# sourceMappingURL=context.js.map