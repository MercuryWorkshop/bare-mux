# Bare-Mux

A system for managing http transports in a project such as [Ultraviolet](https://github.com/Titaniumnetwork-dev/Ultraviolet).

Written to make the job of creating new standards for transporting http data seamless.

Implements the [TompHTTP Bare](https://github.com/tomphttp/specifications/) client interface in a modular way.

Specifically, this is what allows proxies such as [Nebula](https://github.com/NebulaServices/Nebula) to switch HTTP transports seamlessly.

A transport is a module that implements the `BareTransport` interface.
```js
export interface BareTransport {
  init: () => Promise<void>;
  ready: boolean;
  connect: (
    url: URL,
    origin: string,
    protocols: string[],
    requestHeaders: BareHeaders,
    onopen: (protocol: string) => void,
    onmessage: (data: Blob | ArrayBuffer | string) => void,
    onclose: (code: number, reason: string) => void,
    onerror: (error: string) => void,
  ) => [( (data: Blob | ArrayBuffer | string) => void, (code: number, reason: string) => void )] => void;

  request: (
    remote: URL,
    method: string,
    body: BodyInit | null,
    headers: BareHeaders,
    signal: AbortSignal | undefined
  ) => Promise<TransferrableResponse>;

  meta: () => BareMeta
}
```
## Upgrading

A guide for updating from v1 to v2 can be found [here](https://github.com/MercuryWorkshop/bare-mux/blob/master/documentation/Upgrading.md).

## Older bare-mux versions

Starting from v2, bare-mux uses [SharedWorkers](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker) to provide stability and improve on resource usage.

If you operate using an older bare-mux, we encourage you to update.

If you're too lazy to do either of the above, you can install an outdated and unsupported version of bare-mux.

```sh
npm install @mercuryworkshop/bare-mux@1
```

Examples of transports include [EpoxyTransport](https://github.com/MercuryWorkshop/EpoxyTransport),  [CurlTransport](https://github.com/MercuryWorkshop/CurlTransport), and [Bare-Client](https://github.com/MercuryWorkshop/Bare-as-module3).

Here is an example of using bare-mux:
```js
/// As an end-user
import { BareMuxConnection } from "@mercuryworkshop/bare-mux";
const conn = new BareMuxConnection("/bare-mux/worker.js");

// Set Bare-Client transport
// If your transport is an ES module and exports the class as the default export
await conn.setTransport("/bare-mux/transport-module.js", ["arg1", "ws://localhost:4000"]);

/// As a proxy developer
import { BareClient } from "@mercuryworkshop/bare-mux";
const client = new BareClient();
// Fetch
const resp = await client.fetch("https://example.com");
// Create websocket
const ws = client.createWebSocket("wss://echo.websocket.events");
```

## WebWorker support
Due to limitations in browsers, there is no way for bare-mux to get a connection to the bare-mux SharedWorker while inside a WebWorker. Proxies that use bare-mux must manually pass in a MessagePort to the SharedWorker to be able to use BareClient in a WebWorker.
```js
const connection = new Ultraviolet.BareMuxConnection();
let port = connection.getInnerPort();
// this could be a promise, but right now it's only a promise when called inside a service worker
if (port instanceof Promise) port = await port;
// ... transfer it to worker ...
this.bareClient = new BareClient(port)
```
