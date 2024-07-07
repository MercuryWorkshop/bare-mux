import { BareTransport } from "./baretypes";
import { WorkerMessage, WorkerResponse } from "./connection"

let currentTransport: BareTransport | null = null;

function handleConnection(port: MessagePort) {
	port.onmessage = async (event: MessageEvent) => {
		const port = event.data.port;
		const message: WorkerMessage = event.data.message;

		if (message.type === "set") {
			try {
				const AsyncFunction = (async function () {}).constructor;

				// @ts-expect-error
				const func = new AsyncFunction(message.client);
				currentTransport = await func();
				console.log("set transport to ", currentTransport);

				port.postMessage(<WorkerResponse>{ type: "set" });
			} catch(err) {
				port.postMessage(<WorkerResponse>{ type: "error", error: err });
			}
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
					port.postMessage(<WorkerResponse>{ type: "fetch", fetch: resp }, [resp.body]);
				} else {
					port.postMessage(<WorkerResponse>{ type: "fetch", fetch: resp });
				}
			} catch (err) {
				port.postMessage(<WorkerResponse>{ type: "error", error: err });
			}
		} else if (message.type === "websocket") {
			try {
				if (!currentTransport) throw new Error("No BareTransport was set. Try creating a BareMuxConnection and calling set() on it.");
				if (!currentTransport.ready) await currentTransport.init();

				const onopen = (protocol: string) => {
					message.websocket.channel.postMessage({ type: "open", args: [protocol] });
				};
				const onclose = (code: number, reason: string) => {
					message.websocket.channel.postMessage({ type: "close", args: [code, reason] });
				};
				const onerror = (error: string) => {
					message.websocket.channel.postMessage({ type: "error", args: [error] });
				};
				const onmessage = (data: Blob | ArrayBuffer | string) => {
					if (data instanceof ArrayBuffer) {
						message.websocket.channel.postMessage({ type: "message", args: [data] }, [data]);
					} else {
						message.websocket.channel.postMessage({ type: "message", args: [data] });
					}
				}
				const [data, close] = currentTransport.connect(
					new URL(message.websocket.url),
					message.websocket.origin,
					message.websocket.protocols,
					message.websocket.requestHeaders,
					onopen,
					onmessage,
					onclose,
					onerror,
				);
				message.websocket.channel.onmessage = (event: MessageEvent) => {
					if (event.data.type === "data") {
						data(event.data.data);
					} else if (event.data.type === "close") {
						close(event.data.closeCode, event.data.closeReason);
					}
				}

				port.postMessage(<WorkerResponse>{ type: "websocket" });
			} catch (err) {
				port.postMessage(<WorkerResponse>{ type: "error", error: err });
			}
		}
	}
}

// @ts-expect-error
self.onconnect = (event: MessageEvent) => {
	handleConnection(event.ports[0])
}
