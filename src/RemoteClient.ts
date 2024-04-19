/// <reference lib="WebWorker" />
import { v4 as uuid } from 'uuid';
import { BareHeaders, BareTransport, TransferrableResponse } from './BareTypes';
import { findSwitcher } from './Switcher';

export function registerRemoteListener(channel: ServiceWorker) {
  (navigator as any).serviceWorker.addEventListener("message", async ({ data }) => {
    if (data.type === "request") {
      const { remote, method, body, headers } = data;

      let response: any = await findSwitcher().active?.request(new URL(remote), method, body, headers, undefined)!;
      let transferred: any = [];
      if (response.body instanceof ArrayBuffer || response.body instanceof Blob || response.body instanceof ReadableStream) {
        transferred.push(response.body);
      }
      response.id = data.id;
      response.type = "response";
      channel.postMessage(response, transferred);
    }
  });
}

declare var self: ServiceWorkerGlobalScope;
let remote: RemoteTransport;
if ("ServiceWorkerGlobalScope" in self) {
  addEventListener("message", async ({ data }) => {
    if (data.type === "response") {
      let resolve = remote.promises.get(data.id);
      if (resolve) {
        resolve(data);
        remote.promises.delete(data.id);
      }
    }
  });
}

export default class RemoteTransport implements BareTransport {
  canstart = true;
  ready = false;
  promises = new Map<string, (data: any) => void>();
  constructor() {
    if (!("ServiceWorkerGlobalScope" in self)) {
      throw new TypeError("Attempt to construct RemoteClient from outside a service worker")
    }
  }

  async init() {
    remote = this;
    this.ready = true;
  }

  async meta() { }
  async request(
    remote: URL,
    method: string,
    body: BodyInit | null,
    headers: BareHeaders,
    signal: AbortSignal | undefined
  ): Promise<TransferrableResponse> {
    let id = uuid();
    const clients = await self.clients.matchAll();
    if (clients.length < 1)
      throw new Error("no available clients");

    for (const client of clients) {
      client.postMessage({
        type: "request",
        id,
        remote: remote.toString(),
        method,
        body,
        headers
      });
    }


    return await new Promise((resolve, reject) => {
      this.promises.set(id, resolve);
    });
  }

  connect(
    url: URL,
    origin: string,
    protocols: string[],
    requestHeaders: BareHeaders,
    onopen: (protocol: string) => void,
    onmessage: (data: Blob | ArrayBuffer | string) => void,
    onclose: (code: number, reason: string) => void,
    onerror: (error: string) => void
  ): (data: Blob | ArrayBuffer | string) => void {
    throw "why are you calling connect from remoteclient"
  }
}