/** Where this title's parties go. Kept apart from `title.js` so that the one
 * line a release changes, in `network-config.js`, is checked the same way by
 * the title and by the tests. */

/** The only shape a deployed relay address takes: `wss://<host>/ws`, with
 * nothing else in it and never this machine. */
export function validEndpoint(value) {
  if (typeof value !== 'string') return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.href === value &&
    url.protocol === 'wss:' &&
    url.pathname === '/ws' &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    !/^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[[0-9a-f:.]*\])$/i.test(
      url.hostname,
    ) &&
    !url.hostname.endsWith('.localhost')
  );
}

/** `null`: no parties, and the game says so. 'same-origin': a relay the local
 * preview has bridged onto this title's own origin. Otherwise the deployed
 * relay. Anything malformed is no address at all, rather than a guess. */
export function partyUrl(configured, { protocol, host }) {
  if (configured === 'same-origin')
    return (protocol === 'https:' ? 'wss://' : 'ws://') + host + '/ws';
  return validEndpoint(configured) ? configured : '';
}
