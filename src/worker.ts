import { BareTransport } from "./baretypes";
import { BroadcastMessage, WorkerMessage, WorkerRequest, WorkerResponse } from "./connection"
import { handleFetch, handleWebsocket, sendError } from "./workerHandlers";

let currentTransport: BareTransport | MessagePort | null = null;
let currentTransportName: string = "";

const channel = new BroadcastChannel("bare-mux");
channel.postMessage(<BroadcastMessage>{ type: "refreshPort" });

function noClients(): Error {
	// @ts-expect-error mdn error constructor: new Error(message, options)
	return new Error("there are no bare clients", {
		cause: "No BareTransport was set. Try creating a BareMuxConnection and calling setTransport() or setManualTransport() on it before using BareClient."
	});
}

function handleRemoteClient(message: WorkerMessage, port: MessagePort) {
	const remote = currentTransport as MessagePort;
	let transferables: Transferable[] = [port];
	if (message.fetch?.body) transferables.push(message.fetch.body);
	if (message.websocket?.channel) transferables.push(message.websocket.channel);
	remote.postMessage(<WorkerRequest>{ message, port }, transferables);
}

function handleConnection(port: MessagePort) {
	port.onmessage = async (event: MessageEvent) => {
		const port = event.data.port;
		const message: WorkerMessage = event.data.message;
		if (message.type === "ping") {
			port.postMessage(<WorkerResponse>{ type: "pong" });
		} else if (message.type === "set") {
			try {
				const AsyncFunction = (async function() { }).constructor;

				if (message.client.function === "bare-mux-remote") {
					currentTransport = message.client.args[0] as MessagePort;
					currentTransportName = `bare-mux-remote (${message.client.args[1]})`;
				} else {
					// @ts-expect-error
					const func = new AsyncFunction(message.client.function);
					const [newTransport, name] = await func();
					currentTransport = new newTransport(...message.client.args);
					currentTransportName = name;
				}
				console.log("set transport to ", currentTransport, currentTransportName);

				port.postMessage(<WorkerResponse>{ type: "set" });
			} catch (err) {
				sendError(port, err, 'set');
			}
		} else if (message.type === "get") {
			port.postMessage(<WorkerResponse>{ type: "get", name: currentTransportName });
		} else if (message.type === "fetch") {
			try {
				if (!currentTransport) throw noClients();
				if (currentTransport instanceof MessagePort) {
					handleRemoteClient(message, port);
					return;
				}
				if (!currentTransport.ready) await currentTransport.init();

				await handleFetch(message, port, currentTransport);
			} catch (err) {
				sendError(port, err, 'fetch');
			}
		} else if (message.type === "websocket") {
			try {
				if (!currentTransport) throw noClients();
				if (currentTransport instanceof MessagePort) {
					handleRemoteClient(message, port);
					return;
				}
				if (!currentTransport.ready) await currentTransport.init();

				await handleWebsocket(message, port, currentTransport);
			} catch (err) {
				sendError(port, err, 'websocket');
			}
		}
	}
}

// @ts-expect-error
self.onconnect = (event: MessageEvent) => {
	handleConnection(event.ports[0])
}
