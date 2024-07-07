import { BareHeaders, TransferrableResponse } from "./baretypes";

type SWClient = { postMessage: typeof MessagePort.prototype.postMessage };

function tryGetPort(client: SWClient): Promise<MessagePort> {
	let channel = new MessageChannel();
	return new Promise(resolve => {
		client.postMessage({ type: "getPort", port: channel.port2 }, [channel.port2]);
		channel.port1.onmessage = event => {
			resolve(event.data)
		}
	});
}

export type WorkerMessage = {
	type: "fetch" | "websocket" | "set",
	fetch?: {
		remote: string,
		method: string,
		headers: BareHeaders,
		body: ReadableStream | undefined,
	}
	websocket?: {
		url: string,
		origin: string,
		protocols: string[],
		requestHeaders: BareHeaders,
		channel: MessagePort,
	},
	client?: string,
};

export type WorkerRequest = {
	message: WorkerMessage,
	port: MessagePort,
}

export type WorkerResponse = {
	type: "fetch" | "websocket" | "set" | "error",
	fetch?: TransferrableResponse,
	error?: Error,
}

type BroadcastMessage = {
	type: "getPath" | "path",
	path?: string,
}

export class WorkerConnection {
	channel: BroadcastChannel;
	port: MessagePort | Promise<MessagePort>;

	constructor(workerPath?: string) {
		this.channel = new BroadcastChannel("bare-mux");
		// @ts-expect-error
		if (self.clients) {
			// running in a ServiceWorker
			// ask a window for the worker port
			// @ts-expect-error
			const clients: Promise<SWClient[]> = self.clients.matchAll({ type: "window", includeUncontrolled: true });
			this.port = clients.then(clients => Promise.any(clients.map((x: SWClient) => tryGetPort(x))));
		} else if (workerPath && SharedWorker) {
			// running in a window, was passed a workerPath
			// create the SharedWorker and help other bare-mux clients get the workerPath
			navigator.serviceWorker.addEventListener("message", event => {
				if (event.data.type === "getPort" && event.data.port) {
					const worker = new SharedWorker(workerPath, "bare-mux-worker");
					event.data.port.postMessage(worker.port, [worker.port]);
				}
			});

			this.channel.onmessage = (event: MessageEvent) => {
				if (event.data.type === "getPath") {
					this.channel.postMessage(<BroadcastMessage>{ type: "path", path: workerPath });
				}
			}

			const worker = new SharedWorker(workerPath, "bare-mux-worker");
			this.port = worker.port;
		} else if (SharedWorker) {
			// running in a window, was not passed a workerPath
			// ask other bare-mux clients for the workerPath
			this.port = new Promise(resolve => {
				this.channel.onmessage = (event: MessageEvent) => {
					if (event.data.type === "path") {
						const worker = new SharedWorker(event.data.path, "bare-mux-worker");
						this.channel.onmessage = (event: MessageEvent) => {
							if (event.data.type === "getPath") {
								this.channel.postMessage(<BroadcastMessage>{ type: "path", path: event.data.path });
							}
						}
						resolve(worker.port);
					}
				}
				this.channel.postMessage(<BroadcastMessage>{ type: "getPath" });
			});
		} else {
			// SharedWorker does not exist
			throw new Error("Unable to get a channel to the SharedWorker.");
		}
	}

	async sendMessage(message: WorkerMessage, transferable?: Transferable[]): Promise<WorkerResponse> {
		if (this.port instanceof Promise) this.port = await this.port;
		let channel = new MessageChannel();
		let toTransfer: Transferable[] = [channel.port2, ...(transferable || [])];

		this.port.postMessage(<WorkerRequest>{ message: message, port: channel.port2 }, toTransfer);

		return await new Promise((resolve, reject) => {
			channel.port1.onmessage = event => {
				const message = event.data;
				if (message.type === "error") {
					reject(message.error);
				} else {
					resolve(message);
				}
			}
		});
	}
}
