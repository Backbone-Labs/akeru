import * as THREE from './three.js';
import { createSaveClient } from './save-client.js';
window.THREE = THREE;
window.AkeruSilentClip = class {
  paused = true;
  play() {
    return Promise.resolve();
  }
  pause() {}
  addEventListener() {}
};
const params = new URLSearchParams(location.hash.slice(1)),
  nonce = params.get('nonce'),
  shell = params.get('shell');
let sequence = 0,
  received = -1,
  started = false,
  ready = false,
  blocked = false,
  revision = null,
  dirty = false,
  pending = false,
  paused = false,
  state,
  savedSpeed = 1;
const data = Object.create(null),
  keys = new Set([
    'serverSurvivalSave',
    'serverSurvivalSoundPrefs',
    'game_locale',
    'serverSurvivalTutorialComplete',
    'serverSurvivalCampaignProgress',
    'serverSurvivalToolbarCategory',
    'serverSurvivalFailureBadges',
    'serverSurvivalAchievements',
  ]);
const send = (type, payload) =>
  parent.postMessage(
    {
      protocol: 'akeru.catalog.v1',
      nonce,
      sequence: sequence++,
      type,
      payload,
    },
    shell,
  );
const saves = createSaveClient(send);
window.akeruStorage = Object.freeze({
  getItem: (key) => (keys.has(key) ? (data[key] ?? null) : null),
  setItem(key, value) {
    if (!keys.has(key)) throw Error('Unknown save key');
    value = String(value);
    if (value.length > 200000) throw Error('Save too large');
    data[key] = value;
    dirty = true;
  },
  removeItem(key) {
    if (keys.has(key)) {
      delete data[key];
      dirty = true;
    }
  },
});
function failure() {
  blocked = true;
  document.querySelector('#save-status').textContent =
    'Saving unavailable; previous progress preserved';
}
async function persist() {
  if (!ready || blocked || pending || !dirty) return;
  pending = true;
  dirty = false;
  try {
    const result = await saves.service.write(
      'progress',
      {
        schemaVersion: 1,
        bytes: new TextEncoder().encode(JSON.stringify(data)),
      },
      revision,
    );
    revision = result.revision;
  } catch {
    failure();
  } finally {
    pending = false;
  }
}
let buttons = {},
  axes = {},
  previous = new Set(),
  cursorX = innerWidth / 2,
  cursorY = innerHeight / 2,
  dragging = false,
  downX = 0,
  downY = 0;
const cursor = document.querySelector('#akeru-cursor');
function pointer(type) {
  const target = document.elementFromPoint(cursorX, cursorY);
  target?.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: cursorX,
      clientY: cursorY,
      button: 0,
      buttons: dragging ? 1 : 0,
    }),
  );
  return target;
}

function controller(frame) {
  buttons = frame.buttons ?? {};
  axes = frame.axes ?? {};
  const next = new Set(Object.keys(buttons).filter((k) => buttons[k] > 0.5));
  if (next.has('confirm') && !previous.has('confirm')) {
    dragging = true;
    downX = cursorX;
    downY = cursorY;
    pointer('mousemove');
    pointer('mousedown');
  }
  if (!next.has('confirm') && previous.has('confirm')) {
    dragging = false;
    pointer('mouseup');
    if (Math.hypot(cursorX - downX, cursorY - downY) < 8) {
      const target = document.elementFromPoint(cursorX, cursorY);
      target?.click();
      target?.focus?.();
    }
  }
  if (next.has('cancel') && !previous.has('cancel'))
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
      }),
    );
  previous = next;
}
addEventListener('message', async (event) => {
  const m = event.data;
  if (
    event.source !== parent ||
    event.origin !== shell ||
    m?.protocol !== 'akeru.catalog.v1' ||
    m.nonce !== nonce ||
    !Number.isSafeInteger(m.sequence) ||
    m.sequence <= received
  )
    return;
  received = m.sequence;
  if (m.type === 'save-result') {
    saves.receive(m.payload);
    return;
  }
  if (m.type === 'connect' && !started && m.payload?.sdkVersion === '0.1.0') {
    started = true;
    try {
      const record = await saves.service.read('progress');
      if (record) {
        if (record.schemaVersion !== 1) throw Error('Unsupported save');
        const candidate = JSON.parse(new TextDecoder().decode(record.bytes));
        if (
          !candidate ||
          Array.isArray(candidate) ||
          typeof candidate !== 'object' ||
          Object.entries(candidate).some(
            ([k, v]) =>
              !keys.has(k) || typeof v !== 'string' || v.length > 200000,
          )
        )
          throw Error('Invalid save');
        Object.assign(data, candidate);
        revision = record.revision;
      }
    } catch {
      failure();
    }
    await import('./src--main.js');
    state = (await import('./src--state.js')).STATE;
    await import('./upstream-handlers.js');
    ready = true;
    send('playable', { sdkVersion: '0.1.0' });
  } else if (m.type === 'input' && ready && !paused)
    controller(m.payload ?? {});
  else if (m.type === 'pause' && ready) {
    if (dragging) {
      dragging = false;
      pointer('mouseup');
    }
    paused = true;
    savedSpeed = state.timeScale;
    state.timeScale = 0;
    buttons = {};
    axes = {};
    previous.clear();
    void persist();
  } else if (m.type === 'resume' && ready) {
    paused = false;
    state.timeScale = savedSpeed;
  }
});
let last = 0;
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (ready && !paused) {
    let x = (axes.moveX ?? 0) + (buttons.right ?? 0) - (buttons.left ?? 0),
      y = (axes.moveY ?? 0) + (buttons.down ?? 0) - (buttons.up ?? 0);
    if (Math.abs(x) > 0.15 || Math.abs(y) > 0.15) {
      cursor.style.display = 'block';
      cursorX = Math.max(1, Math.min(innerWidth - 1, cursorX + x * 600 * dt));
      cursorY = Math.max(1, Math.min(innerHeight - 1, cursorY + y * 600 * dt));
      cursor.style.left = cursorX + 'px';
      cursor.style.top = cursorY + 'px';
      pointer('mousemove');
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
setInterval(() => void persist(), 750);
document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-upstream-click]');
  if (!el) return;
  const call = el.getAttribute('data-upstream-click');
  let match;
  if ((match = /^setTool\('([a-z]+)'\)$/.exec(call))) window.setTool(match[1]);
  else if ((match = /^openCampaignBriefing\((\d+)\)$/.exec(call)))
    window.openCampaignBriefing(Number(match[1]));
  else if (call.startsWith('this.parentElement.parentElement.remove()'))
    el.parentElement.parentElement.remove();
});

addEventListener('resize', () => {
  cursorX = Math.max(1, Math.min(innerWidth - 1, cursorX));
  cursorY = Math.max(1, Math.min(innerHeight - 1, cursorY));
  cursor.style.left = cursorX + 'px';
  cursor.style.top = cursorY + 'px';
});
