/** Akeru's menu actions answered with what this game really does. A descent
 * is saved at each huddle; there is no snapshot of a dash to restore. */
export const supported = Object.freeze([
  'save',
  'save-status',
  'audio',
  'audio-status',
  'restore',
  'restart',
]);
const noSnapshot = Object.freeze({ hasManualSave: false, savedAt: null });

/** `heldSound` is true while the host has the game paused and sound was
 * running when that pause began: it is suspended then, not refused. Sound the
 * browser never let start is `blocked`, paused or not. */
export function audioState(status, heldSound) {
  if (status.muted || status.state === 'unavailable') return 'off';
  return status.state === 'running' ||
    (heldSound && status.state === 'suspended')
    ? 'on'
    : 'blocked';
}

export function createActions({ game, flush, send, heldSound }) {
  const busy = new Set();
  return {
    async receive(payload) {
      if (
        !payload ||
        !Number.isSafeInteger(payload.id) ||
        !supported.includes(payload.action)
      )
        return;
      const { id, action } = payload;
      const reply = (ok, message, state) =>
        send(
          'action-result',
          state ? { id, ok, message, state } : { id, ok, message },
        );
      const group = action.startsWith('audio') ? 'audio' : 'save';
      if (busy.has(group)) {
        reply(false, 'Still working on the last request. Try again.');
        return;
      }
      busy.add(group);
      try {
        if (action === 'save' || action === 'save-status') {
          await flush();
          reply(
            true,
            game.online
              ? 'Records and settings are saved on this device. A party’s descent lives with the party and cannot be restored.'
              : 'Saved on this device. A descent resumes from its last huddle; a dash in progress is not kept.',
            noSnapshot,
          );
        } else if (action === 'restore') {
          reply(
            false,
            'The game saves itself at every huddle. There is no separate save point to restore.',
            noSnapshot,
          );
        } else if (action === 'restart') {
          if (game.online)
            reply(
              false,
              'A party cannot be restarted from here. Leave it from the game’s own menu.',
            );
          else if (!game.session)
            reply(false, 'Start a descent before restarting.');
          else {
            game.restart();
            reply(
              true,
              'Back at the title screen. Your descent is kept as of its last huddle.',
            );
          }
        } else {
          if (action === 'audio') {
            const status = game.audioStatus();
            game.setMuted(!status.muted);
            // Changing the setting is the player's choice even if the browser
            // is still holding sound back; give a fresh context a moment.
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          const state = audioState(game.audioStatus(), heldSound());
          reply(
            true,
            state === 'off'
              ? 'Sound off.'
              : state === 'on'
                ? 'Sound on.'
                : 'Resume and tap the game once to start sound.',
            { audioState: state },
          );
        }
      } catch {
        reply(false, 'Saving is unavailable. Existing progress is preserved.');
      } finally {
        busy.delete(group);
      }
    },
  };
}
