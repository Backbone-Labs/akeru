/** Browser smoke test of the title/host bridge with a deterministic engine double. */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(
  new URL('../packages/red-eclipse/src/', import.meta.url),
);
const output = fileURLToPath(
  new URL('../dist/red-eclipse/qa/', import.meta.url),
);
mkdirSync(output, { recursive: true });
let origin;
const fake = `const M=Module;window.calls=[];M._akeru_reset_input=()=>calls.push(['reset']);M._akeru_mute=n=>calls.push(['mute',n]);M._akeru_map_time=()=>1;M._akeru_join=()=>1;M._akeru_player_ready=()=>1;M._akeru_frame_count=()=>1;M._akeru_prepare_and_connect=()=>{};M._akeru_connected=()=>1;M._akeru_reconnect=()=>{};M._akeru_move=(...a)=>calls.push(['move',...a]);M._akeru_look=(...a)=>calls.push(['look',...a]);M._akeru_action=(...a)=>calls.push(['action',...a]);M._akeru_leave=()=>{};M.akeruAudioState=()=> 'running';M.akeruResumeAudio=async()=>true;setTimeout(()=>M.onRuntimeInitialized(),50);`;
const server = createServer((q, r) => {
  const p = q.url.split('?')[0];
  r.setHeader(
    'Content-Type',
    p.endsWith('.js')
      ? 'text/javascript'
      : p.endsWith('.css')
        ? 'text/css'
        : 'text/html',
  );
  if (p === '/')
    return r.end(
      `<iframe sandbox="allow-scripts allow-same-origin allow-pointer-lock" src="/index.html#shell=${origin}&nonce=1234567890abcdef" style="border:0;width:100vw;height:100vh"></iframe><script>let seq=0;window.events=[];window.send=(type,payload)=>document.querySelector('iframe').contentWindow.postMessage({protocol:'akeru.catalog.v1',nonce:'1234567890abcdef',sequence:seq++,type,payload},location.origin);document.querySelector('iframe').onload=()=>send('connect',{sdkVersion:'0.1.0'});onmessage=e=>events.push(e.data);</script>`,
    );
  if (p === '/runtime-config.js')
    return r.end(
      `export const relayUrl='${origin.replace('http:', 'ws:')}/relay';export const allowedShellOrigins=['${origin}'];`,
    );
  if (p === '/rooms' || p === '/rooms/join') {
    r.setHeader('Content-Type', 'application/json');
    return r.end(
      JSON.stringify({ code: 'ABCD'.repeat(5), token: 'a'.repeat(48) }),
    );
  }
  if (p === '/red-eclipse-opt.data') return r.end(Buffer.alloc(8));
  if (p === '/red-eclipse-opt.js') return r.end(fake);
  try {
    if (
      ![
        '/index.html',
        '/style.css',
        '/title.js',
        '/input.js',
        '/rooms.js',
      ].includes(p)
    )
      throw Error('Unknown fixture');
    r.end(readFileSync(root + p.slice(1)));
  } catch {
    r.statusCode = 404;
    r.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1170, height: 600 },
  });
  await page.goto(origin);
  const f = page.frames()[1];
  await f.locator('#room-code').fill('ABCD'.repeat(5));
  await f.locator('#room-join-form button').click();
  await f.locator('#join').waitFor({ state: 'visible' });
  await page.screenshot({ path: output + 'entry.png' });
  await f.locator('#join').click();
  await f.locator('#entry').waitFor({ state: 'hidden' });
  await page.evaluate(() =>
    window.send('input', {
      provider: 'touch',
      connected: true,
      axes: { moveX: 1, lookX: 0.5 },
      buttons: { rightTrigger: 1 },
    }),
  );
  await page.waitForTimeout(200);
  let calls = await f.evaluate(() => window.calls);
  if (!calls.some((c) => c[0] === 'move' && c[1] === 1))
    throw Error('movementmissing');
  if (
    calls.filter((c) => c[0] === 'action' && c[1] === 0 && c[2] === 1)
      .length !== 1
  )
    throw Error('actionnotedge');
  await page.evaluate(() => window.send('pause', {}));
  await page.waitForTimeout(100);
  const count = await f.evaluate(() => window.calls.length);
  await page.waitForTimeout(100);
  if ((await f.evaluate(() => window.calls.length)) !== count)
    throw Error('pauseignored');
  await page.evaluate(() => window.send('action', { id: 1, action: 'audio' }));
  await page.waitForTimeout(50);
  const result = await page.evaluate(() =>
    window.events.find((e) => e.type === 'action-result'),
  );
  if (result.payload.state.audioState !== 'off') throw Error('audio state');
  await page.evaluate(() => window.send('resume', {}));
  await f.evaluate(() => {
    window.Module._akeru_connected = () => 0;
  });
  await f.locator('#join[data-reconnect]').waitFor({ state: 'visible' });
  await f.evaluate(() => {
    window.Module._akeru_reconnect = () => {
      window.Module._akeru_connected = () => 1;
    };
  });
  await f.locator('#join').click();
  await f.locator('#join:not([data-reconnect])').waitFor({ state: 'visible' });
  await f.evaluate(() => {
    window.Module.akeruAudioState = () => 'suspended';
    window.Module.akeruResumeAudio = () => new Promise(() => {});
  });
  await page.evaluate(() => window.send('action', { id: 2, action: 'audio' }));
  await page.waitForFunction(
    () =>
      window.events.some(
        (e) => e.type === 'action-result' && e.payload.id === 2,
      ),
    { timeout: 2000 },
  );
  const blocked = await page.evaluate(() =>
    window.events.find((e) => e.type === 'action-result' && e.payload.id === 2),
  );
  if (blocked.payload.state.audioState !== 'blocked')
    throw Error('Blocked audio must not claim success');
  console.log(
    JSON.stringify({
      ok: true,
      result,
      reconnect: true,
      blockedAudio: true,
      inputCalls: calls.length,
    }),
  );
} finally {
  await browser.close();
  server.close();
}
