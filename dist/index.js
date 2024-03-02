const maxRedirects = 20;

// The user likely has overwritten all networking functions after importing bare-client
// It is our responsibility to make sure components of Bare-Client are using native networking functions
const fetch = globalThis.fetch;
const WebSocket = globalThis.WebSocket;
const Request = globalThis.Request;
const Response = globalThis.Response;
const WebSocketFields = {
    prototype: {
        send: WebSocket.prototype.send,
    },
    CLOSED: WebSocket.CLOSED,
    CLOSING: WebSocket.CLOSING,
    CONNECTING: WebSocket.CONNECTING,
    OPEN: WebSocket.OPEN,
};

self.BCC_VERSION = "3.0.2";
console.warn("BCC_VERSION: " + self.BCC_VERSION);
class Switcher {
    active = null;
    channel = new BroadcastChannel("bare-mux");
    constructor() {
        this.channel.addEventListener("message", ({ data: { type, data } }) => {
            console.log(type, data, "ServiceWorker" in globalThis);
            switch (type) {
                case "setremote":
                    // this.active = new RemoteClient
                    break;
                case "set":
                    const { name, config } = data;
                    this.active = new ((0, eval)(name))(...config);
                    break;
            }
        });
    }
}
function findSwitcher() {
    if (globalThis.gSwitcher)
        return globalThis.gSwitcher;
    if ("ServiceWorkerGlobalScope" in globalThis) {
        globalThis.gSwitcher = new Switcher;
        return globalThis.gSwitcher;
    }
    let _parent = window;
    for (let i = 0; i < 20; i++) {
        try {
            if (_parent == _parent.parent) {
                globalThis.gSwitcher = new Switcher;
                return globalThis.gSwitcher;
            }
            _parent = _parent.parent;
            if (_parent && _parent["gSwitcher"]) {
                console.warn("found implementation on parent");
                globalThis.gSwitcher = _parent["gSwitcher"];
                return _parent["gSwitcher"];
            }
        }
        catch (e) {
            globalThis.gSwitcher = new Switcher;
            return globalThis.gSwitcher;
        }
    }
    throw "unreachable";
}
findSwitcher();
function SetTransport(name, ...config) {
    let switcher = findSwitcher();
    switcher.active = new ((0, eval)(name))(...config);
    switcher.channel.postMessage({ type: "set", data: { name, config } });
}
function SetSingletonTransport(client) {
    let switcher = findSwitcher();
    switcher.active = client;
    switcher.channel.postMessage({ type: "setremote" });
}

/*
 * WebSocket helpers
 */
const validChars = "!#$%&'*+-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ^_`abcdefghijklmnopqrstuvwxyz|~";
function validProtocol(protocol) {
    for (let i = 0; i < protocol.length; i++) {
        const char = protocol[i];
        if (!validChars.includes(char)) {
            return false;
        }
    }
    return true;
}

