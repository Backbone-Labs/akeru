import { icon, cover, cascadeIn, closeConsoleDialog } from './console-ui.js';

const GRAPHICS = Object.freeze({
  dom: 'HTML',
  canvas2d: 'Canvas 2D',
  webgl1: 'WebGL',
  webgl2: 'WebGL 2',
  webgpu: 'WebGPU',
});
const SLOT_NAMES = Object.freeze({
  progress: 'Auto-save',
  snapshot: 'Manual snapshot',
  paused: 'Pause checkpoint',
  position: 'Saved position',
});
const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');
export function slotLabel(slot) {
  if (Object.hasOwn(SLOT_NAMES, slot)) return SLOT_NAMES[slot];
  const words = String(slot)
    .replace(/[._-]+/g, ' ')
    .trim();
  return words ? cap(words) : 'Save';
}
export function formatBytes(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576)
    return `${Math.max(0.1, Math.round(bytes / 102.4) / 10)} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}
export function sourceLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'github.com'
      ? 'View source on GitHub'
      : `View source on ${host}`;
  } catch {
    return 'View source';
  }
}
const el = (tag, cls, text) => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
};
function external(label, url) {
  const link = el('a', 'sheet-link');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(el('span', '', label.replace(/\s*↗\s*$/u, '')));
  link.insertAdjacentHTML('beforeend', icon('external'));
  return link;
}
function list(items) {
  const ul = el('ul', 'sheet-list');
  for (const item of items) ul.append(el('li', '', item));
  return ul;
}
function facts(rows) {
  const dl = el('dl', 'sheet-facts');
  for (const [label, value, title] of rows) {
    if (!value) continue;
    const row = el('div');
    const dd = el('dd', '', value);
    if (title) dd.title = title;
    row.append(el('dt', '', label), dd);
    dl.append(row);
  }
  return dl;
}
const TEMPLATE = `<div class="sheet-frame">
  <div class="sheet-ambient" aria-hidden="true"></div>
  <button type="button" class="sheet-close" data-sheet-close><kbd class="glyph-b" aria-hidden="true">B</kbd><span>Back</span><span class="visually-hidden"> — close game details</span></button>
  <div class="sheet-scroll">
    <section class="sheet-hero">
      <div class="sheet-art"></div>
      <div class="sheet-intro">
        <p class="sheet-kicker"><span class="sheet-category"></span><span class="sheet-creator"></span></p>
        <h1 id="game-sheet-title"></h1>
        <p class="sheet-summary"></p>
        <div class="sheet-actions"><button type="button" id="play-button" class="sheet-play" data-console-primary></button><button type="button" class="sheet-library"></button></div>
        <p id="play-note" class="sheet-note"></p>
        <ul class="sheet-support" aria-label="Ways to play"><li>${icon('controller')}Controller</li><li>${icon('touch')}Touch</li><li>${icon('save')}Guest saves</li></ul>
      </div>
    </section>
    <div class="sheet-grid">
      <div class="sheet-column">
      <section class="sheet-card sheet-about" data-nav-stop tabindex="-1" aria-labelledby="sheet-about-title"><h2 id="sheet-about-title">${icon('info')}About this game</h2><div data-slot="about"></div></section>
      <section class="sheet-card sheet-controls" data-nav-stop tabindex="-1" aria-labelledby="sheet-controls-title"><h2 id="sheet-controls-title">${icon('controller')}How to play</h2><div data-slot="controls"></div></section>
      <section class="sheet-card sheet-privacy" data-nav-stop tabindex="-1" aria-labelledby="sheet-privacy-title"><h2 id="sheet-privacy-title">${icon('shield')}Privacy</h2><div data-slot="privacy"></div></section>
      </div>
      <div class="sheet-column">
      <section class="sheet-card sheet-saves" aria-labelledby="sheet-saves-title"><h2 id="sheet-saves-title">${icon('save')}Saves on this device</h2><p class="sheet-save-status"></p><ul class="sheet-slots"></ul><div class="sheet-save-actions"><button type="button" class="sheet-button" data-export>Export saves</button><button type="button" class="sheet-button sheet-danger" data-reset>Reset saves</button></div><p class="sheet-feedback" role="status"></p></section>
      <section class="sheet-card sheet-source" aria-labelledby="sheet-source-title"><h2 id="sheet-source-title">${icon('code')}Open source &amp; credits</h2><div data-slot="source"></div></section>
      </div>
    </div>
  </div>
