/** Trusted host registrations; title manifests cannot choose network endpoints. */
import { createKartMultiplayerFactory } from '../../old-san-juan-kart/multiplayer/browser.js';
import {
  createBlacklineMultiplayerFactory,
  blacklineInputMapping,
} from '../../operation-blackline/multiplayer/browser.js';
export { createKartMultiplayerFactory, createBlacklineMultiplayerFactory };
export function createCatalogMultiplayerFactory({ endpoints, ...options }) {
  const registrations = {
    'old-san-juan-kart': createKartMultiplayerFactory,
    'operation-blackline': createBlacklineMultiplayerFactory,
  };
  const factories = new Map();
  for (const [id, endpoint] of Object.entries(endpoints)) {
    if (!Object.hasOwn(registrations, id))
      throw Error('Unknown multiplayer registration');
    factories.set(id, registrations[id]({ ...options, endpoint }));
  }
  return (entry) => factories.get(entry.manifest.id)?.(entry) ?? null;
}
export function catalogInputMapping(titleId) {
  return titleId === 'operation-blackline' ? blacklineInputMapping : undefined;
}
