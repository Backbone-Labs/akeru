import { buildCreator, replaceRequired } from '../creator-preview/build.mjs';
buildCreator({
  id: 'standstill',
  title: 'Standstill',
  revision: '1ed389c4697df34ae5ee465cec2c338de3306541',
  assets: ['client/assets/enemy.glb'],
  exclude: [
    'client/sim/playtest.js',
    'client/levels/preview.js',
    'client/levels/validate.js',
  ],
  patch(path, code) {
    if (path === 'client/main.js') {
      code = replaceRequired(
        code,
        'this.boot();',
        'this.bootComplete = this.boot();',
      );
      code = replaceRequired(
        code,
        'this.rmbEdge = false; return input;',
        'this.rmbEdge = false; return globalThis.akeruCreator.readInput(input);',
      );
      code = replaceRequired(
        code,
        'const { dx, dy } = this.input.takeLook();',
        'const { dx, dy } = globalThis.akeruCreator.readLook(this.input.takeLook(), dt);',
      );
      code = replaceRequired(
        code,
        '    try {\n      if (this.mode',
        '    if (globalThis.akeruCreator.paused) { this.input.endFrame(); requestAnimationFrame((t) => this.frame(t)); return; }\n    try {\n      if (this.mode',
      );
      // Keep the game's real mouse capture. The host sandbox permits pointer lock.
      code = replaceRequired(
        code,
        'document.pointerLockElement !== this.canvas && this.playing()',
        'document.pointerLockElement !== this.canvas && this.playing() && !globalThis.akeruCreator.paused',
      );
    }
    if (
      path === 'client/render/asset.js' ||
      path === 'client/render/renderer.js'
    )
      code = replaceRequired(
        code,
        "'/assets/enemy.glb'",
        "'./assets--enemy.glb'",
      );
    if (path === 'client/ui/tutorial-art.js') {
      code =
        "import { controllerPages } from '../controller-tutorial.js';\n" + code;
      code = replaceRequired(
        code,
        'export const PAGES = [',
        'export const PAGES = [...controllerPages,',
      );
      code = replaceRequired(
        code,
        "lead: 'Two hands. Ten keys.'",
        "lead: 'Make every action count.'",
      );
      code = replaceRequired(
        code,
        'art: artControls, html: true',
        "art: () => document.querySelector('#ui-root').dataset.inputMode === 'controller' ? controllerPages[0].art() : artControls(), html: true",
      );
    }
    if (path === 'client/ui/tutorial.js') {
      code = replaceRequired(code, '<b>1–7</b> JUMP', '<b>1–9</b> JUMP');
      code = replaceRequired(code, '([1-7])', '([1-9])');
      code = replaceRequired(
        code,
        '<b>← →</b> PAGE',
        '<b>LB / RB</b> PAGE · <b>A</b> NEXT · <b>B</b> BACK · <b>← →</b> PAGE',
      );
    }
    // Native gameplay/UI hints use the same controls as the host input adapter.
    // Keyboard bindings remain available; no keyboard event codes are rewritten.
    if (path === 'client/ui/hud.js') {
      code = replaceRequired(
        code,
        "this.wHint.textContent = '';",
        "this.wHint.textContent = 'RT / RB · LEFT CLICK — PUNCH';",
      );
      code = replaceRequired(
        code,
        "empty ? 'EMPTY — THROW IT' : ''",
        "empty ? 'EMPTY · LT / Y / RIGHT CLICK — THROW' : 'RT / RB · LEFT CLICK — SHOOT'",
      );
      code = replaceRequired(
        code,
        "def.cutsBullets ? 'CUTS BULLETS' : ''",
        "def.cutsBullets ? 'RT / RB · LEFT CLICK — SWING / CUT BULLETS' : 'RT / RB · LEFT CLICK — SWING'",
      );

      code = replaceRequired(code, "text: 'E'", "text: 'X / E'");
      code = replaceRequired(
        code,
        'RMB — THROW',
        'LT / Y · RIGHT CLICK — THROW',
      );
    }
    if (path === 'client/ui/screens.js' || path === 'client/ui/moments.js') {
      for (const [from, to] of [
        ['PRESS ANY KEY', 'PRESS A / ANY KEY TO START'],
        ['MOUSE / VIDEO / AUDIO', 'CONTROLS / VIDEO / AUDIO'],
        ['Mouse sensitivity', 'Look sensitivity'],
        ['<b>WASD</b>', '<b>L STICK / WASD</b>'],
        ['<b>MOUSE</b>', '<b>R STICK / MOUSE</b>'],
        ['<b>E</b> GRAB', '<b>X / E</b> GRAB'],
        ['<b>LMB</b>', '<b>RT / RB / LMB</b>'],
        ['<b>RMB</b>', '<b>LT / Y / RMB</b>'],
        ['<b>SPACE</b>', '<b>A / SPACE</b>'],
        ['<b>ENTER</b>', '<b>A / ENTER</b>'],
        ['<b>ESC</b>', '<b>B / ESC</b>'],
        ['<b>R</b> RETRY', '<b>X / R</b> RETRY'],
        ['<b>L</b> LEVELS', '<b>Y / L</b> LEVELS'],
        ['<b>1–5</b> JUMP', '<b>D-PAD / 1–5</b> NAVIGATE'],
        ["key: 'ENTER'", "key: 'A / ENTER'"],
        ["key: 'ESC'", "key: 'B / ESC'"],
        ["key: 'R'", "key: 'X / R'"],
        ["key: 'L'", "key: 'Y / L'"],
        ["key: 'DEL'", "key: 'LB / DEL'"],
        ["text: 'SPACE'", "text: 'A / SPACE'"],
        ['FROM THE TOP — R', 'FROM THE TOP — X / R'],
      ])
        code = code.replaceAll(from, to);
    }
    if (path === 'client/ui/screens.js' || path === 'client/ui/moments.js')
      code = replaceRequired(code, '07 PAGES', '09 PAGES');
    return code;
  },
});
