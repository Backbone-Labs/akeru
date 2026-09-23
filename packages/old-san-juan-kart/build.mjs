import { readFileSync } from 'node:fs';
import { dirname, resolve, relative, posix } from 'node:path';
import { beginBuild, replaceRequired, root } from '../arcade-preview/build.mjs';
const b = beginBuild('old-san-juan-kart');
const flat = (s) => s.replaceAll('/', '--');
const threeRoot = resolve(root, 'node_modules/three');
const visited = new Set();
function three(path) {
  path = resolve(path);
  if (!path.startsWith(threeRoot + '/'))
    throw Error('Dependency escaped Three.js');
  const name = 'three--' + flat(relative(threeRoot, path));
  if (visited.has(path)) return name;
  visited.add(path);
  const content = readFileSync(path, 'utf8').replace(
    /(from\s*|import\s*)['"]([^'"]+)['"]/g,
    (match, prefix, spec) => {
      const target =
        spec === 'three'
          ? resolve(threeRoot, 'build/three.module.js')
          : spec.startsWith('three/addons/')
            ? resolve(threeRoot, 'examples/jsm', spec.slice(13))
            : resolve(dirname(path), spec);
      return `${prefix}'./${three(target)}'`;
    },
  );
  b.put(name, content);
  return name;
}
for (const entry of b.inventory.files.filter((f) =>
  /^src\/.*\.js$/.test(f.path),
)) {
  let code = b.read(entry.path).toString();
  if (entry.path === 'src/ui/hud.js')
    code = code.replaceAll('style="', 'data-akeru-style="');
  if (entry.path === 'src/core/device.js')
    code = code.replace('smaa: true', 'smaa: false');
  if (entry.path === 'src/core/input.js') {
    const start = code.indexOf('    // gamepad');
    const end = code.indexOf('    // touch', start);
    if (start < 0 || end < 0) throw Error('Input boundary changed');
    code =
      code.slice(0, start) +
      `    const host = globalThis.akeruKart.controls;
    throttle = Math.max(throttle, host.throttle);
    brake = Math.max(brake, host.brake);
    steer += host.steer;
    drift ||= host.drift;
    item ||= host.item;
` +
      code.slice(end);
  }
  if (entry.path === 'src/core/audio.js')
    code = code.replaceAll(
      'globalThis.localStorage',
      'globalThis.akeruKart.storage',
    );
  if (entry.path === 'src/core/engine.js')
    code = replaceRequired(
      code,
      'const dt = Math.min(this._clock.getDelta(), 0.1);',
      'const elapsed = this._clock.getDelta();\n      if (!globalThis.akeruKart.active()) return;\n      const dt = Math.min(elapsed, 0.1);',
    );
  if (entry.path === 'src/main.js') {
    const start = code.indexOf('hud.showTitle(() => {');
    const end = code.indexOf(
      '/* --------------------------- simulation',
      start,
    );
    if (start < 0 || end < 0) throw Error('Menu boundary changed');
    code =
      code.slice(0, start) +
      `globalThis.akeruKart.race = () => {
      hud.el.title.classList.add('hidden');
      hud.el.results.classList.add('hidden');
      startRace(0);
    };\n` +
      code.slice(end);
  }
  code = code.replace(
    /(from\s*|import\s*)['"]([^'"]+)['"]/g,
    (match, prefix, spec) => {
      let name;
      if (spec === 'three')
        name = three(resolve(threeRoot, 'build/three.module.js'));
      else if (spec.startsWith('three/'))
        name = three(resolve(threeRoot, spec.slice(6)));
      else if (spec.startsWith('.'))
        name = flat(
          posix.normalize(posix.join(posix.dirname(entry.path), spec)),
        );
      else throw Error('Unknown import: ' + spec);
      return `${prefix}'./${name}'`;
    },
  );
  b.put(flat(entry.path), code);
}
b.put('game.css', b.read('src/ui/style.css'));
b.put('UPSTREAM-LICENSE.txt', b.read('LICENSE'));
b.put('THREE-LICENSE.txt', readFileSync(resolve(threeRoot, 'LICENSE')));
b.finish();
