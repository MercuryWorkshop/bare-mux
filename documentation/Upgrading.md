## Picking a transport

Some examples of transports are [EpoxyTransport](https://github.com/MercuryWorkshop/EpoxyTransport), [CurlTransport](https://github.com/MercuryWorkshop/CurlTransport), and [Bare-Client](https://github.com/MercuryWorkshop/Bare-as-module3).

### Hosting files
Your files should be statically available from your web server. For this example [EpoxyTransport](https://github.com/MercuryWorkshop/EpoxyTransport) will be hosted at `/epoxy/` and [bare-mux](https://github.com/MercuryWorkshop/bare-mux) will be hosted at `/baremux/`

When using express, all transports and bare-mux provide a path that can be imported into your backend that hosts the static files. An example is shown below.
```js
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

app.use("/epoxy/", express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));
```

### Starting a connection
The newest version of bare-mux uses [SharedWorkers](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker). To initialize bare-mux we have to start a connection. The connection takes the worker path in as a required argument that is needed to proceed with the connection. The 
```js
import { BareMuxConnection } from "@mercuryworkshop/bare-mux"
const connection = new BareMuxConnection("/baremux/worker.js")
```

Without using a bundler:
```js
const connection = new BareMux.BareMuxConnection("/baremux/worker.js")
```

### Setting the transport
After your connection is setup, you can call `connection.setTransport` to change your transport. The first argument is required and the path to the module version of your transport. For most of them it should be `/path/to/transport/index.mjs`, otherwise it should be checked. The second required path is an array that gets interpreted as arguments.
```js
await connection.setTransport("/epoxy/index.mjs", [{ wisp: "wss://wisp.mercurywork.shop/" }]);
await connection.setTransport("/baremod/index.mjs", ["https://tomp.app/"]);

```

Your transport should get set before the service worker is ready, otherwise this may cause a race condition and the transport may not be used for some requests.

If you are moving from bare-mux v1, you can remove your imports of the transports in the page and service worker as bare-mux v2 streamlines the experience to where imports are loaded inside of the SharedWorker. The only time where bare-mux needs to be imported now is when you are making the connection with `BareMuxConnection`.
