import { beginBuild, replaceRequired } from '../arcade-preview/build.mjs';
const b = beginBuild('astray');
let engine = b.read('index.html').toString();
engine = engine.slice(
  engine.indexOf('            var camera'),
  engine.indexOf('            jQuery.fn.centerv'),
);
engine = engine
  .replaceAll("'/ball.png'", "'ball.png'")
  .replaceAll("'/concrete.png'", "'concrete.png'")
  .replaceAll("'/brick.png'", "'brick.png'");
engine = replaceRequired(
  engine,
  "$('#level').html('Level ' + level);",
  "document.querySelector('#level').textContent = 'Level ' + level;",
);
engine = replaceRequired(
  engine,
  '                requestAnimationFrame(gameLoop);',
  '',
);
engine = replaceRequired(
  engine,
  'mazeDimension += 2;',
  'mazeDimension = Math.min(51, mazeDimension + 2);',
);
const chunks = ['Box2dWeb.min.js', 'Three.js', 'maze.js'].map((p) =>
  b.read(p).toString(),
);
b.put('engine.js', chunks.join('\n;\n') + '\n' + engine);
for (const p of ['ball.png', 'brick.png', 'concrete.png']) b.put(p, b.read(p));
b.put('UPSTREAM-LICENSE.txt', b.read('License.md'));
b.finish();
