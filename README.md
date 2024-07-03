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

Examples of transports include [EpoxyTransport](https://github.com/MercuryWorkshop/EpoxyTransport),  [CurlTransport](https://github.com/MercuryWorkshop/CurlTransport), and [Bare-Client](https://github.com/MercuryWorkshop/Bare-as-module3).

To switch between transports, use the `SetTransport` function.
```js
import { SetTransport } from '@mercuryworkshop/bare-mux';

SetTransport("EpxMod.EpoxyClient", { wisp: "wss://wisp.mercurywork.shop" });
SetTransport("BareMod.BareClient", "https://some-bare-server.com");
```

If not using a bundler, extract the npm package in releases, and include the `bare.cjs` file and call `BareMux.SetTransport`.
