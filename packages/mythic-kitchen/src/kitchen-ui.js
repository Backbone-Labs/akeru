import { soupGuidance, stationHint } from './kitchen-guidance.js';
export function installKitchenUI(game, facingTile) {
  const root = document.querySelector('#ui-root');
  root.dataset.kitchenInput = 'controller';
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./kitchen-mobile.css', import.meta.url).href;
  document.head.append(css);
  const guide = document.createElement('aside');
  guide.className = 'kitchen-guide';
  guide.setAttribute('aria-label', 'Onion soup recipe guide');
  guide.innerHTML =
    '<span class="recipe-step"></span><div><strong></strong><p></p></div>';
  const prompt = document.createElement('div');
  prompt.className = 'kitchen-action';
  const marker = document.createElement('div');
  marker.className = 'kitchen-target';
  marker.textContent = '▼';
  marker.setAttribute('aria-hidden', 'true');
  game.ui.$s.game.append(guide, prompt, marker);
  let mode = 'controller',
    lastText = '',
    lastTime = 0;
  const select = (value) => {
    if (mode === value) return;
    mode = value;
    root.dataset.kitchenInput = value;
  };
  addEventListener('keydown', (e) => {
    if (e.isTrusted) select('keyboard');
  });
  addEventListener('pointerdown', (e) => {
    if (e.isTrusted) select(e.pointerType === 'touch' ? 'touch' : 'keyboard');
  });
  const format = (s) =>
    s
      .replaceAll('{A}', mode === 'keyboard' ? 'Space' : 'A')
      .replaceAll('{X}', mode === 'keyboard' ? 'Ctrl / J' : 'X');
  const project = (tile, height) => {
    const v = game.renderer.camera.position
      .clone()
      .set(tile.x + 0.5, height, tile.y + 0.5)
      .project(game.renderer.camera);
    return {
      x: ((v.x + 1) * innerWidth) / 2,
      y: ((1 - v.y) * innerHeight) / 2,
    };
  };
  const update = () => {
    const controls = globalThis.akeruCreator?.controls;
    if (
      Object.values(controls?.buttons ?? {}).some((v) => v > 0.25) ||
      Object.values(controls?.axes ?? {}).some((v) => Math.abs(v) > 0.25)
    )
      select('controller');
    if (performance.now() - lastTime < 100) return;
    lastTime = performance.now();
    const state = game.state;
    const visible =
      game.ui.screen === 'game' &&
      state?.phase === 'playing' &&
      !game.paused &&
      !game.ui.isPaused?.() &&
      !game.ui._tutMode;
    const player = state?.players.find(
      (p) =>
        p.id === game.localIds[game.activeChef] ||
        (game.mode === 'online' && p.id === game.localIds[0]),
    );
    const hint = visible ? soupGuidance(state, player, game.level?.id) : null;
    guide.hidden = !hint;
    marker.hidden = !hint?.target;
    if (hint) {
      const text = `${mode}|${hint.step}|${hint.title}|${hint.detail}`;
      if (text !== lastText) {
        guide.querySelector('.recipe-step').textContent =
          `${hint.step}${typeof hint.step === 'number' ? '/6' : ''}`;
        guide.querySelector('strong').textContent = hint.title;
        guide.querySelector('p').textContent = format(hint.detail);
        lastText = text;
      }
      if (hint.target) {
        const point = project(hint.target, 1.7);
        marker.style.left = `${point.x}px`;
        marker.style.top = `${point.y}px`;
      }
    }
    const target = player && facingTile(player);
    const tile =
      target && state?.tiles.find((t) => t.x === target.x && t.y === target.y);
    const action = visible ? stationHint(tile, player) : null;
    prompt.hidden = !action;
    if (action) {
      prompt.textContent = format(action);
      const point = project(tile, 1.25);
      prompt.style.left = `${Math.max(95, Math.min(innerWidth - 95, point.x))}px`;
      prompt.style.top = `${Math.max(85, Math.min(innerHeight - 120, point.y))}px`;
      prompt.classList.toggle(
        'holding',
        player.action === 'chop' || player.action === 'wash',
      );
    }
  };
  return update;
}
