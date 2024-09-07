import type { WorkerConnection } from "./connection";
import { WebSocketFields } from "./snapshot";
import { BareHeaders } from "./baretypes";

export class BareWebSocket extends EventTarget {
  url: string;

  channel: MessageChannel;
  constructor(
    remote: string | URL,
    public protocols: string | string[] | undefined = [],
    worker: WorkerConnection,
    requestHeaders?: BareHeaders,
  ) {
    super();
    this.url = remote.toString();
    this.protocols = protocols;

    const onopen = (protocol: string) => {
      this.protocols = protocol;

      const event = new Event("open")
      this.dispatchEvent(event);
    };

    const onmessage = async (payload) => {
      const event = new MessageEvent("message", { data: payload });
      this.dispatchEvent(event);
    };

    const onclose = (code: number, reason: string) => {
      const event = new CloseEvent("close", { code, reason })
      this.dispatchEvent(event);
    };

    const onerror = () => {
      const event = new Event("error");
      this.dispatchEvent(event);
    };

    this.channel = new MessageChannel();

    this.channel.port1.onmessage = event => {
      if (event.data.type === "open") {
        onopen(event.data.args[0]);
      } else if (event.data.type === "message") {
        onmessage(event.data.args[0]);
      } else if (event.data.type === "close") {
        onclose(event.data.args[0], event.data.args[1]);
      } else if (event.data.type === "error") {
        onerror(/* event.data.args[0] */);
      }
    }

    worker.sendMessage({
      type: "websocket",
      websocket: {
        url: remote.toString(),
        origin: origin,
        //@ts-expect-error
        protocols: protocols,
        requestHeaders: requestHeaders,
        channel: this.channel.port2,
      },
    }, [this.channel.port2])
  }

  send(...args) {
    let data = args[0];
    if (data.buffer) data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

    this.channel.port1.postMessage({ type: "data", data: data }, data instanceof ArrayBuffer ? [data] : []);
  }

  close(code, reason) {
    this.channel.port1.postMessage({ type: "close", closeCode: code, closeReason: reason });
  }
}
