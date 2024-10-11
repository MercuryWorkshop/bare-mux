export const nativeFetch = globalThis.fetch;
export const nativeWebSocket = globalThis.WebSocket;
export const nativeSharedWorker = globalThis.SharedWorker;
export const nativeLocalStorage = globalThis.localStorage;
export const nativeServiceWorker = globalThis.navigator.serviceWorker;
export const nativePostMessage = MessagePort.prototype.postMessage;

export const WebSocketFields = {
  prototype: {
    send: WebSocket.prototype.send,
  },
  CLOSED: WebSocket.CLOSED,
  CLOSING: WebSocket.CLOSING,
  CONNECTING: WebSocket.CONNECTING,
  OPEN: WebSocket.OPEN,
};
