import test from 'node:test';
import assert from 'node:assert/strict';
import { transformHtml, flatten } from '../packages/server-survival/build.mjs';
test('Server Survival removes external scripts and moves inline executable content out of HTML', () => {
  const t = transformHtml(
    '<html><head><script src="https://example.com/track.js"></script><script>alert(1)</script></head><body><button style="display:none" onclick="startGame()">Play</button></body></html>',
  );
  assert.equal((t.html.match(/<script /g) ?? []).length, 1);
  assert.match(t.html, /src="adapter.js"/);
  assert.ok(!t.html.includes('onclick='));
  assert.ok(!/\sstyle=/.test(t.html));
  assert.match(t.handlers, /addEventListener\("click"/);
  assert.match(t.styles, /display:none/);
  assert.equal(flatten('src/main.js'), 'src--main.js');
});

test('Server Survival parses mixed-case tags and decodes event attributes once', () => {
  const t = transformHtml(
    '<HTML><HEAD><SCRIPT SRC="/unapproved.js"></SCRIPT></HEAD><BODY><button ONCLICK="show(&quot;&amp;quot;&quot;)" STYLE=display:none>Play</button></BODY></HTML>',
  );
  assert.equal((t.html.match(/<script /g) ?? []).length, 1);
  assert.ok(!t.html.includes('ONCLICK'));
  assert.match(t.handlers, /show\("&quot;"\)/);
  assert.match(t.styles, /display:none/);
});
