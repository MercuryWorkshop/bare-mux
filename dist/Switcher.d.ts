import { BareTransport } from "./BareTypes";
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
declare class Switcher {
    transports: Record<string, BareTransport>;
    active: BareTransport | null;
}
export declare function findSwitcher(): Switcher;
export declare function AddTransport(name: string, client: BareTransport): void;
export declare function SetTransport(name: string): void;
export {};
