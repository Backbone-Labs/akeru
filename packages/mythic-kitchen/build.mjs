import { buildCreator, replaceRequired } from '../creator-preview/build.mjs';
buildCreator({
  id: 'mythic-kitchen',
  title: 'Mythic Kitchen',
  revision: 'd33b14759a29c30d48d039c4cdcbedb14817741e',
  patch(path, code) {
    if (path === 'client/main.js') {
      code = "import { installKitchenUI } from './kitchen-ui.js';\n" + code;
      code = replaceRequired(
        code,
        'import { Simulation }',
        'import { Simulation, facingTile }',
      );
      code = replaceRequired(
        code,
        'this.resize();\n',
        'this.resize();\n    this.updateKitchenUI = installKitchenUI(this, facingTile);\n',
      );
      code = replaceRequired(
        code,
        'if (!this.inGame()) this.previews.render(dt);',
        'this.updateKitchenUI?.();\n    if (!this.inGame()) this.previews.render(dt);',
      );
      code = replaceRequired(
        code,
        'if (this.net) return this.net;',
        'if (this.net) { await this.net.connect(); return this.net; }',
      );
      code = replaceRequired(
        code,
        'pv.render?.(dt);',
        'if (canvas.getClientRects().length) pv.render?.(dt);',
      );
      code = replaceRequired(
        code,
        'return { mx, my, interact: this.any(map.interact), action: this.any(map.action), dash: this.any(map.dash) };',
        'return globalThis.akeruCreator.readInput({ mx, my, interact: this.any(map.interact), action: this.any(map.action), dash: this.any(map.dash) }, map === P1_KEYS);',
      );
      code = replaceRequired(
        code,
        'pressed(code) { return this.pressedThisFrame.has(code); }',
        "pressed(code) { return this.pressedThisFrame.has(code) || (code === 'Tab' && globalThis.akeruCreator.takeSwap()); }",
      );
      code = replaceRequired(
        code,
        "if (this.inGame() || this.mode === 'online') this.tick(dt);",
        "if (!globalThis.akeruCreator.paused && (this.inGame() || this.mode === 'online')) this.tick(dt);",
      );
    }
    if (path === 'client/render/renderer.js') {
      code = replaceRequired(
        code,
        'const margin = { l: 0.04, r: 0.04, t: 0.26, b: 0.04 };',
        'const margin = { l: 0.08, r: 0.08, t: Math.min(.55, 150 / this._h), b: Math.min(.65, (this.level?.id === "castle-1" ? 210 : 100) / this._h) };',
      );
    }
    if (path === 'client/ui/ui.js') {
      code = replaceRequired(
        code,
        "${I.keyboardKey('W')}${I.keyboardKey('A')}${I.keyboardKey('S')}${I.keyboardKey('D')}",
        "${I.keyboardKey('L STICK')}",
      );
      for (const [from, to] of [
        ['Space', 'A'],
        ['Ctrl', 'X / RT'],
        ['Shift', 'B'],
        ['Tab', 'Y'],
        ['Esc', 'Menu'],
      ]) {
        code = replaceRequired(
          code,
          `I.keyboardKey('${from}')`,
          `I.keyboardKey('${to}')`,
        );
      }
      code = replaceRequired(code, 'Chop / Wash', 'Hold to chop / wash');
      code = replaceRequired(
        code,
        '<span class="key">Tab</span>',
        '<span class="key">Y</span>',
      );
    }
    if (path === 'client/net/client.js') {
      code = "import { multiplayerUrl } from '../network-config.js';\n" + code;
      code = replaceRequired(
        code,
        "return proto + location.host + '/ws';",
        "return multiplayerUrl || proto + location.host + '/ws';",
      );
    }
    if (path === 'client/ui/tutorial.js') {
      code =
        "import { controllerSteps, tutorialStyles } from '../controller-tutorial.js';\n" +
        code;
      code = replaceRequired(
        code,
        '<style>${css}</style>',
        '${tutorialStyles(css)}',
      );
      code = replaceRequired(
        code,
        '<style>${css}</style>',
        '${tutorialStyles(css)}',
      );
      code = replaceRequired(
        code,
        "    {\n      id: 'controls',",
        '    ...controllerSteps,\n' + "    {\n      id: 'controls',",
      );
      code = replaceRequired(
        code,
        "title: 'CONTROLS',",
        "title: 'KEYBOARD CONTROLS',",
      );
      code = replaceRequired(
        code,
        '<div class="tut-foot">',
        '<div class="creator-tutorial-nav">LB back · A / RB next · B close</div><div class="tut-foot">',
      );
    }
    return code;
  },
});