</div>`;

/** The detail sheet shares /g/:id with the old page. Launches still go through the host. */
export function createGameSheet(
  host,
  { onPlay, onClose, savesFor, library, restoreFocus } = {},
) {
  let dialog = null,
    entry = null,
    origin = null,
    notify = true,
    saveToken = 0;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = (selector) => dialog.querySelector(selector);
  const background = () =>
    [...host.children].filter(
      (child) => child !== dialog && child.tagName !== 'DIALOG',
    );

  function build() {
    dialog = el('dialog', 'game-sheet');
    dialog.dataset.consoleClose = '';
    dialog.setAttribute('aria-labelledby', 'game-sheet-title');
    dialog.innerHTML = TEMPLATE;
    dialog.addEventListener('console-close', () => close());
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener('close', closed);
    q('[data-sheet-close]').onclick = () => close();
    q('[data-export]').onclick = exportSaves;
    q('[data-reset]').onclick = resetSaves;
    host.append(dialog);
  }

  function renderPlay() {
    const play = q('#play-button');
    const paused = entry.availability === 'paused';
    play.disabled = paused;
    play.innerHTML = `<kbd class="glyph-a" aria-hidden="true">A</kbd><span>${paused ? 'Temporarily unavailable' : 'Play now'}</span>`;
    play.onclick = paused ? null : () => onPlay?.(entry);
    q('#play-note').textContent = paused
      ? 'This game is taking a break. Please check back later.'
      : 'Free guest play · No account or membership needed';
  }
  function renderLibraryButton() {
    const button = q('.sheet-library');
    const saved = library?.has(entry.manifest.id) ?? false;
    button.dataset.saved = String(saved);
    button.innerHTML = saved
      ? `${icon('check')}<span>In your library</span><span class="visually-hidden">, select to remove</span>`
      : `${icon('plus')}<span>Add to library</span>`;
    button.title = saved ? 'Remove from library' : 'Add to library';
    button.hidden = !library;
  }
  function fill(next) {
    entry = next;
    const m = next.manifest,
      meta = next.metadata;
    q('.sheet-art').replaceChildren(cover(next, { label: false }));
    q('.sheet-ambient').replaceChildren(cover(next, { label: false }));
    q('.sheet-category').textContent = cap(meta.category);
    q('.sheet-creator').textContent = `By ${meta.creator}`;
    q('#game-sheet-title').textContent = m.title;
    q('.sheet-summary').textContent = meta.summary;
    renderPlay();
    renderLibraryButton();
    q('.sheet-library').onclick = () => {
      if (!library) return;
      const saved = library.toggle(entry.manifest.id);
      renderLibraryButton();
      if (!reduced())
        q('.sheet-library').animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.06)' },
            { transform: 'scale(1)' },
          ],
          { duration: 260, easing: 'ease-out' },
        );
      q('.sheet-feedback').textContent = saved
        ? `${entry.manifest.title} is in your library.`
        : `${entry.manifest.title} was removed from your library.`;
    };
    const about = q('[data-slot="about"]');
    about.replaceChildren(
      el('p', 'sheet-description', meta.description),
      facts([
        ['Created by', meta.creator],
        ['Category', cap(meta.category)],
        ['Content', meta.ageLabel],
        ['Version', m.version],
        ['Graphics', GRAPHICS[m.runtime?.graphics?.preferred]],
        ['Access', 'Free · no membership'],
      ]),
    );
    const controls = q('[data-slot="controls"]');
    controls.replaceChildren(
      el('h3', '', 'Controller'),
      list(meta.controls.controller),
      el('h3', '', 'Touch'),
      list(meta.controls.touch),
    );
    const source = m.provenance?.source ?? {};
    const rights =
      source.rightsStatus === 'documented'
        ? 'Documented'
        : source.rightsStatus === 'unknown'
          ? 'Unknown'
          : null;
    const links = el('div', 'sheet-links');
    if (source.url) links.append(external(sourceLabel(source.url), source.url));
    for (const notice of meta.notices)
      links.append(external(notice.label, notice.url));
    q('[data-slot="source"]').replaceChildren(
      facts([
        ['Created by', meta.creator],
        ['License', source.license],
        ['Rights', rights],
        [
          'Revision',
          source.revision ? source.revision.slice(0, 12) : null,
          source.revision,
        ],
      ]),
      links,
    );
    q('[data-slot="privacy"]').replaceChildren(list(meta.privacy));
    q('.sheet-feedback').textContent = '';
    void refreshSaves();
  }

  const saveSet = () => {
    try {
      return savesFor?.(entry) ?? null;
    } catch {
      return null;
    }
  };
  function setSaveButtons(enabled) {
    for (const button of dialog.querySelectorAll('.sheet-saves button'))
      button.disabled = !enabled;
  }
  async function refreshSaves() {
    const token = ++saveToken;
    const statusLine = q('.sheet-save-status');
    const slots = q('.sheet-slots');
    const saves = saveSet();
    statusLine.textContent = 'Checking saves on this device…';
    slots.replaceChildren();
    if (!saves) {
      statusLine.textContent =
        'Saving is unavailable here. You can still play, but progress may be lost.';
      setSaveButtons(false);
      return;
    }
    try {
      const status = await saves.status();
      if (token !== saveToken || !dialog) return;
      if (status.local !== 'available') {
        statusLine.textContent =
          'Saving is unavailable in this browser. You can still play, but progress may be lost.';
        setSaveButtons(false);
        return;
      }
      const records = status.quota.usedSlots ? await saves.list() : [];
      if (token !== saveToken || !dialog) return;
      setSaveButtons(true);
      statusLine.textContent = records.length
        ? `${records.length === 1 ? 'One save' : `${records.length} saves`} in this browser. Clearing browser data can remove them. Account sync is not connected.`
        : 'No saves yet. Progress appears here once the game saves in this browser. Account sync is not connected.';
      for (const record of records) slots.append(slotRow(saves, record));
      q('[data-export]').disabled = !records.length;
    } catch {
      if (token !== saveToken || !dialog) return;
      setSaveButtons(true);
      statusLine.textContent = 'Couldn’t read saves on this device.';
      showSaveError();
    }
  }
  function slotRow(saves, record) {
    const row = el('li', 'sheet-slot');
    row.insertAdjacentHTML(
      'afterbegin',
      `<span class="sheet-slot-mark">${icon('save')}</span>`,
    );
    const copy = el('span', 'sheet-slot-copy');
    const size = formatBytes(record.bytes.byteLength);
    copy.append(
      el('strong', '', slotLabel(record.slot)),
      el('small', '', size ? `${size} · ${record.slot}` : record.slot),
    );
    const remove = el('button', 'sheet-slot-delete');
    remove.type = 'button';
    const label = slotLabel(record.slot);
    const idle = () => {
      delete remove.dataset.confirm;
      remove.innerHTML = `${icon('trash')}<span>Delete</span>`;
      remove.setAttribute('aria-label', `Delete ${label}`);
    };
    idle();
    remove.onclick = async () => {
      if (remove.dataset.confirm !== 'true') {
        remove.dataset.confirm = 'true';
        remove.innerHTML = `${icon('trash')}<span>Confirm delete</span>`;
        remove.setAttribute('aria-label', `Confirm delete ${label}`);
        q('.sheet-feedback').textContent =
          `This deletes only the ${label.toLowerCase()} for this game. Export first if you want to keep it.`;
        return;
      }
      remove.disabled = true;
      try {
        await saves.remove(record.slot, record.revision);
        q('.sheet-feedback').textContent =
          `${label} deleted from this browser.`;
        await refreshSaves();
      } catch {
        showSaveError();
        remove.disabled = false;
        idle();
      }
    };
    row.append(copy, remove);
    return row;
  }
  function showSaveError() {
    q('.sheet-feedback').textContent =
      'Couldn’t access saves. Existing data has not been intentionally replaced. Try again or export before resetting.';
  }
  async function exportSaves() {
    const saves = saveSet();
    const button = q('[data-export]');
    if (!saves) return;
    button.disabled = true;
    try {
      const data = await saves.exportData();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: 'application/json' }),
      );
      const anchor = el('a');
      anchor.href = url;
      anchor.download = `${entry.manifest.id}-saves.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      q('.sheet-feedback').textContent =
        'Save export downloaded. Keep it private; it contains your game progress.';
    } catch {
      showSaveError();
    } finally {
      button.disabled = false;
    }
  }
  async function resetSaves() {
    const saves = saveSet();
    const button = q('[data-reset]');
    if (!saves) return;
    if (button.dataset.confirm !== 'true') {
      button.dataset.confirm = 'true';
      button.textContent = 'Confirm reset';
      q('.sheet-feedback').textContent =
        'This removes only this game’s local saves. Export first if you want to keep them.';
      return;
    }
    button.disabled = true;
    try {
      await saves.reset();
      q('.sheet-feedback').textContent =
        'Local saves for this game have been reset.';
      await refreshSaves();
    } catch {
      showSaveError();
    } finally {
      delete button.dataset.confirm;
      button.textContent = 'Reset saves';
      button.disabled = false;
    }
  }

  function originRect() {
    if (!origin?.isConnected) return null;
    const rect = origin.getBoundingClientRect();
    return rect.width > 0 &&
      rect.bottom > 0 &&
      rect.top < innerHeight &&
      rect.right > 0 &&
      rect.left < innerWidth
      ? rect
      : null;
  }
  function clipFrom(rect, frame) {
    const to = frame.getBoundingClientRect();
    const top = Math.max(0, rect.top - to.top),
      right = Math.max(0, to.right - rect.right),
      bottom = Math.max(0, to.bottom - rect.bottom),
      left = Math.max(0, rect.left - to.left);
    return `inset(${top}px ${right}px ${bottom}px ${left}px round 18px)`;
  }
  function open(next, from = null) {
    if (!dialog) build();
    if (dialog.open && dialog.dataset.closing !== 'true') {
      fill(next);
      return;
    }
    if (dialog.open) {
      notify = false;
      dialog.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      dialog.close();
    }
    delete dialog.dataset.closing;
    dialog.classList.remove('is-closing');
    origin = from;
    notify = true;
    fill(next);
    for (const child of background()) child.setAttribute('aria-hidden', 'true');
    dialog.showModal();
    q('.sheet-scroll').scrollTop = 0;
    const play = q('#play-button');
    (play.disabled ? q('[data-sheet-close]') : play).focus({
      preventScroll: true,
    });
    if (reduced()) return;
    const frame = q('.sheet-frame');
    const rect = originRect();
    frame.animate(
      rect
        ? [
            { clipPath: clipFrom(rect, frame), opacity: 0.4 },
            { clipPath: 'inset(0px 0px 0px 0px round 28px)', opacity: 1 },
          ]
        : [
            { transform: 'translateY(32px) scale(.98)', opacity: 0 },
            { transform: 'translateY(0) scale(1)', opacity: 1 },
          ],
      { duration: rect ? 520 : 380, easing: 'cubic-bezier(.2,.86,.24,1)' },
    );
    cascadeIn(dialog.querySelectorAll('.sheet-intro > *, .sheet-card'), {
      y: 18,
      step: 45,
      start: 120,
      max: 9,
    });
  }
  function close({ fromRoute = false } = {}) {
    if (!dialog?.open || dialog.dataset.closing === 'true') return;
    notify = !fromRoute;
    const frame = q('.sheet-frame');
    const rect = originRect();
    dialog.classList.add('is-closing');
    closeConsoleDialog(
      dialog,
      rect
        ? [
            { clipPath: 'inset(0px 0px 0px 0px round 28px)', opacity: 1 },
            { clipPath: clipFrom(rect, frame), opacity: 0 },
          ]
        : [
            { transform: 'translateY(0) scale(1)', opacity: 1 },
            { transform: 'translateY(28px) scale(.98)', opacity: 0 },
          ],
    );
  }
  function closed() {
    // A close queued before a quick reopen must not tear down the new sheet.
    if (!dialog || dialog.open) return;
    delete dialog.dataset.closing;
    dialog.classList.remove('is-closing');
    dialog.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    for (const child of background()) child.removeAttribute('aria-hidden');
    saveToken++;
    const closedEntry = entry;
    if (origin?.isConnected) origin.focus({ preventScroll: true });
    else restoreFocus?.(closedEntry);
    const shouldNotify = notify;
    notify = true;
    if (shouldNotify) onClose?.(closedEntry);
  }
  return Object.freeze({
    open,
    close,
    get isOpen() {
      return Boolean(dialog?.open);
    },
    get entry() {
      return dialog?.open ? entry : null;
    },
    dispose() {
      if (!dialog) return;
      notify = false;
      saveToken++;
      const current = dialog;
      dialog = null;
      for (const child of [...host.children])
        if (child !== current) child.removeAttribute('aria-hidden');
      if (current.open) current.close();
      current.remove();
    },
  });
}
