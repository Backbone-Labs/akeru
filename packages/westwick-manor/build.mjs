import { buildCreator, replaceRequired } from '../creator-preview/build.mjs';
buildCreator({
  id: 'westwick-manor',
  title: 'Westwick Manor',
  revision: 'e15edb5f7bf709816f7b58f1fac9c3724aecd6d1',
  patch(path, code) {
    if (path === 'client/main.js') {
      code = replaceRequired(
        code,
        'pv.render?.(dt);',
        'if (c.getClientRects().length) pv.render?.(dt);',
      );
      code = replaceRequired(
        code,
        'seed: this.state.floorSeed ?? this.sim.seed,',
        'seed: this.sim.seed,',
      );
      code = replaceRequired(
        code,
        'return {\n      mx, my, aimX: aim.x, aimY: aim.y,',
        'return globalThis.akeruCreator.readInput({\n      mx, my, aimX: aim.x, aimY: aim.y,',
      );
      code = replaceRequired(
        code,
        "slot, ready: this.any('KeyE'),\n    };",
        "slot, ready: this.any('KeyE'),\n    });",
      );
      code = replaceRequired(
        code,
        'if (this.inGame() && !this.transitioning) {',
        'if (!globalThis.akeruCreator.paused && this.inGame() && !this.transitioning) {',
      );
    }
    if (path === 'client/ui/ui.js')
      code = replaceRequired(
        code,
        "this.scr.title.addEventListener('pointerdown', toMenu);",
        "this.scr.title.addEventListener('click', toMenu);",
      );
    if (path === 'client/ui/tutorial.js') {
      code =
        "import { controllerChapters } from '../controller-tutorial.js';\n" +
        code;
      code = replaceRequired(
        code,
        "    { title: 'Controls',",
        '    ...controllerChapters,\n' + "    { title: 'Controls',",
      );
      code = replaceRequired(
        code,
        "title: 'Controls',",
        "title: 'Keyboard & Mouse',",
      );
      code = replaceRequired(
        code,
        '<span class="kbd">←</span><span class="kbd">→</span> turn the page',
        'LB / RB pages · A next · B close',
      );
    }
    return code;
  },
});
