/*
 * WebSocket helpers
 */

const validChars =
  "!#$%&'*+-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ^_`abcdefghijklmnopqrstuvwxyz|~";

export function validProtocol(protocol: string): boolean {
  for (let i = 0; i < protocol.length; i++) {
    const char = protocol[i];

    if (!validChars.includes(char)) {
      return false;
    }
  }

  return true;
}
