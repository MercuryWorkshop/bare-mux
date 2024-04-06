import { BareTransport } from "./BareTypes";
import RemoteTransport from "./RemoteClient";

self.BCC_VERSION = "3.0.7";
console.debug("BCC_VERSION: " + self.BCC_VERSION);

declare global {
  interface ServiceWorkerGlobalScope {
    gSwitcher: Switcher;
    BCC_VERSION: string;
    BCC_DEBUG: boolean;
  }
  interface WorkerGlobalScope {
    gSwitcher: Switcher;
    BCC_VERSION: string;
    BCC_DEBUG: boolean;
  }
  interface Window {
    gSwitcher: Switcher;
    BCC_VERSION: string;
    BCC_DEBUG: boolean;
  }
}

function initTransport(name: string, config: any) {
  let cl = new ((0, eval)(name))(...config);
  cl.initpromise = cl.init();
  return cl;
}
class Switcher {
  active: BareTransport | null = null;

  channel = new BroadcastChannel("bare-mux");

  constructor() {
    this.channel.addEventListener("message", ({ data: { type, data } }) => {
      console.log(type, data, "ServiceWorker" in globalThis);
      switch (type) {
        case "setremote":
          this.active = new RemoteTransport
          break;
        case "set":
          const { name, config } = data;
          this.active = initTransport(name, config);
          break;
      }
    });
  }
}

export function findSwitcher(): Switcher {
  if (globalThis.gSwitcher) return globalThis.gSwitcher;
  if ("ServiceWorkerGlobalScope" in globalThis) {
    globalThis.gSwitcher = new Switcher;
    return globalThis.gSwitcher;
  }

  let _parent: any = window;
  for (let i = 0; i < 20; i++) {
    try {
      if (_parent == _parent.parent) {
        globalThis.gSwitcher = new Switcher;
        return globalThis.gSwitcher;
      }
      _parent = _parent.parent;

      if (_parent && _parent["gSwitcher"]) {
        console.debug("Found implementation on parent");
        globalThis.gSwitcher = _parent["gSwitcher"];
        return _parent["gSwitcher"];
      }
    } catch (e) {
      globalThis.gSwitcher = new Switcher;
      return globalThis.gSwitcher;
    }
  }

  throw "unreachable";
}
findSwitcher();

export function SetTransport(name: string, ...config: any[]) {
  let switcher = findSwitcher();
  switcher.active = initTransport(name, config);
  switcher.channel.postMessage({ type: "set", data: { name, config } });
}

export async function SetSingletonTransport(client: BareTransport) {
  let switcher = findSwitcher();
  await client.init();
  switcher.active = client;
  switcher.channel.postMessage({ type: "setremote" });
}