// get the unhooked value
const getRealReadyState = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'readyState').get;
const wsProtocols = ['ws:', 'wss:'];
const statusEmpty = [101, 204, 205, 304];
const statusRedirect = [301, 302, 303, 307, 308];
class BareClient {
    /**
     * Create a BareClient. Calls to fetch and connect will wait for an implementation to be ready.
     */
    constructor() { }
    createWebSocket(remote, protocols = [], webSocketImpl, requestHeaders, arrayBufferImpl) {
        let switcher = findSwitcher();
        let client = switcher.active;
        if (!client)
            throw "invalid switcher";
        if (!client.ready)
            throw new TypeError('You need to wait for the client to finish fetching the manifest before creating any WebSockets. Try caching the manifest data before making this request.');
        try {
            remote = new URL(remote);
        }
        catch (err) {
            throw new DOMException(`Faiiled to construct 'WebSocket': The URL '${remote}' is invalid.`);
        }
        if (!wsProtocols.includes(remote.protocol))
            throw new DOMException(`Failed to construct 'WebSocket': The URL's scheme must be either 'ws' or 'wss'. '${remote.protocol}' is not allowed.`);
        if (!Array.isArray(protocols))
            protocols = [protocols];
        protocols = protocols.map(String);
        for (const proto of protocols)
            if (!validProtocol(proto))
                throw new DOMException(`Failed to construct 'WebSocket': The subprotocol '${proto}' is invalid.`);
        let wsImpl = (webSocketImpl || WebSocket);
        const socket = new wsImpl("wss:null", protocols);
        let fakeProtocol = '';
        let fakeReadyState = WebSocketFields.CONNECTING;
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
        const sendData = client.connect(remote, origin, protocols, requestHeaders, (protocol) => {
            fakeReadyState = WebSocketFields.OPEN;
            fakeProtocol = protocol;
            socket.meta = {
                headers: {
                    "sec-websocket-protocol": protocol,
                }
            }; // what the fuck is a meta
            socket.dispatchEvent(new Event("open"));
        }, async (payload) => {
            if (typeof payload === "string") {
                socket.dispatchEvent(new MessageEvent("message", { data: payload }));
            }
            else if ("byteLength" in payload) {
                if (socket.binaryType === "blob") {
                    payload = new Blob([payload]);
                }
                else {
                    Object.setPrototypeOf(payload, arrayBufferImpl);
                }
                socket.dispatchEvent(new MessageEvent("message", { data: payload }));
            }
            else if ("arrayBuffer" in payload) {
                if (socket.binaryType === "arraybuffer") {
                    payload = await payload.arrayBuffer();
                    Object.setPrototypeOf(payload, arrayBufferImpl);
                    console.log(payload);
                }
                socket.dispatchEvent(new MessageEvent("message", { data: payload }));
            }
        }, (code, reason) => {
            fakeReadyState = WebSocketFields.CLOSED;
            socket.dispatchEvent(new CloseEvent("close", { code, reason }));
        }, () => {
            fakeReadyState = WebSocketFields.CLOSED;
        });
        // const socket = this.client.connect(
        //   remote,
        //   protocols,
        //   async () => {
        //     const resolvedHeaders =
        //       typeof options.headers === 'function'
        //         ? await options.headers()
        //         : options.headers || {};
        //
        //     const requestHeaders: BareHeaders =
        //       resolvedHeaders instanceof Headers
        //         ? Object.fromEntries(resolvedHeaders)
        //         : resolvedHeaders;
        //
        //     // user is expected to specify user-agent and origin
        //     // both are in spec
        //
        //
        //     return requestHeaders;
        //   },
        //   (meta) => {
        //     fakeProtocol = meta.protocol;
        //     if (options.setCookiesCallback)
        //       options.setCookiesCallback(meta.setCookies);
        //   },
        //   (readyState) => {
        //     fakeReadyState = readyState;
        //   },
        //   options.webSocketImpl || WebSocket
        // );
        // protocol is always an empty before connecting
        // updated when we receive the metadata
        // this value doesn't change when it's CLOSING or CLOSED etc
        const getReadyState = () => {
            const realReadyState = getRealReadyState.call(socket);
            // readyState should only be faked when the real readyState is OPEN
            return realReadyState === WebSocketFields.OPEN
                ? fakeReadyState
                : realReadyState;
        };
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
                return new DOMException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.");
        };
        // we have to hook .send ourselves
        // use ...args to avoid giving the number of args a quantity
        // no arguments will trip the following error: TypeError: Failed to execute 'send' on 'WebSocket': 1 argument required, but only 0 present.
        socket.send = function (...args) {
            const error = getSendError();
            if (error)
                throw error;
            sendData(args[0]);
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
    async fetch(url, init) {
        // Only create an instance of Request to parse certain parameters of init such as method, headers, redirect
        // But use init values whenever possible
        const req = new Request(url, init);
        // try to use init.headers because it may contain capitalized headers
        // furthermore, important headers on the Request class are blocked...
        // we should try to preserve the capitalization due to quirks with earlier servers
        const inputHeaders = init?.headers || req.headers;
        const headers = inputHeaders instanceof Headers
            ? Object.fromEntries(inputHeaders)
            : inputHeaders;
        const body = init?.body || req.body;
        let urlO = new URL(req.url);
        if (urlO.protocol.startsWith('blob:')) {
            const response = await fetch(urlO);
            const result = new Response(response.body, response);
            result.rawHeaders = Object.fromEntries(response.headers);
            result.rawResponse = response;
            return result;
        }
        let switcher = findSwitcher();
        if (!switcher.active)
            throw "there are no bare clients";
        const client = switcher.active;
        if (!client.ready)
            await client.init();
        for (let i = 0;; i++) {
            if ('host' in headers)
                headers.host = urlO.host;
            else
                headers.Host = urlO.host;
            let resp = await client.request(urlO, req.method, body, headers, req.signal);
            let responseobj = new Response(statusEmpty.includes(resp.status) ? undefined : resp.body, {
                headers: new Headers(resp.headers),
                status: resp.status,
                statusText: resp.statusText,
            });
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
                        }
                        else
                            throw new TypeError('Failed to fetch');
                    }
                    case 'error':
                        throw new TypeError('Failed to fetch');
                    case 'manual':
                        return responseobj;
                }
            }
            else {
                return responseobj;
            }
        }
    }
}

export { BareClient, SetSingletonTransport, SetTransport, WebSocketFields, BareClient as default, findSwitcher, maxRedirects };
//# sourceMappingURL=index.js.map
