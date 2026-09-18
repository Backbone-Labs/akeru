import { beginBuild, replaceRequired } from '../arcade-preview/build.mjs';
const b = beginBuild('breaklock');
b.put(
  'engine.js',
  replaceRequired(
    b.read('src/models/pattern.js').toString(),
    'export default Pattern',
    'window.Pattern = Pattern;',
  ),
);
b.put('UPSTREAM-LICENSE.txt', b.read('LICENSE'));
b.finish();
