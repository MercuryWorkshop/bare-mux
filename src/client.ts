import { BareHeaders, BareTransport, maxRedirects } from './baretypes';
import { WorkerConnection } from './connection';
import { WebSocketFields } from './snapshot';


// get the unhooked value
const getRealReadyState = Object.getOwnPropertyDescriptor(
	WebSocket.prototype,
	'readyState'
)!.get!;

const wsProtocols = ['ws:', 'wss:'];
const statusEmpty = [101, 204, 205, 304];
const statusRedirect = [301, 302, 303, 307, 308];

export type WebSocketImpl = {
	new(...args: ConstructorParameters<typeof WebSocket>): WebSocket;
};

export namespace BareWebSocket {
	export type GetReadyStateCallback = () => number;
	export type GetSendErrorCallback = () => Error | undefined;
	export type GetProtocolCallback = () => string;
	export type HeadersType = BareHeaders | Headers | undefined;
	export type HeadersProvider =
		| BareHeaders
		| (() => BareHeaders | Promise<BareHeaders>);

	export interface Options {
		/**
		 * A provider of request headers to pass to the remote.
		 * Usually one of `User-Agent`, `Origin`, and `Cookie`
		 * Can be just the headers object or an synchronous/asynchronous function that returns the headers object
		 */
		headers?: BareWebSocket.HeadersProvider;
		/**
		 * A hook executed by this function with helper arguments for hooking the readyState property. If a hook isn't provided, bare-client will hook the property on the instance. Hooking it on an instance basis is good for small projects, but ideally the class should be hooked by the user of bare-client.
		 */
		readyStateHook?:
		| ((
			socket: WebSocket,
			getReadyState: BareWebSocket.GetReadyStateCallback
		) => void)
		| undefined;
		/**
		 * A hook executed by this function with helper arguments for determining if the send function should throw an error. If a hook isn't provided, bare-client will hook the function on the instance.
		 */
		sendErrorHook?:
		| ((
			socket: WebSocket,
			getSendError: BareWebSocket.GetSendErrorCallback
		) => void)
		| undefined;
		/**
		 * A hook executed by this function with the URL. If a hook isn't provided, bare-client will hook the URL.
		 */
		urlHook?: ((socket: WebSocket, url: URL) => void) | undefined;
		/**
		 * A hook executed by this function with a helper for getting the current fake protocol. If a hook isn't provided, bare-client will hook the protocol.
		 */
		protocolHook?:
		| ((
			socket: WebSocket,
			getProtocol: BareWebSocket.GetProtocolCallback
		) => void)
		| undefined;
		/**
		 * A callback executed by this function with an array of cookies. This is called once the metadata from the server is received.
		 */
		setCookiesCallback?: ((setCookies: string[]) => void) | undefined;
		webSocketImpl?: WebSocket;
	}
}

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

	constructor(workerPath: string) {
		this.worker = new WorkerConnection(workerPath);
	}

	async setTransport(transport: string) {
		await this.worker.sendMessage({
			type: "set",
			client: transport,
		});
	}
}

export class BareClient {
	worker: WorkerConnection;

	/**
	 * Create a BareClient. Calls to fetch and connect will wait for an implementation to be ready.
	 */
	constructor(workerPath?: string) {
		this.worker = new WorkerConnection(workerPath);
	}

	createWebSocket(
		remote: string | URL,
		protocols: string | string[] | undefined = [],
		webSocketImpl: WebSocketImpl,
		requestHeaders: BareHeaders,
		arrayBufferImpl: typeof ArrayBuffer,
	): WebSocket {
		throw new Error("todo");
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
			const response = await fetch(urlO);
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

			let resp = (await this.worker.sendMessage({
				type: "fetch",
				fetch: {
					remote: urlO.toString(),
					method: req.method,
					body: body,
					headers: headers,
				}
			})).fetch;

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
