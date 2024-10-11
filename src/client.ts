import { BareHeaders, BareTransport, maxRedirects } from './baretypes';
import { WorkerConnection, WorkerMessage } from './connection';
import { nativeFetch } from './snapshot';
import { BareWebSocket } from './websocket';
import { handleFetch, handleWebsocket, sendError } from './workerHandlers';

const validChars =
	"!#$%&'*+-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ^_`abcdefghijklmnopqrstuvwxyz|~";

export function validProtocol(protocol: string): boolean {
	for (let i = 0; i < protocol.length; i++) {
		const char = protocol[i];

		if (!validChars.includes(char)) {
			return false;
		}
	}

	return true;
}

const wsProtocols = ['ws:', 'wss:'];
const statusEmpty = [101, 204, 205, 304];
const statusRedirect = [301, 302, 303, 307, 308];

/**
 * A Response with additional properties.
 */
export interface BareResponse extends Response {
	rawResponse: Response;
	rawHeaders: BareHeaders;
}
/**
 * A BareResponse with additional properties.
 */
export interface BareResponseFetch extends BareResponse {
	finalURL: string;
}

export class BareMuxConnection {
	worker: WorkerConnection;

	constructor(worker?: string | Promise<MessagePort> | MessagePort) {
		this.worker = new WorkerConnection(worker);
	}

	async getTransport(): Promise<string> {
		return (await this.worker.sendMessage({ type: "get" })).name;
	}

	async setTransport(path: string, options: any[], transferables?: Transferable[]) {
		await this.setManualTransport(`
			const { default: BareTransport } = await import("${path}");
			return [BareTransport, "${path}"];
		`, options, transferables);
	}

	async setManualTransport(functionBody: string, options: any[], transferables?: Transferable[]) {
		if (functionBody === "bare-mux-remote") throw new Error("Use setRemoteTransport.");
		await this.worker.sendMessage({
			type: "set",
			client: {
				function: functionBody,
				args: options,
			},
		}, transferables);
	}

	async setRemoteTransport(transport: BareTransport, name: string) {
		const channel = new MessageChannel();

		channel.port1.onmessage = async (event: MessageEvent) => {
			const port = event.data.port;
			const message: WorkerMessage = event.data.message;

			if (message.type === "fetch") {
				try {
					if (!transport.ready) await transport.init();
					await handleFetch(message, port, transport);
				} catch (err) {
					sendError(port, err, "fetch");
				}
			} else if (message.type === "websocket") {
				try {
					if (!transport.ready) await transport.init();
					await handleWebsocket(message, port, transport);
				} catch (err) {
					sendError(port, err, "websocket");
				}
			}
		}

		await this.worker.sendMessage({
			type: "set",
			client: {
				function: "bare-mux-remote",
				args: [channel.port2, name]
			},
		}, [channel.port2]);
	}

	getInnerPort(): MessagePort | Promise<MessagePort> {
		return this.worker.port;
	}
}

export class BareClient {
	worker: WorkerConnection;

	/**
	 * Create a BareClient. Calls to fetch and connect will wait for an implementation to be ready.
	 */
	constructor(worker?: string | Promise<MessagePort> | MessagePort) {
		this.worker = new WorkerConnection(worker);
	}

	createWebSocket(
		remote: string | URL,
		protocols: string | string[] | undefined = [],
		__deprecated_donotuse_websocket?: any,
		requestHeaders?: BareHeaders,
	): BareWebSocket {
		try {
			remote = new URL(remote);
		} catch (err) {
			throw new DOMException(
				`Faiiled to construct 'WebSocket': The URL '${remote}' is invalid.`
			);
		}

		if (!wsProtocols.includes(remote.protocol))
			throw new DOMException(
				`Failed to construct 'WebSocket': The URL's scheme must be either 'ws' or 'wss'. '${remote.protocol}' is not allowed.`
			);

		if (!Array.isArray(protocols)) protocols = [protocols];

		protocols = protocols.map(String);

		for (const proto of protocols)
			if (!validProtocol(proto))
				throw new DOMException(
					`Failed to construct 'WebSocket': The subprotocol '${proto}' is invalid.`
				);

		requestHeaders = requestHeaders || {};
		requestHeaders['Host'] = (new URL(remote)).host;
		// requestHeaders['Origin'] = origin;
		requestHeaders['Pragma'] = 'no-cache';
		requestHeaders['Cache-Control'] = 'no-cache';
		requestHeaders['Upgrade'] = 'websocket';
		// requestHeaders['User-Agent'] = navigator.userAgent;
		requestHeaders['Connection'] = 'Upgrade';

		const socket = new BareWebSocket(remote, protocols, this.worker, requestHeaders);

		return socket;
	}

	async fetch(
		url: string | URL,
		init?: RequestInit
	): Promise<BareResponseFetch> {
		// Only create an instance of Request to parse certain parameters of init such as method, headers, redirect
		// But use init values whenever possible
		const req = new Request(url, init);

		// try to use init.headers because it may contain capitalized headers
		// furthermore, important headers on the Request class are blocked...
		// we should try to preserve the capitalization due to quirks with earlier servers
		const inputHeaders = init?.headers || req.headers;

		const headers: BareHeaders =
			inputHeaders instanceof Headers
				? Object.fromEntries(inputHeaders as any)
				: (inputHeaders as BareHeaders);
		const body = req.body;

		let urlO = new URL(req.url);

		if (urlO.protocol.startsWith('blob:')) {
			const response = await nativeFetch(urlO);
			const result: Response & Partial<BareResponse> = new Response(
				response.body,
				response
			);

			result.rawHeaders = Object.fromEntries(response.headers as any);
			result.rawResponse = response;

			return result as BareResponseFetch;
		}

		for (let i = 0; ; i++) {
			if ('host' in headers) headers.host = urlO.host;
			else headers.Host = urlO.host;

			let resp = (await this.worker.sendMessage(<WorkerMessage>{
				type: "fetch",
				fetch: {
					remote: urlO.toString(),
					method: req.method,
					headers: headers,
					body: body || undefined,
				},
			}, body ? [body] : [])).fetch;

			let responseobj: BareResponse & Partial<BareResponseFetch> = new Response(
				statusEmpty.includes(resp.status) ? undefined : resp.body, {
				headers: new Headers(resp.headers as HeadersInit),
				status: resp.status,
				statusText: resp.statusText,
			}) as BareResponse;
			responseobj.rawHeaders = resp.headers;
			responseobj.rawResponse = new Response(resp.body);


			responseobj.finalURL = urlO.toString();

			const redirect = init?.redirect || req.redirect;

			if (statusRedirect.includes(responseobj.status)) {
				switch (redirect) {
					case 'follow': {
						const location = responseobj.headers.get('location');
						if (maxRedirects > i && location !== null) {
							urlO = new URL(location, urlO);
							continue;
						} else throw new TypeError('Failed to fetch');
					}
					case 'error':
						throw new TypeError('Failed to fetch');
					case 'manual':
						return responseobj as BareResponseFetch;
				}
			} else {
				return responseobj as BareResponseFetch;
			}
		}
	}
}
