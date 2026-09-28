import { Client } from '@colyseus/sdk';
import { CAPABILITY, validRequest, validRoom } from './protocol.js';
/** Trusted shell factory. Never accept endpoint/title/build/credentials from an iframe. */
export function createMultiplayerFactory({
  endpoint,
  titleId,
  build,
  roomName,
  validateInput,
  storage,
  inviteBase = location.origin,
}) {
  if (storage === undefined) {
    try {
      storage = globalThis.sessionStorage;
    } catch {
      storage = null;
    }
  }
  const url = new URL(endpoint);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw Error('Invalid multiplayer endpoint');
  if (location.protocol === 'https:' && url.protocol !== 'https:')
    throw Error('Secure multiplayer endpoint required');
  return (entry) => {
    if (
      entry.manifest.id !== titleId ||
      !entry.manifest.capabilities.includes(CAPABILITY)
    )
      return null;
    const key = `akeru:room:v1:${titleId}:${url.origin}:${build}`;
    let room = null,
      notify = () => {},
      busy = false,
      disposed = false,
      dropped = false;
    const client = new Client(url.origin);
    let lastRemember = 0;
    function stored() {
      try {
        const v = JSON.parse(storage.getItem(key));
        return v?.expires > Date.now() && typeof v.token === 'string'
          ? v
          : null;
      } catch {
        return null;
      }
    }
    function remember() {
      try {
        storage.setItem(
          key,
          JSON.stringify({
            token: room.reconnectionToken,
            expires: Date.now() + 30000,
          }),
        );
      } catch {
        /* Guest sessions still work without storage. */
      }
    }
    function forget() {
      try {
        storage.removeItem(key);
      } catch {
        /* Storage may be blocked. */
      }
    }
    const emit = (status, extra = {}) => {
      if (!disposed) notify({ status, ...extra });
    };
    async function leave(previous) {
      if (!previous) return;
      previous.reconnection.enabled = false;
      if (previous.connection.isOpen) await previous.leave();
      else previous.connection.close(4000);
    }
    const invite = new URLSearchParams(location.search).get('room');
    return {
      connect(callback) {
        notify = callback;
        emit('available', {
          invite: validRoom(invite) ? invite : null,
          resumable: !!stored(),
        });
      },
      receive(v) {
        if (disposed || !validRequest(v, validateInput)) return false;
        if (v.action === 'input') {
          if (room && !dropped && !busy) room.send('command', v);
          return true;
        }
        if (busy) return true;
        if (['ready', 'start', 'rematch'].includes(v.action)) {
          if (room && !dropped) room.send('command', v);
          return true;
        }
        busy = true;
        void (async () => {
          try {
            if (v.action === 'leave') {
              const previous = room;
              room = null;
              forget();
              await leave(previous);
              emit('available');
              return;
            }
            if (room) return;
            emit('connecting');
            const saved = stored();
            const next =
              v.action === 'resume' && saved
                ? await client.reconnect(saved.token)
                : v.action === 'create'
                  ? await client.create(roomName, { build })
                  : v.action === 'join'
                    ? await client.joinById(v.code, { build })
                    : null;
            if (!next) throw Error('Room unavailable');
            if (disposed) {
              await next.leave();
              return;
            }
            room = next;
            dropped = false;
            room.reconnection.maxRetries = 15;
            room.reconnection.minUptime = 0;
            room.reconnection.maxDelay = 2000;
            room.reconnection.maxEnqueuedMessages = 0;
            remember();
            next.onMessage('snapshot', (snapshot) => {
              if (room !== next || snapshot.build !== build) return;
              if (Date.now() - lastRemember > 5000) {
                remember();
                lastRemember = Date.now();
              }
              emit('connected', {
                sessionId: next.sessionId,
                inviteUrl: `${inviteBase}/play/${titleId}?room=${next.roomId}`,
                snapshot,
              });
            });
            next.onDrop(() => {
              if (room === next) {
                dropped = true;
                remember();
                emit('reconnecting');
              }
            });
            next.onReconnect(() => {
              if (room === next) {
                dropped = false;
                remember();
              }
            });
            next.onLeave(() => {
              if (room === next) {
                room = null;
                forget();
                emit('disconnected');
              }
            });
            next.onError(() =>
              emit('error', {
                message:
                  'Connection interrupted. Try reconnecting or joining again.',
              }),
            );
          } catch {
            forget();
            emit('error', {
              message:
                'Could not join. Check the code, available seats, connection, and game version.',
            });
          } finally {
            busy = false;
          }
        })();
        return true;
      },
      dispose() {
        disposed = true;
        forget();
        const previous = room;
        room = null;
        void leave(previous);
      },
    };
  };
}
