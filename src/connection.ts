import { BareHeaders, TransferrableResponse } from "./baretypes";
import { nativeLocalStorage, nativePostMessage, nativeServiceWorker, nativeSharedWorker } from "./snapshot";

type SWClient = { postMessage: typeof MessagePort.prototype.postMessage };

export type WorkerMessage = {
	type: "fetch" | "websocket" | "set" | "get" | "ping",
	fetch?: {
		remote: string,
		method: string,
		headers: BareHeaders,
		body: ReadableStream | ArrayBuffer | undefined,
	}
	websocket?: {
		url: string,
		protocols: string[],
		requestHeaders: BareHeaders,
		channel: MessagePort,
	},
	client?: {
		function: string,
		args: any[],
	},
};

export type WorkerRequest = {
	message: WorkerMessage,
	port: MessagePort,
}

export type WorkerResponse = {
	type: "fetch" | "websocket" | "set" | "get" | "pong" | "error",
	fetch?: TransferrableResponse,
	name?: string,
	error?: Error,
}

export type BroadcastMessage = {
	type: "refreshPort",
}

async function searchForPort(): Promise<MessagePort> {
	// @ts-expect-error
	const clients: SWClient[] = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
	const promises: Promise<MessagePort>[] = clients.map(async (x: SWClient) => {
		const port = await tryGetPort(x);
		await testPort(port);
		return port;
	});
	const promise: Promise<MessagePort> = Promise.race([
		Promise.any(promises),
		new Promise((_, reject) => setTimeout(reject, 1000, new TypeError("timeout")))
	]) as Promise<MessagePort>;

	try {
		return await promise;
	} catch (err) {
		if (err instanceof AggregateError) {
			console.error("bare-mux: failed to get a bare-mux SharedWorker MessagePort as all clients returned an invalid MessagePort.");
			throw new Error("All clients returned an invalid MessagePort.");
		}
		console.warn("bare-mux: failed to get a bare-mux SharedWorker MessagePort within 1s, retrying");
		return await searchForPort();
	}
}

function tryGetPort(client: SWClient): Promise<MessagePort> {
	let channel = new MessageChannel();
	return new Promise(resolve => {
		client.postMessage({ type: "getPort", port: channel.port2 }, [channel.port2]);
		channel.port1.onmessage = event => {
			resolve(event.data)
		}
	});
}

function testPort(port: MessagePort): Promise<void> {
	const pingChannel = new MessageChannel();
	const pingPromise: Promise<void> = new Promise((resolve, reject) => {
		pingChannel.port1.onmessage = event => {
			if (event.data.type === "pong") {
				resolve();
			}
		};
		setTimeout(reject, 1500);
	});
	nativePostMessage.call(port, <WorkerRequest>{ message: { type: "ping" }, port: pingChannel.port2 }, [pingChannel.port2]);
	return pingPromise;
}

function createPort(path: string, registerHandlers: boolean): MessagePort {
	const worker = new nativeSharedWorker(path, {
		name: "bare-mux-worker",
		extendedLifetime: true
	});
	if (registerHandlers) {
		nativeServiceWorker.addEventListener("message", (event: MessageEvent) => {
			if (event.data.type === "getPort" && event.data.port) {
				console.debug("bare-mux: recieved request for port from sw");
				const newWorker = new nativeSharedWorker(path, {
					name: "bare-mux-worker",
					extendedLifetime: true
				});
				nativePostMessage.call(event.data.port, newWorker.port, [newWorker.port]);
			}
		});
	}
	return worker.port;
}

let browserSupportsTransferringStreamsCache: boolean | null = null;
export function browserSupportsTransferringStreams(): boolean {
	if (browserSupportsTransferringStreamsCache === null) {
		const chan = new MessageChannel();
		const stream = new ReadableStream();
		let res: boolean;
		try {
			nativePostMessage.call(chan.port1, stream, [stream]);
			res = true;
		} catch (err) {
			res = false;
		}
		browserSupportsTransferringStreamsCache = res;
		return res;
	} else {
		return browserSupportsTransferringStreamsCache;
	}
}

export class WorkerConnection {
	channel: BroadcastChannel;
	port: MessagePort | Promise<MessagePort>;
	workerPath: string;

	constructor(worker?: string | Promise<MessagePort> | MessagePort) {
		this.channel = new BroadcastChannel("bare-mux");
		if (worker instanceof MessagePort || worker instanceof Promise) {
			this.port = worker;
		} else {
			this.createChannel(worker, true);
		}
	}

	createChannel(workerPath?: string, inInit?: boolean) {
		// @ts-expect-error
		if (self.clients) {
			// running in a ServiceWorker
			// ask a window for the worker port, register for refreshPort
			this.port = searchForPort();
			this.channel.onmessage = (event: MessageEvent) => {
				if (event.data.type === "refreshPort") {
					this.port = searchForPort();
				}
			}
		} else if (workerPath && SharedWorker) {
			// running in a window, was passed a workerPath
			// create the SharedWorker and help other bare-mux clients get the workerPath

			if (!workerPath.startsWith("/") && !workerPath.includes("://")) throw new Error("Invalid URL. Must be absolute or start at the root.");
			this.port = createPort(workerPath, inInit);
			console.debug("bare-mux: setting localStorage bare-mux-path to", workerPath);
			nativeLocalStorage["bare-mux-path"] = workerPath;
		} else if (SharedWorker) {
			// running in a window, was not passed a workerPath
			// use sessionStorage for the workerPath
			const path = nativeLocalStorage["bare-mux-path"];
			console.debug("bare-mux: got localStorage bare-mux-path:", path);
			if (!path) throw new Error("Unable to get bare-mux workerPath from localStorage.");
			this.port = createPort(path, inInit);
		} else {
			// SharedWorker does not exist
			throw new Error("Unable to get a channel to the SharedWorker.");
		}
	}

	async sendMessage(message: WorkerMessage, transferable?: Transferable[]): Promise<WorkerResponse> {
		if (this.port instanceof Promise) this.port = await this.port;

		try {
			await testPort(this.port);
		} catch {
			console.warn("bare-mux: Failed to get a ping response from the worker within 1.5s. Assuming port is dead.");
			this.createChannel();
			return await this.sendMessage(message, transferable);
		}

		const channel = new MessageChannel();
		const toTransfer: Transferable[] = [channel.port2, ...(transferable || [])];

		const promise: Promise<WorkerResponse> = new Promise((resolve, reject) => {
			channel.port1.onmessage = event => {
				const message = event.data;
				if (message.type === "error") {
					reject(message.error);
				} else {
					resolve(message);
				}
			}
		});

		nativePostMessage.call(this.port, <WorkerRequest>{ message: message, port: channel.port2 }, toTransfer);

		return await promise;
	}
}
