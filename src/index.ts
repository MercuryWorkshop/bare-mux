export * from './baretypes';
export * from './client';
export * from './connection';
export { BareClient as default } from './client';
export { WebSocketFields } from "./snapshot";
export { BareWebSocket } from "./websocket";

export type * from './baretypes';
export type * from './client';
export type * from './connection';
export type * from "./snapshot";

//@ts-expect-error this gets filled in
console.debug(`bare-mux: running v${self.BARE_MUX_VERSION} (build ${self.BARE_MUX_COMMITHASH})`);