# bare-mux
<a href="https://www.npmjs.com/package/@mercuryworkshop/bare-mux"><img src="https://img.shields.io/npm/v/@mercuryworkshop/bare-mux.svg?maxAge=3600" alt="npm version" /></a>

A system for managing http transports in a project such as [Ultraviolet](https://github.com/Titaniumnetwork-dev/Ultraviolet) and [Scramjet](https://github.com/MercuryWorkshop/Scramjet).

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

A guide to making a transport can be found [here](./documentation/Transport.md).

## Upgrading

A guide for updating from v1 to v2 can be found [here](./documentation/Upgrading.md).

### Older bare-mux versions

Starting from v2, bare-mux uses [SharedWorkers](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker) to provide stability and improve on resource usage.

If you operate using an older bare-mux, we encourage you to update.

If you're too lazy to do either of the above, you can install an outdated and unsupported version of bare-mux.

```sh
npm install @mercuryworkshop/bare-mux@1
```

## Usage
Examples of transports include [EpoxyTransport](https://github.com/MercuryWorkshop/EpoxyTransport), [CurlTransport](https://github.com/MercuryWorkshop/CurlTransport), and [Bare-Client](https://github.com/MercuryWorkshop/Bare-as-module3).

Here is an example of using bare-mux:
```js
/// As an end-user
import { BareMuxConnection } from "@mercuryworkshop/bare-mux";
const conn = new BareMuxConnection("/bare-mux/worker.js");
// Set Bare-Client transport
await conn.setTransport("/path/to/transport/index.mjs", ["arg1", { wisp: "wss://wisp.mercurywork.shop" }, "arg3"]);
// Epoxy Client as an example
await conn.setTransport("/epoxy/index.mjs", [{ wisp: "wss://wisp.mercurywork.shop/" }]);
```

```js
/// As a proxy developer
import { BareClient } from "@mercuryworkshop/bare-mux";
const client = new BareClient();
// Fetch
const resp = await client.fetch("https://example.com");
// Create websocket
const ws = client.createWebSocket("wss://echo.websocket.events");
```
