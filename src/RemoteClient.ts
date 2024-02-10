// /// <reference lib="WebWorker" />
// import { v4 as uuid } from 'uuid';
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
