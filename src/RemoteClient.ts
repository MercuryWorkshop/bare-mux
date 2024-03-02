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
//
// declare const self: ServiceWorkerGlobalScope;
// export default class RemoteClient extends Client {
//   static singleton: RemoteClient;
//   private callbacks: Record<string, (message: Record<string, any>) => void> = {};
//
//   private uid = uuid();
//   constructor() {
//     if (RemoteClient.singleton) return RemoteClient.singleton;
//     super();
//     // this should be fine
//     // if (!("ServiceWorkerGlobalScope" in self)) {
//     //   throw new TypeError("Attempt to construct RemoteClient from outside a service worker")
//     // }
//
//     addEventListener("message", (event) => {
//       if (event.data.__remote_target === this.uid) {
//         const callback = this.callbacks[event.data.__remote_id];
//         callback(event.data.__remote_value);
//       }
//     });
//
//     RemoteClient.singleton = this;
//   }
//
//   async send(message: Record<string, any>, id?: string) {
//     const clients = await self.clients.matchAll();
//     if (clients.length < 1)
//       throw new Error("no available clients");
//
//     for (const client of clients) {
//       client.postMessage({
//         __remote_target: this.uid,
//         __remote_id: id,
//         __remote_value: message
//       })
//     }
//
//   }
//
//   async sendWithResponse(message: Record<string, any>): Promise<any> {
//     const id = uuid();
//     return new Promise((resolve) => {
//       this.callbacks[id] = resolve;
//       this.send(message, id);
//     });
//   }
//
//   connect(
//     ...args: any
//   ) {
//     throw "why are you calling connect from remoteclient"
//   }
//   async request(
//     method: BareMethod,
//     requestHeaders: BareHeaders,
//     body: BodyInit | null,
//     remote: URL,
//     cache: BareCache | undefined,
//     duplex: string | undefined,
//     signal: AbortSignal | undefined
//   ): Promise<BareResponse> {
//
//     const response = await this.sendWithResponse({
//       type: "request",
//       options: {
//         method,
//         requestHeaders,
//         body,
//         remote: remote.toString(),
//       },
//     });
//     // const readResponse = await this.readBareResponse(response);
//
//     const result: Response & Partial<BareResponse> = new Response(
//       statusEmpty.includes(response.status!) ? undefined : response.body,
//       {
//         status: response.status,
//         statusText: response.statusText ?? undefined,
//         headers: new Headers(response.headers as HeadersInit),
//       }
//     );
//
//     result.rawHeaders = response.rawHeaders;
//     result.rawResponse = response;
//
//     return result as BareResponse;
//   }
// }
