import { buildCreator, replaceRequired } from '../creator-preview/build.mjs';
buildCreator({
  id: 'mythic-kitchen',
  title: 'Mythic Kitchen',
  revision: 'd33b14759a29c30d48d039c4cdcbedb14817741e',
  patch(path, code) {
    if (path === 'client/main.js') {
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
    return code;
  },
});
