import { BareTransport } from "./baretypes";
import { WorkerMessage } from "./connection"

let currentTransport: BareTransport | null = null;

function handleConnection(port: MessagePort) {
	port.onmessage = async (event: MessageEvent) => {
		const port = event.data.port;
		const message: WorkerMessage = event.data.message;
		if (message.type === "set") {
			const func = new Function(message.client);
			currentTransport = await func();
			console.log("set transport to ", currentTransport);
			port.postMessage({ type: "set" });
		} else if (message.type === "fetch") {
			try {
				if (!currentTransport) throw new Error("No BareTransport was set. Try creating a BareMuxConnection and calling set() on it.");
				if (!currentTransport.ready) await currentTransport.init();
				const resp = await currentTransport.request(
					new URL(message.fetch.remote),
					message.fetch.method,
					message.fetch.body,
					message.fetch.headers,
					null
				);

				if (resp.body instanceof ReadableStream || resp.body instanceof ArrayBuffer) {
					port.postMessage({ type: "fetch", fetch: resp }, [resp.body]);
				} else {
					port.postMessage({ type: "fetch", fetch: resp });
				}
			} catch (err) {
				port.postMessage({ type: "error", error: err });
			}
		}
	}
}

// @ts-expect-error
self.onconnect = (event: MessageEvent) => {
	handleConnection(event.ports[0])
}
