import type { WorkerConnection } from "./connection";
import { WebSocketFields } from "./snapshot";
import { BareHeaders } from "./baretypes";

export class BareWebSocket extends EventTarget {
    url: string;
    protocols: string | string[] | undefined = [];
    readyState: number = WebSocketFields.CONNECTING;
    binaryType = "blob";

    //legacy event handlers
    onopen = null;
    onerror = null;
    onmessage = null;
    onclose = null;

    CONNECTING = WebSocketFields.CONNECTING;
    OPEN = WebSocketFields.OPEN;
    CLOSING = WebSocketFields.CLOSING;
    CLOSED = WebSocketFields.CLOSED;
    channel: MessageChannel;
    constructor(
      remote: string | URL,
      protocols: string | string[] | undefined = [],
      worker: WorkerConnection,
      requestHeaders?: BareHeaders,
      arrayBufferImpl?: ArrayBuffer,
    ) {
      super();
      this.url = remote.toString();
      this.protocols = protocols;
  
      const onopen = (protocol: string) => {
        this.readyState = WebSocketFields.OPEN;
        this.protocols = protocol;

        (this as any).meta = {
          headers: {
            "sec-websocket-protocol": protocol,
          }
        };
        const event = new Event("open")
        this.dispatchEvent(event);
        if (this.onopen) {
          this.onopen(event);
        }
      };
  
      const onmessage = async (payload) => {
        if (typeof payload === "string") {
        } else if ("byteLength" in payload) {
          if (this.binaryType === "blob") {
            payload = new Blob([payload]);
          } else {
            Object.setPrototypeOf(payload, arrayBufferImpl);
          }
        } else if ("arrayBuffer" in payload) {
          if (this.binaryType === "arraybuffer") {
            payload = await payload.arrayBuffer()
            Object.setPrototypeOf(payload, arrayBufferImpl);
          }
        }

        const event = new MessageEvent("message", {data: payload });
        this.dispatchEvent(event);
        if (this.onmessage) {
          this.onmessage(event);
        }
      };
  
      const onclose = (code: number, reason: string) => {
        this.readyState = WebSocketFields.CLOSED;
        const event = new CloseEvent("close", { code, reason })
        this.dispatchEvent(event);
        if (this.onclose) {
          this.onclose(event);
        }
      };
  
      const onerror = () => {
        this.readyState = WebSocketFields.CLOSED;
        const event = new Event("error");
        this.dispatchEvent(event);
        if (this.onerror) {
          this.onerror(event);
        };
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
        if (this.readyState === WebSocketFields.CONNECTING) {
            throw new DOMException(
                "Failed to execute 'send' on 'WebSocket': Still in CONNECTING state."
            );
        }

        let data = args[0];
        if (data.buffer) data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

        this.channel.port1.postMessage({ type: "data", data: data }, data instanceof ArrayBuffer ? [data] : []);
    }
  
    close(code, reason) {
      this.readyState = WebSocketFields.CLOSING;
      this.channel.port1.postMessage({ type: "close", closeCode: code, closeReason: reason });
    }
  
    get bufferedAmount() {
      return 0;
    }
    get protocol() {
      if (Array.isArray(this.protocols)) {
        return this.protocols[0] || "";
      } else {
        return this.protocols || "";
      }
    }
    get extensions() {
      return "";
    }
}