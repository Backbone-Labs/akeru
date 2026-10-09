// Title actions for Akeru's pill. Like input and saves they arrive over the
// authenticated host channel; nothing here is reachable from the page.
//
// Slipface keeps bests, ghosts and settings, and writes them as they change.
// It has no mid-run snapshot, so `save` confirms that progress is stored and
// `restore` says plainly that there is nothing to restore.

export const supported = [
  'save',
  'save-status',
  'audio',
  'audio-status',
  'restore',
  'restart',
];

const NO_SNAPSHOT = { hasManualSave: false, savedAt: null };

/**
 * @param {{
 *   game: () => object,          the running game (createGame's return value)
 *   send: (type: string, payload: object) => void,
 *   flush: () => Promise<void>,  store current progress; rejects when saving is unavailable
 *   audioHeld: () => boolean,    true while the host's pause is the only thing silencing sound
 *   settle?: () => Promise<void> wait for the browser to act on an audio request
 * }} options
 */
export function createPill({
  game,
  send,
  flush,
  audioHeld,
  settle = () => new Promise((resolve) => setTimeout(resolve, 100)),
}) {
  const busy = new Set();
  const audioState = () => {
    const audio = game().status().audio;
    if (!audio || audio.status === 'unavailable') return 'unavailable';
    if (audio.muted) return 'off';
    return audio.status === 'running' || audioHeld() ? 'on' : 'blocked';
  };
  return {
    supported,
    async receive(payload) {
      if (
        !Number.isSafeInteger(payload?.id) ||
        !supported.includes(payload.action)
      )
        return;
      const { id, action } = payload;
      const reply = (ok, message, state = {}) =>
        send('action-result', { id, ok, message, state });
      const group =
        action === 'audio-status'
          ? null
          : action === 'audio'
            ? 'audio'
            : 'save';
      if (group && busy.has(group)) {
        reply(false, 'An action is in progress. Try again.');
        return;
      }
      if (group) busy.add(group);
      try {
        if (action === 'save' || action === 'save-status') {
          await flush();
          reply(
            true,
            'Bests, ghosts and settings are saved on this device. A run in progress is not saved.',
            NO_SNAPSHOT,
          );
        } else if (action === 'restore') {
          reply(
            false,
            'Slipface saves progress as you play. It has no mid-run save point to restore.',
            NO_SNAPSHOT,
          );
        } else if (action === 'restart') {
          if (!game().status().run)
            reply(false, 'Start a run before restarting.');
          else {
            game().restart();
            reply(true, 'Run restarted. Saved progress is unchanged.');
          }
        } else {
          if (action === 'audio' && audioState() !== 'unavailable') {
            const enable = audioState() !== 'on';
            game().setMuted(!enable);
            if (enable) {
              game().unlockAudio();
              await settle();
            }
          }
          // A browser that is still waiting for a tap is a state, not a failure:
          // the native pill uses it to show its tap-to-enable guidance.
          const state = audioState();
          reply(
            true,
            state === 'on'
              ? 'Sound on.'
              : state === 'off'
                ? 'Sound off.'
                : state === 'blocked'
                  ? 'Resume and tap the game to enable sound.'
                  : 'Sound is not available on this device.',
            { audioState: state === 'unavailable' ? 'off' : state },
          );
        }
      } catch {
        reply(false, 'Action unavailable. Existing progress is preserved.');
      } finally {
        if (group) busy.delete(group);
      }
    },
  };
}
