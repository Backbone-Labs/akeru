import type { SaveService } from './index.js';
/** send and receive must be bound to the authenticated host channel. Never pass raw window messages. */
export function createSaveClient(
  send: (type: 'save', payload: unknown) => void,
  options?: { timeoutMs?: number },
): {
  readonly service: SaveService;
  receive(payload: unknown): boolean;
  dispose(): void;
};
