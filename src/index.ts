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
console.debug("bare mux version: " + self.BARE_MUX_VERSION);