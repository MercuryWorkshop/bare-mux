import { BareHeaders, maxRedirects } from './BareTypes';
import { findSwitcher } from './Switcher';
import { WebSocketFields } from './snapshot.js';
import { validProtocol } from './webSocket';


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
export class BareClient {

  /**
   * Create a BareClient. Calls to fetch and connect will wait for an implementation to be ready.
   */
  constructor() { }

  createWebSocket(
    remote: string | URL,
    protocols: string | string[] | undefined = [],
    webSocketImpl: WebSocketImpl,
    requestHeaders: BareHeaders,
    arrayBufferImpl: typeof ArrayBuffer,
  ): WebSocket {
    let switcher = findSwitcher();
    let client = switcher.active;
    if (!client) throw "invalid switcher";

    if (!client.ready)
      throw new TypeError(
        'You need to wait for the client to finish fetching the manifest before creating any WebSockets. Try caching the manifest data before making this request.'
      );

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


    let wsImpl = (webSocketImpl || WebSocket) as WebSocketImpl;
    const socket = new wsImpl("ws://127.0.0.1:1", protocols);

    let fakeProtocol = '';

    let fakeReadyState: number = WebSocketFields.CONNECTING;

    let initialErrorHappened = false;
    socket.addEventListener("error", (e) => {
      if (!initialErrorHappened) {
        fakeReadyState = WebSocket.CONNECTING;
        e.stopImmediatePropagation();
        initialErrorHappened = true;
      }
    });
    let initialCloseHappened = false;
    socket.addEventListener("close", (e) => {
      if (!initialCloseHappened) {
        e.stopImmediatePropagation();
        initialCloseHappened = true;
      }
    });
    // TODO socket onerror will be broken

    arrayBufferImpl = arrayBufferImpl || webSocketImpl.constructor.constructor("return ArrayBuffer")().prototype;
    requestHeaders['Host'] = (new URL(remote)).host;
    // requestHeaders['Origin'] = origin;
    requestHeaders['Pragma'] = 'no-cache';
    requestHeaders['Cache-Control'] = 'no-cache';
    requestHeaders['Upgrade'] = 'websocket';
    // requestHeaders['User-Agent'] = navigator.userAgent;
    requestHeaders['Connection'] = 'Upgrade';
    const sendData = client.connect(
      remote,
      origin,
      protocols,
      requestHeaders,
      (protocol: string) => {
        fakeReadyState = WebSocketFields.OPEN;
        fakeProtocol = protocol;

        (socket as any).meta = {
          headers: {
            "sec-websocket-protocol": protocol,
          }
        }; // what the fuck is a meta
        socket.dispatchEvent(new Event("open"));
      },
      async (payload) => {
        if (typeof payload === "string") {
          socket.dispatchEvent(new MessageEvent("message", { data: payload }));
        } else if ("byteLength" in payload) {
          if (socket.binaryType === "blob") {
            payload = new Blob([payload]);
          } else {
            Object.setPrototypeOf(payload, arrayBufferImpl);
          }

          socket.dispatchEvent(new MessageEvent("message", { data: payload }));
        } else if ("arrayBuffer" in payload) {
          if (socket.binaryType === "arraybuffer") {
            payload = await payload.arrayBuffer()
            Object.setPrototypeOf(payload, arrayBufferImpl);
          }

          socket.dispatchEvent(new MessageEvent("message", { data: payload }));
        }
      },
      (code, reason) => {
        fakeReadyState = WebSocketFields.CLOSED;
        socket.dispatchEvent(new CloseEvent("close", { code, reason }));
      },
      () => {
        fakeReadyState = WebSocketFields.CLOSED;
      },
    )

    // protocol is always an empty before connecting
    // updated when we receive the metadata
    // this value doesn't change when it's CLOSING or CLOSED etc
    const getReadyState = () => fakeReadyState;

    // we have to hook .readyState ourselves

    Object.defineProperty(socket, 'readyState', {
      get: getReadyState,
      configurable: true,
      enumerable: true,
    });

    /**
     * @returns The error that should be thrown if send() were to be called on this socket according to the fake readyState value
     */
    const getSendError = () => {
      const readyState = getReadyState();

      if (readyState === WebSocketFields.CONNECTING)
        return new DOMException(
          "Failed to execute 'send' on 'WebSocket': Still in CONNECTING state."
        );
    };

    // we have to hook .send ourselves
    // use ...args to avoid giving the number of args a quantity
    // no arguments will trip the following error: TypeError: Failed to execute 'send' on 'WebSocket': 1 argument required, but only 0 present.
    socket.send = function(...args) {
      const error = getSendError();

      if (error) throw error;
      sendData(args[0] as any);
    };

    Object.defineProperty(socket, 'url', {
      get: () => remote.toString(),
      configurable: true,
      enumerable: true,
    });

    const getProtocol = () => fakeProtocol;

    Object.defineProperty(socket, 'protocol', {
      get: getProtocol,
      configurable: true,
      enumerable: true,
    });

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
        ? Object.fromEntries(inputHeaders)
        : (inputHeaders as BareHeaders);


    const body = init?.body || req.body;

    let urlO = new URL(req.url);

    if (urlO.protocol.startsWith('blob:')) {
      const response = await fetch(urlO);
      const result: Response & Partial<BareResponse> = new Response(
        response.body,
        response
      );

      result.rawHeaders = Object.fromEntries(response.headers);
      result.rawResponse = response;

      return result as BareResponseFetch;
    }

    let switcher = findSwitcher();
    if (!switcher.active) {
      // in race conditions we trust
      await new Promise(r => setTimeout(r, 1000));
      switcher = findSwitcher();
    };
    if (!switcher.active) throw "there are no bare clients";
    const client = switcher.active;
    if (!client.ready) await client.init();

    for (let i = 0; ; i++) {
      if ('host' in headers) headers.host = urlO.host;
      else headers.Host = urlO.host;


      let resp = await client.request(
        urlO,
        req.method,
        body,
        headers,
        req.signal
      );

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
