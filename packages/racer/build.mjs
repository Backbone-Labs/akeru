import { beginBuild, replaceRequired } from '../arcade-preview/build.mjs';
const b = beginBuild('racer');
let common = b.read('common.js').toString();
common = replaceRequired(
  common,
  'storage: window.localStorage || {}',
  'storage: {}',
);
const html = b.read('v4.final.html').toString();
let engine = html.slice(
  html.indexOf('    var fps'),
  html.lastIndexOf('</script>'),
);
engine = replaceRequired(
  engine,
  "var stats          = Game.stats('fps');",
  'var stats = { update() {} };',
);
const begin = engine.indexOf('    Game.run({'),
  end = engine.indexOf('    function reset(options)');
if (begin < 0 || end < begin) throw new Error('Missing racer boot boundary');
engine = engine.slice(0, begin) + engine.slice(end);
engine = engine.slice(0, engine.indexOf("    Dom.on('resolution'"));
engine = replaceRequired(engine, '      refreshTweakUI();', '');
b.put('engine.js', common + '\n' + engine);
b.put('UPSTREAM-LICENSE.txt', b.read('LICENSE'));
b.finish();
