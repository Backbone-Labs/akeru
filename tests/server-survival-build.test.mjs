import test from 'node:test';
import assert from 'node:assert/strict';
import { transformHtml, flatten } from '../packages/server-survival/build.mjs';
test('Server Survival removes external scripts and moves inline executable content out of HTML', () => {
  const t = transformHtml(
    '<html><head><script src="https://example.com/track.js"></script><script>alert(1)</script></head><body><button style="display:none" onclick="startGame()">Play</button></body></html>',
  );
  assert.ok(!t.html.includes('example.com'));
  assert.ok(!t.html.includes('onclick='));
  assert.ok(!/\sstyle=/.test(t.html));
  assert.match(t.handlers, /addEventListener\("click"/);
  assert.match(t.styles, /display:none/);
  assert.equal(flatten('src/main.js'), 'src--main.js');
});
