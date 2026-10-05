// Room credentials stay in this title frame; only the invitation code is shareable.
export function roomCode(value) {
  const code = String(value || '')
    .toUpperCase()
    .replace(/[ -]/g, '');
  return /^[A-F0-9]{20}$/.test(code) ? code : null;
}
export function chooseRoom({ relayUrl, shell, invitation, status }) {
  const api = new URL(relayUrl);
  api.protocol = api.protocol === 'ws:' ? 'http:' : 'https:';
  api.pathname = '/';
  const lobby = document.querySelector('#room-lobby');
  const create = document.querySelector('#room-create');
  const form = document.querySelector('#room-join-form');
  const input = document.querySelector('#room-code');
  const share = document.querySelector('#room-share');
  const dialog = document.querySelector('#room-dialog');
  const invite = document.querySelector('#room-invite');
  const roomLabel = document.querySelector('#room-label');
  let busy = false,
    current;
  lobby.hidden = false;
  status.textContent = 'Your friends. Your arena.';
  const normalized = roomCode(invitation);
  if (normalized) {
    input.value = normalized;
    status.textContent = 'You’re invited. Join your friends’ private room.';
    form.querySelector('button').focus();
  } else create.focus();
  const request = async (path, body = {}) => {
    const response = await fetch(new URL(path, api), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error || 'Could not open this room. Try again.');
    return result;
  };
  share.onclick = () => dialog.showModal();
  document.querySelector('#room-dialog-close').onclick = () => dialog.close();
  document.querySelector('#room-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(invite.value);
      document.querySelector('#room-copy-status').textContent =
        'Invite copied. Send it to your friends.';
    } catch {
      invite.focus();
      invite.select();
      document.querySelector('#room-copy-status').textContent =
        'Select and copy the link, or share the room code below.';
    }
  };
  document.querySelector('#room-end').onclick = async () => {
    if (!current?.owner || !confirm('Close this room for everyone?')) return;
    try {
      await request('rooms/close', {
        code: current.code,
        owner: current.owner,
      });
      location.reload();
    } catch (error) {
      document.querySelector('#room-copy-status').textContent = error.message;
    }
  };
  return new Promise((resolve) => {
    const open = async (code) => {
      if (busy) return;
      busy = true;
      lobby
        .querySelectorAll('button,input')
        .forEach((e) => (e.disabled = true));
      status.textContent = code
        ? 'Finding your private room…'
        : 'Creating your private arena…';
      try {
        current = await request(
          code ? 'rooms/join' : 'rooms',
          code ? { code } : {},
        );
        if (!roomCode(current.code) || !/^[a-f0-9]{48}$/.test(current.token))
          throw Error('Invalid room response. Please retry.');
        const link = new URL('/play/red-eclipse', shell);
        link.searchParams.set('room', current.code);
        invite.value = link.href;
        roomLabel.textContent = current.code.match(/.{4}/g).join(' ');
        document.querySelector('#room-end').hidden = !current.owner;
        lobby.hidden = true;
        share.hidden = false;
        resolve(current);
      } catch (error) {
        status.textContent = error.message;
        busy = false;
        lobby
          .querySelectorAll('button,input')
          .forEach((e) => (e.disabled = false));
      }
    };
    create.onclick = () => void open();
    form.onsubmit = (event) => {
      event.preventDefault();
      const code = roomCode(input.value);
      if (!code) {
        status.textContent =
          'Enter the full 20-character room code from your friend.';
        input.focus();
        return;
      }
      void open(code);
    };
  });
}

let confirmHeld = false,
  lastNavigation = 0;
export function navigateRoom(input) {
  const buttons = [
    ...document.querySelectorAll(
      '#room-lobby:not([hidden]) button, #room-dialog[open] button:not([hidden])',
    ),
  ].filter((button) => !button.disabled);
  const down = Boolean(input.actions[2]);
  if (!buttons.length) {
    confirmHeld = down;
    return;
  }
  let index = buttons.indexOf(document.activeElement);
  const direction =
    Math.abs(input.x) > 0.5
      ? Math.sign(input.x)
      : Math.abs(input.y) > 0.5
        ? Math.sign(input.y)
        : 0;
  if (direction && performance.now() - lastNavigation > 280) {
    index = (Math.max(0, index) + direction + buttons.length) % buttons.length;
    buttons[index].focus();
    lastNavigation = performance.now();
  }
  if (down && !confirmHeld) buttons[Math.max(0, index)].click();
  confirmHeld = down;
}
