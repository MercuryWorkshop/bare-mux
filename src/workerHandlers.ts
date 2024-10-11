import { BareTransport } from "./baretypes";
import { browserSupportsTransferringStreams, WorkerMessage, WorkerResponse } from "./connection";
import { nativePostMessage } from "./snapshot";

export function sendError(port: MessagePort, err: Error, name: string) {
	console.error(`error while processing '${name}': `, err);
	port.postMessage(<WorkerResponse>{ type: "error", error: err });
}

export async function handleFetch(message: WorkerMessage, port: MessagePort, transport: BareTransport) {
	const resp = await transport.request(
		new URL(message.fetch.remote),
		message.fetch.method,
		message.fetch.body,
		message.fetch.headers,
		null
	);

	if (!browserSupportsTransferringStreams() && resp.body instanceof ReadableStream) {
		const conversionResp = new Response(resp.body);
		resp.body = await conversionResp.arrayBuffer();
	}

	if (resp.body instanceof ReadableStream || resp.body instanceof ArrayBuffer) {
		nativePostMessage.call(port, <WorkerResponse>{ type: "fetch", fetch: resp }, [resp.body]);
	} else {
		nativePostMessage.call(port, <WorkerResponse>{ type: "fetch", fetch: resp });
	}
}

export async function handleWebsocket(message: WorkerMessage, port: MessagePort, transport: BareTransport) {
	const onopen = (protocol: string) => {
		nativePostMessage.call(message.websocket.channel, { type: "open", args: [protocol] });
	};
	const onclose = (code: number, reason: string) => {
		nativePostMessage.call(message.websocket.channel, { type: "close", args: [code, reason] });
	};
	const onerror = (error: string) => {
		nativePostMessage.call(message.websocket.channel, { type: "error", args: [error] });
	};
	const onmessage = (data: Blob | ArrayBuffer | string) => {
		if (data instanceof ArrayBuffer) {
			nativePostMessage.call(message.websocket.channel, { type: "message", args: [data] }, [data]);
		} else {
			nativePostMessage.call(message.websocket.channel, { type: "message", args: [data] });
		}
	}
	const [data, close] = transport.connect(
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

	nativePostMessage.call(port, <WorkerResponse>{ type: "websocket" });
}
