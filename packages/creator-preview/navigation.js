const visible = (el) =>
  el.getClientRects().length &&
  !el.closest('[hidden],.hidden,[inert]') &&
  getComputedStyle(el).visibility !== 'hidden';
export function createNavigation(getGame) {
  let lastRoot = null,
    direction = '',
    nextAt = 0;
  const scope = () => {
    const game = getGame();
    if (!game) return null;
    const modal = [
      ...document.querySelectorAll(
        '.modal-layer.is-visible,.modal-veil.active,.screen-tutorial.is-visible',
      ),
    ]
      .filter(visible)
      .at(-1);
    return modal ?? document.querySelector(`[data-screen="${game.ui.screen}"]`);
  };
  const targets = (root) =>
    [
      ...root.querySelectorAll(
        'button:not(:disabled),input:not(:disabled):not([type=hidden]),select,.hero-card,.level-tile:not(.locked)',
      ),
    ]
      .filter(visible)
      .filter((el) => !(el.tagName === 'BUTTON' && el.closest('.hero-card')));
  const focus = (el) => {
    if (!el) return;
    el.tabIndex = 0;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  function update(controls, now) {
    const root = scope();
    if (!root) return;
    const list = targets(root);
    if (!list.length) return;
    if (lastRoot !== root || !list.includes(document.activeElement)) {
      lastRoot = root;
      focus(
        list.find((el) =>
          el.matches(
            '[data-act=new],[data-act=single],.hero-card,.level-tile,[data-act=resume]',
          ),
        ) ?? list[0],
      );
    }
    const b = controls.buttons ?? {},
      a = controls.axes ?? {};
    const x = a.moveX || (b.right || 0) - (b.left || 0),
      y = a.moveY || (b.down || 0) - (b.up || 0);
    const d =
      Math.abs(x) > 0.4
        ? x > 0
          ? 'right'
          : 'left'
        : Math.abs(y) > 0.4
          ? y > 0
            ? 'down'
            : 'up'
          : '';
    if (!d) {
      direction = '';
      return;
    }
    if (d === direction && now < nextAt) return;
    nextAt = now + (d === direction ? 160 : 400);
    direction = d;
    const current = document.activeElement;
    if (current.matches('input[type=range]') && ['left', 'right'].includes(d)) {
      current.value = String(
        Math.max(
          Number(current.min),
          Math.min(
            Number(current.max),
            Number(current.value) +
              (Number(current.step) || 1) * (d === 'left' ? -1 : 1),
          ),
        ),
      );
      current.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const rect = current.getBoundingClientRect(),
      cx = rect.x + rect.width / 2,
      cy = rect.y + rect.height / 2;
    const horizontal = ['left', 'right'].includes(d),
      sign = ['left', 'up'].includes(d) ? -1 : 1;
    const ranked = list
      .filter((el) => el !== current)
      .map((el) => {
        const r = el.getBoundingClientRect(),
          dx = r.x + r.width / 2 - cx,
          dy = r.y + r.height / 2 - cy;
        return {
          el,
          forward: (horizontal ? dx : dy) * sign,
          cross: Math.abs(horizontal ? dy : dx),
        };
      })
      .filter(
        (x) =>
          x.forward >
          Math.max(20, (horizontal ? rect.width : rect.height) * 0.15),
      )
      .sort((a, b) => a.forward + a.cross * 2 - (b.forward + b.cross * 2));
    focus(
      ranked[0]?.el ??
        list[(list.indexOf(current) + sign + list.length) % list.length],
    );
  }
  return {
    update,
    activate() {
      const root = scope();
      if (root && targets(root).includes(document.activeElement))
        document.activeElement.click();
    },
    back() {
      const game = getGame();
      if (game.ui.isTutorialOpen?.() || game.ui._tutMode) {
        game.ui._closeTutorial?.();
        return;
      }
      if (game.ui.isPaused?.()) {
        game.setPaused(false);
        return;
      }
      const root = scope();
      const back = root?.querySelector(
        '[data-act=cancel],[data-act=back],[data-act=leave]',
      );
      if (back) back.click();
      else if (game.ui.screen !== 'menu') game.ui.show('menu');
    },
  };
}
