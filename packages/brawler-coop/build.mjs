/** Export a pinned, explicitly supplied creator checkout; never fetch it in CI. */
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { applyWebNetwork } from './web-patches.mjs';
const root = new URL('../../', import.meta.url).pathname;
const source = process.argv[2],
  godot = process.env.GODOT,
  template = process.env.GODOT_WEB_TEMPLATE;
const revision = 'cd72436541c41d87c56e8cce29a77c1e45c695cf';
if (!source || !godot || !template)
  throw Error(
    'Pass a creator checkout and set GODOT and GODOT_WEB_TEMPLATE (4.7.2)',
  );
const git = (args) =>
  execFileSync('git', ['-C', source, ...args], {
    maxBuffer: 128 * 1024 * 1024,
  });
if (
  git(['rev-parse', 'HEAD']).toString().trim() !== revision ||
  git(['status', '--porcelain', '--untracked-files=no']).length
)
  throw Error('Expected clean pinned creator source');
if (
  !execFileSync(godot, ['--headless', '--version'])
    .toString()
    .startsWith('4.7.2.')
)
  throw Error('Godot 4.7.2 required');
const work = resolve(root, 'dist/brawler-coop-source'),
  out = resolve(root, 'dist/brawler-coop');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
writeFileSync(resolve(work, 'source.tar'), git(['archive', revision]));
execFileSync('tar', ['-xf', 'source.tar'], { cwd: work });
const patch = (file, from, to) => {
  const path = resolve(work, file),
    text = readFileSync(path, 'utf8');
  if (!text.includes(from)) throw Error('Patch anchor changed: ' + file);
  writeFileSync(path, text.replace(from, to));
};
patch(
  'project.godot',
  '[autoload]',
  '[autoload]\n\nAkeruHost="*res://akeru_host.gd"',
);
writeFileSync(
  resolve(work, 'project.godot'),
  readFileSync(resolve(work, 'project.godot'), 'utf8') +
    '\n[rendering]\n\nrenderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"\n',
);
const relayUrl = process.env.BRAWLER_RELAY_URL ?? '';
if (relayUrl) {
  const endpoint = new URL(relayUrl);
  if (
    endpoint.pathname !== '/relay' ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.username ||
    endpoint.password ||
    !(
      endpoint.protocol === 'wss:' ||
      (endpoint.protocol === 'ws:' && endpoint.hostname === '127.0.0.1')
    )
  )
    throw Error(
      'Expected a secure relay URL (or explicit loopback development server)',
    );
  applyWebNetwork(work, root, relayUrl);
} else {
  patch(
    'ui/main_menu/main_menu.gd',
    '\t_button_start.grab_focus()',
    '\t_button_online.hide()\n\t_button_start.grab_focus()',
  );
}
// The shipped tutorial describes the web adapter, not the upstream joypad map.
patch(
  'ui/how_to_play/how_to_play.tscn',
  'Left Analog Stick  - Move',
  'Left stick / D-pad - Move',
);
patch(
  'ui/how_to_play/how_to_play.tscn',
  'X (Xbox), Square (Sony) - Attack',
  'X / RT - Attack',
);
patch(
  'ui/how_to_play/how_to_play.tscn',
  'A (Xbox), X (Sony) - Jump',
  'A - Jump / Confirm',
);
patch(
  'ui/how_to_play/how_to_play.tscn',
  'Menu, Options - Pause Menu',
  'Backbone button - Game menu',
);
// Runtime scripts must not depend on EditorPlugin, which is absent in exports.
const plugin = readFileSync(
  resolve(work, 'addons/quiver.beat_em_up/quiver_beat_em_up_plugin.gd'),
  'utf8',
);
const constants = new Map(
  [...plugin.matchAll(/^const (SETTINGS_\w+) = ("[^"\n]+")/gm)].map((m) => [
    m[1],
    m[2],
  ]),
);
function fixRuntime(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name === '.godot') continue;
    const path = resolve(dir, item.name);
    if (item.isDirectory()) fixRuntime(path);
    else if (item.name.endsWith('.gd')) {
      const source = readFileSync(path, 'utf8');
      writeFileSync(
        path,
        source.replace(/QuiverBeatEmUpPlugin\.(SETTINGS_\w+)/g, (_, key) => {
          if (!constants.has(key)) throw Error('Unknown editor constant');
          return constants.get(key);
        }),
      );
    }
  }
}
fixRuntime(work);
copyFileSync(
  resolve(root, 'packages/brawler-coop/src/host.gd'),
  resolve(work, 'akeru_host.gd'),
);
writeFileSync(
  resolve(work, 'export_presets.cfg'),
  `[preset.0]\nname="Akeru Web"\nplatform="Web"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\nexport_path=""\n[preset.0.options]\ncustom_template/release=${JSON.stringify(template)}\nvariant/extensions_support=false\nvariant/thread_support=false\nhtml/canvas_resize_policy=2\nhtml/focus_canvas_on_start=true\nprogressive_web_app/enabled=false\nhtml/export_icon=false\n`,
);
execFileSync(godot, ['--headless', '--path', work, '--editor', '--import'], {
  stdio: 'inherit',
  timeout: 180000,
});
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync(
  godot,
  [
    '--headless',
    '--path',
    work,
    '--export-release',
    'Akeru Web',
    resolve(out, 'game.html'),
  ],
  { stdio: 'inherit', timeout: 180000 },
);
for (const f of readdirSync(out))
  if (f.endsWith('.html') || f.endsWith('.png')) rmSync(resolve(out, f));
for (const f of ['index.html', 'style.css', 'input.js', 'title.js'])
  copyFileSync(resolve(root, 'packages/brawler-coop/src', f), resolve(out, f));
writeFileSync(
  resolve(work, 'engine_notices.gd'),
  `extends SceneTree
func _init():
\tprint(Engine.get_license_text())
\tprint(JSON.stringify(Engine.get_copyright_info(), "\\t"))
\tprint(JSON.stringify(Engine.get_license_info(), "\\t"))
\tquit()
`,
);
writeFileSync(
  resolve(out, 'LICENSES.txt'),
  [
    'Brawler Co-op, derived from Downtown Beatdown by Quiver (https://quiver.dev).',
    'Web adaptation: Akeru. Game code: MIT. Art, music and audio: CC-BY 4.0. Changes: web export, host input/audio/pause, browser networking.',
    readFileSync(resolve(work, 'LICENSE.txt'), 'utf8'),
    readFileSync(resolve(work, 'LICENSE_ASSETS.txt'), 'utf8'),
    'Godot Engine: MIT. Engine and third-party notices: https://godotengine.org/license/',
    execFileSync(
      godot,
      ['--headless', '--script', resolve(work, 'engine_notices.gd')],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000 },
    ),
  ].join('\n\n'),
);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const sourceUrl = git(['remote', 'get-url', 'origin'])
  .toString()
  .trim()
  .replace(/\.git$/, '');
writeFileSync(
  resolve(out, 'build-record.json'),
  JSON.stringify(
    {
      id: 'brawler-coop',
      revision,
      sourceUrl,
      relayUrl,
      godot: '4.7.2',
      templateSha256: hash(readFileSync(template)),
      artifacts: readdirSync(out)
        .sort()
        .map((path) => ({
          path,
          sha256: hash(readFileSync(resolve(out, path))),
        })),
    },
    null,
    2,
  ),
);
