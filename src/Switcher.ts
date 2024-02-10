import { BareTransport } from "./BareTypes";

self.BCC_VERSION = "2.1.3";
console.warn("BCC_VERSION: " + self.BCC_VERSION);

if (!("gTransports" in globalThis)) {
  globalThis.gTransports = {};
}


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

class Switcher {
  transports: Record<string, BareTransport> = {};
  active: BareTransport | null = null;
}

export function findSwitcher(): Switcher {
  if (globalThis.gSwitcher) return globalThis.gSwitcher;

  for (let i = 0; i < 20; i++) {
    try {
      parent = parent.parent;
      if (parent && parent["gSwitcher"]) {
        console.warn("found implementation on parent");
        globalThis.gSwitcher = parent["gSwitcher"];
        return parent["gSwitcher"];
      }
    } catch (e) {

      globalThis.gSwitcher = new Switcher;
      return globalThis.gSwitcher;
    }
  }

  throw "unreachable";
}

export function AddTransport(name: string, client: BareTransport) {

  let switcher = findSwitcher();

  switcher.transports[name] = client;
  if (!switcher.active)
    switcher.active = switcher.transports[name];
}

export function SetTransport(name: string) {
  let switcher = findSwitcher();
  switcher.active = switcher.transports[name];
}
