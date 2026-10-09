/** Title actions remain behind the authenticated host channel, like input and saves. */
export function createPill({
  game,
  flush,
  send,
  audioChanged,
  restart,
  audioPaused = () => false,
}) {
  const supported = [
    'save',
    'save-status',
    'audio',
    'audio-status',
    'restore',
    'restart',
  ];
  const busy = new Set();
  const audioState = () => {
    const sfx = game()?.sfx;
    return sfx?.enabled === false
      ? 'off'
      : sfx?.ctx?.state === 'running' || audioPaused()
        ? 'on'
        : 'blocked';
  };
  return {
    supported,
    async receive(payload) {
      if (
        !Number.isSafeInteger(payload?.id) ||
        !supported.includes(payload.action)
      )
        return;
      const reply = (ok, message, state = {}) =>
        send('action-result', { id: payload.id, ok, message, state });
      const group =
        payload.action === 'audio-status'
          ? null
          : payload.action === 'audio'
            ? 'audio'
            : 'save';
      if (group && busy.has(group)) {
        reply(false, 'An action is in progress. Try again.');
        return;
      }
      if (group) busy.add(group);
      try {
        if (payload.action === 'save' || payload.action === 'save-status') {
          await flush();
          // These games save progression, not a restorable running simulation.
          // Never expose a fake Doom-style snapshot or rewind an online room.
          reply(
            true,
            game()?.mode === 'online'
              ? 'Progress saved on this device. Online rounds keep running and cannot be restored.'
              : 'Progress and settings saved on this device. Active rounds restart when reopened.',
            { hasManualSave: false, savedAt: null },
          );
        } else if (payload.action === 'restore') {
          reply(
            false,
            'This game saves progress automatically. It has no mid-round save point to restore.',
            { hasManualSave: false, savedAt: null },
          );
        } else if (payload.action === 'restart') {
          if (game()?.mode === 'online')
            reply(
              false,
              'An online kitchen cannot be restarted from the pill. Return to its lobby together.',
            );
          else if (!restart?.(game()))
            reply(false, 'Start a level before restarting.');
          else reply(true, 'Level restarted. Saved progress is unchanged.');
        } else {
          const sfx = game()?.sfx;
          if (payload.action === 'audio') {
            const enabled = sfx.enabled === false || audioState() === 'blocked';
            sfx.setEnabled(enabled);
            audioChanged?.(game(), enabled);
            if (enabled && !audioPaused()) {
              sfx._unlock?.();
              sfx._ensure?.();
              void sfx.ctx?.resume?.().catch(() => {});
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }
          // A blocked browser context is a valid status, not a failed command.
          // Native pill UI uses this state to show the tap-to-enable guidance.
          const state = audioState();
          reply(
            true,
            state === 'off'
              ? 'Sound off.'
              : state === 'on'
                ? 'Sound on.'
                : 'Resume and tap the game to enable sound.',
            { audioState: state },
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
