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
	type: "fetch" | "set",
	fetch?: {
		remote: string,
		method: string,
		body: ReadableStream | null,
		headers: BareHeaders,
	},
	client?: string,
};

export type WorkerRequest = {
	message: WorkerMessage,
	port: MessagePort,
}

export type WorkerResponse = {
	type: "fetch" | "set" | "error",
	fetch?: TransferrableResponse,
	error?: Error,
}

export class WorkerConnection {
	port: MessagePort | Promise<MessagePort>;

	constructor(workerPath?: string) {
		// @ts-expect-error
		if (self.clients) {
			// @ts-expect-error
			const clients: Promise<SWClient[]> = self.clients.matchAll({ type: "window", includeUncontrolled: true });
			this.port = clients.then(clients => Promise.any(clients.map((x: SWClient) => tryGetPort(x))));
		} else if (workerPath && SharedWorker) {
			navigator.serviceWorker.addEventListener("message", event => {
				if (event.data.type === "getPort" && event.data.port) {
					const worker = new SharedWorker(workerPath);
					event.data.port.postMessage(worker.port, [worker.port]);
				}
			});

			const worker = new SharedWorker(workerPath, "bare-mux-worker");
			this.port = worker.port;
		} else {
			throw new Error("workerPath was not passed or SharedWorker does not exist and am not running in a Service Worker.");
		}
	}

	async sendMessage(message: WorkerMessage): Promise<WorkerResponse> {
		if (this.port instanceof Promise) this.port = await this.port;
		let channel = new MessageChannel();
		let toTransfer: Transferable[] = [channel.port2];
		if (message.fetch && message.fetch.body) toTransfer.push(message.fetch.body);

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
