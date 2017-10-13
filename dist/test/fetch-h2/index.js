'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const chai_1 = require("chai");
const _1 = require("../../");
afterEach(_1.disconnectAll);
const http2 = require("http2");
class Server {
    constructor() {
        this._server = http2.createServer();
        this._sessions = new Set();
        this._server.on('stream', (stream, headers) => {
            stream.respond({
                'content-type': 'text/plain',
                ':status': 200,
            });
            stream.end(JSON.stringify({ path: headers[':path'] }));
            this._sessions.add(stream.session);
            stream.session.once('close', () => this._sessions.delete(stream.session));
        });
    }
    listen(port) {
        return new Promise((resolve, reject) => {
            this._server.listen(port, '0.0.0.0', resolve);
        });
    }
    shutdown() {
        return new Promise((resolve, reject) => {
            for (let session of this._sessions) {
                session.destroy();
            }
            this._server.close(resolve);
        });
    }
}
describe('basic', () => {
    it('should be able to perform simple GET', async () => {
        const server = new Server();
        await server.listen(4711);
        const response = await _1.fetch('http://localhost:4711/');
        const res = await response.json();
        chai_1.expect(res.path).to.equal('/');
        await server.shutdown();
    });
    /*
        This can be enabled, and further tests written, when Node.js can do HTTPS
        requests...
    
        it( 'should ...', async ( ) =>
        {
            const response = await fetch( 'https://httpbin.org/ip' );
            const data = await response.json( );
        } );
    */
});
//# sourceMappingURL=index.js.map