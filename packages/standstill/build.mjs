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
      const start = code.indexOf('  lock() {'),
        end = code.indexOf('  onLockChange()');
      if (start < 0 || end <= start)
        throw new Error('Pointer-lock patch anchor changed');
      code =
        code.slice(0, start) +
        '  lock() {} // Host controller/touch look and mouse drag do not require pointer lock.\n' +
        code.slice(end);
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
    if (path === 'client/ui/screens.js' || path === 'client/ui/moments.js')
      code = replaceRequired(code, '07 PAGES', '09 PAGES');
    return code;
  },
});
