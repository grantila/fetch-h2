[![npm version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]

# fetch-h2

HTTP/2 [Fetch API](https://developer.mozilla.org/docs/Web/API/Fetch_API) implementation for Node.js (using Node.js' built-in `http2` module). This module is intended to be solely for HTTP/2, handling HTTP/2 sessions transparently. For an HTTP/1(.1)-only alternative, you can use [node-fetch](https://github.com/bitinn/node-fetch).

The module tries to adhere to the [Fetch API](https://developer.mozilla.org/docs/Web/API/Fetch_API) very closely, but extends it slightly to fit better into Node.js (e.g. using streams).

Regardless of whether you're actually interested in the Fetch API per se or not, as long as you want to handle HTTP/2 client requests in Node.js, this module is a lot easier and more natural to use than the native built-in [`http2`](https://nodejs.org/dist/latest-v8.x/docs/api/http2.html) module which is low-level in comparison.

`fetch-h2` supports cookies (per-context, see below), so when the server sends 'set-cookie' headers, they are saved and automatically re-sent, even after disconnect. They are however only persisted in-memory.

**NOTE;** HTTP/2 support was introduced in Node.js 8.4, and requires `node` to be started with a flag `--expose-http2`. This module won't work without it.

**DISCLAIMER: This is an early project, and the Node.js implementation is early too. Don't expect everything to "just work".**


## Imports

This README uses the ES6/TypeScript `import` syntax, mainly because `fetch-h2` is written in TypeScript (and also because ES6 modules will eventually arrive in Node.js). If you use pure JavaScript in Node.js today, you don't have *modules* support, just `require` instead, e.g:

```js
const { fetch } = require( 'fetch-h2' );
```

`fetch-h2` exports more than just `fetch()`, namely all necessary classes and functions for taking advantage of the Fetch API (and more).

```ts
import {
    context,
    fetch,
    disconnect,
    disconnectAll,
    Body,
    JsonBody,
    StreamBody,
    DataBody,
    Headers,
    Request,
    Response,
    AbortError,
    PushMessage,
} from 'fetch-h2'
```

Apart from the obvious `fetch`, the functions `context`, `disconnect` and `disconnectAll` are described below, and the classes [`Body`](https://developer.mozilla.org/docs/Web/API/Body), [`Headers`](https://developer.mozilla.org/docs/Web/API/Headers), [`Request`](https://developer.mozilla.org/docs/Web/API/Request) and [`Response`](https://developer.mozilla.org/docs/Web/API/Response) are part of the [Fetch API](https://developer.mozilla.org/docs/Web/API/Fetch_API). `JsonBody`, `StreamBody` and `DataBody` are extensions over `Body`, described below. `AbortError` is the error thrown in case of an [abort signal](https://developer.mozilla.org/docs/Web/API/AbortSignal) (this is also the error thrown in case of a *timeout*, which in `fetch-h2` is internally implemented as an abort signal). The `PushMessage` is an interface for `onPush` callbacks, mentioned below.


## Usage

Import `fetch` from `fetch-h2` and use it like you would use [`fetch`](https://developer.mozilla.org/docs/Web/API/WindowOrWorkerGlobalScope/fetch) in the browser.

```ts
import { fetch } from 'fetch-h2'

const response = await fetch( url );
const responseText = await response.text( );
```

With HTTP/2, all requests to the same *origin* (domain name and port) share a single session (socket). In browsers, it is eventually disconnected, maybe. It's up to the implementation to handle disconnections. In `fetch-h2`, you can disconnect it manually, which is great e.g. when using `fetch-h2` in unit tests.


### Disconnect

Disconnect the session for a certain url (the session for the *origin* will be disconnected) using `disconnect`, and disconnect **all** sessions with `disconnectAll`. Read more on *contexts* below to understand what "all" really means...

```ts
import { disconnect, disconnectAll } from 'fetch-h2'

await disconnect( "http://mysite.com/foo" ); // "/foo" is ignored, but allowed
// or
await disconnectAll( );
```


## Limitations

`fetch-h2` has a few limitations, some purely technical, some more fundamental or perhaps philosophical, which you will find in the Fetch API but missing here.

 * There is no automatic CORS handling, since you don't have the concept of web pages with *cross-origin resource **sharing***. You have full control over your code, at least that's what `fetch-h2` believes.
 * The `Body` class/mixin doesn't support the `formData()` function. This can be added if someone really wants it - PR's are welcome.
 * The `Body` class/mixin doesn't support the `blob()` function. This type of buffer doesn't exist in Node.js, use `arrayBuffer()` instead.
 * Automatic redirection (3xx codes) are only supported for `HEAD` and `GET` requests. If e.g. a `POST` request gets a 3xx-code response and `redirect` is set to `follow`, the result is an error. Redirections for non-idempotent requests are only allowed if `redirect` is `error` or `manual` (which is the default). Note that the default for `redirect` is different among browsers (and even versions of them). The specs are non-obvious but seems to suggest `manual` initially, followed by `redirect`. It's a good idea to explicitly set `mode` and not depend on any default.
 * The `credentials` option is currently not implemented since `fetch-h2` has no cookie jar ('yet').
 * The `cache` option is unused, as `fetch-h2` has no built-in cache.
 * The `referrer` and `referrerPolicy` are unused, as `fetch-h2` operates outside the concept of "web pages".
 * The `integrity` option **is actually implemented** but no validation is performed if the result body is read through the Node.js `ReadableStream` (using `response.readable( )`). The body **is** validated if `arrayBuffer( )`, `blob( )`, `json( )` or `text( )` is used to read the body, in which case these functions will return a rejected promise.


## Extensions

These are features in `fetch-h2`, that don't exist in the Fetch API. Some things are just very useful in a Node.js environment (like streams), some are due to the lack of a browser with all its responsibilities.

 * When `redirect` is set to `manual`, the response is supposed to be empty and useless, with no status code or anything (according to spec). In `fetch-h2`, it's a normal *useful* `Response` object.
 * The `body` that can be sent in a Request, and that is available on the Response, can be a Node.js `ReadableStream`. You can thereby stream data with a request, and stream the response body.
 * The `body` that can be sent in a Request can be a [`Body`](https://developer.mozilla.org/docs/Web/API/Body) object. There's an extended `JsonBody` class (extending `Body`) which represents an object (that will be JSON stringified). This is useful to e.g. `POST` an object. The `fetch` implementation will detect this `JsonBody` and apply the right `content-type` if it isn't already set.
 * `fetch()` has an extra option, `timeout` which can be used (although not together with `signal`), which is a timeout in milliseconds before the request should be aborted and the returned promise thereby *rejected* (with an `AbortError`).
 + `fetch()` has an extra option, `onPush` which is an optional callback that will be called when pushes are performed for a certain fetch operation. This callback should take a `PushMessage` argument, which will contain `{url, method, statusCode, headers}`. `fetch-h2` performs absolutely no push magic.
 * The `Request.clone()` member function has an optional `url` argument.


## Contexts

HTTP/2 expects a client implementation to not create new sockets (sessions) for every request, but instead re-use them - create new requests in the same session. This is also totally transparent in the Fetch API. It might be useful to control this, and create new "browser contexts", each with their own set of HTTP/2-sessions-per-origin. This is done through the `context` function.

This function returns an object which looks like the global `fetch-h2` API, i.e. it will have the functions `fetch`, `disconnect` and `disconnectAll`.

```ts
import { context } from 'fetch-h2'

const ctx = context( /* options */ );

ctx.fetch( url | Request, init?: InitOpts );
ctx.disconnect( url );
ctx.disconnectAll( );
```

The global `fetch`, `disconnect` and `disconnectAll` functions are default-created from a context internally. They will therefore not interfere, and `disconnect`/`disconnectAll` only applies to its own context, be it a context created by you, or the default one from `fetch-h2`.

If you want one specific context in a file, why not destructure the return in one go?

```ts
import { context } from 'fetch-h2'
const { fetch, disconnect, disconnectAll } = context( );
```


## Errors

When an error is thrown (or a promise is rejected), `fetch-h2` will always provide *proper error objects*, i.e. instances of `Error`.


### Circular redirection

If servers are redirecting a fetch operation in a way that causes a circular redirection, e.g. servers redirect `A -> B -> C -> D -> B`, `fetch-h2` will detect this and fail the operation with an error. The error object will have a property `urls` which is an array of the urls that caused the loop (in this example it would be `[ B, C, D ]`, as `D` would redirect to the head of this list again).


## More examples


### Fetch JSON

Using `await` and the [`Body.json()`](https://developer.mozilla.org/docs/Web/API/Body/json) function we can easily get a JSON object from a response.

```ts
import { fetch } from 'fetch-h2'

const jsonData = await ( await fetch( url ) ).json( );
```


### Post JSON

Use the `JsonBody` subclass of `Body` to simplify the creation of an `application/json` body. This is an extension in `fetch-h2`, not existing in the Fetch API.

```ts
import { fetch, JsonBody } from 'fetch-h2'

const myData = { foo: 'bar' };
const body = new JsonBody( myData );
const method = 'POST';
const response = await fetch( url, { method, body } );
```


### Post anything

Similarly to posting JSON, posting a buffer or string can be done through `DataBody` and a readable stream through `StreamBody`.

```ts
import { fetch, DataBody, StreamBody } from 'fetch-h2'

const body = new DataBody( "any data" );
// or:
// const body = new StreamBody( anyReadableStream );

const method = 'POST';
const response = await fetch( url, { method, body } );
```

[npm-image]: https://img.shields.io/npm/v/fetch-h2.svg
[npm-url]: https://npmjs.org/package/fetch-h2
[travis-image]: https://img.shields.io/travis/grantila/fetch-h2.svg
[travis-url]: https://travis-ci.org/grantila/fetch-h2
