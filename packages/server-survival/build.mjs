/** Reproducible local evaluation build. No upstream bytes are checked in. */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySource } from '../puzzle-preview/build.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const flatten = (path) => path.replaceAll('/', '--');
export function transformHtml(html) {
  const handlers = [],
    styles = [];
  html = html
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<meta[^>]*(?:og:|twitter:)[^>]*>/g, '')
    .replace(/<link[^>]*rel="icon"[^>]*>/g, '');
  html = html.replace(/\sstyle="([^"]*)"/g, (_, css) => {
    const id = styles.length;
    styles.push(`[data-inline-style="${id}"]{${css}}`);
    return ` data-inline-style="${id}"`;
  });
  html = html.replace(/\son([a-z]+)="([^"]*)"/g, (_, event, body) => {
    const id = handlers.length;
    handlers.push(
      `document.querySelector('[data-handler-${id}]').addEventListener(${JSON.stringify(event)},function(event){${body.replaceAll('&amp;', '&').replaceAll('&quot;', '"')}});`,
    );
    return ` data-handler-${id}`;
  });
  html = html.replace(
    '</head>',
    '<link rel="stylesheet" href="utilities.css"><link rel="stylesheet" href="adapter.css"></head>',
  );
  html = html.replace(
    '</body>',
    '<div id="akeru-cursor" aria-hidden="true"></div><div id="akeru-help">D-pad / stick: move cursor · A: select / hold to drag · B: back <span id="save-status">Local guest save</span></div><script type="module" src="adapter.js"></script></body>',
  );
  return { html, handlers: handlers.join('\n'), styles: styles.join('\n') };
}
export function buildServerSurvival() {
  const inventory = JSON.parse(
      readFileSync(
        resolve(root, 'compliance/source-inventories/server-survival.json'),
      ),
    ),
    source = resolve(root, 'dist/external/server-survival'),
    out = resolve(root, 'dist/server-survival');
  mkdirSync(dirname(source), { recursive: true });
  if (!existsSync(source))
    execFileSync(
      'git',
      ['clone', '--no-checkout', inventory.upstreamUrl, source],
      { stdio: 'inherit' },
    );
  execFileSync(
    'git',
    ['-C', source, 'checkout', '--detach', inventory.revision],
    { stdio: 'inherit' },
  );
  const selected = inventory.files
    .filter(
      (f) =>
        f.path === 'LICENSE' ||
        f.path === 'index.html' ||
        f.path === 'style.css' ||
        f.path === 'game.js' ||
        (f.path.startsWith('src/') && f.path.endsWith('.js')),
    )
    .map((f) => {
      const bytes = execFileSync('git', [
        '-C',
        source,
        'show',
        `${inventory.revision}:${f.path}`,
      ]);
      verifySource(bytes, f);
      return { ...f, bytes };
    });
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let styles = '',
    handlers = '';
  for (const f of selected) {
    let bytes = f.bytes;
    if (f.path === 'index.html') {
      const t = transformHtml(String(bytes));
      bytes = t.html;
      styles = t.styles;
      handlers = t.handlers;
    }
    if (f.path.endsWith('.js')) {
      bytes = String(bytes)
        .replace(
          /(['"])(\.\.?\/[^'"]+\.js)\1/g,
          (_, q, path) =>
            q +
            './' +
            flatten(posix.normalize(posix.join(posix.dirname(f.path), path))) +
            q,
        )
        .replace(/\blocalStorage\b/g, 'window.akeruStorage')
        .replace(/new Audio\([^)]*\)/g, 'new window.AkeruSilentClip()')
        .replaceAll('onclick=', 'data-upstream-click=');
    }
    writeFileSync(resolve(out, flatten(f.path)), bytes);
  }
  writeFileSync(resolve(out, 'upstream-handlers.js'), handlers);
  writeFileSync(
    resolve(out, 'adapter.css'),
    readFileSync(
      resolve(root, 'packages/server-survival/adapter.css'),
      'utf8',
    ) +
      '\n' +
      styles,
  );
  copyFileSync(
    resolve(root, 'packages/server-survival/adapter.js'),
    resolve(out, 'adapter.js'),
  );
  copyFileSync(
    resolve(root, 'packages/contracts/src/save-client.js'),
    resolve(out, 'save-client.js'),
  );
  const vendor = resolve(root, 'node_modules/three-legacy');
  copyFileSync(
    resolve(vendor, 'build/three.module.js'),
    resolve(out, 'three.js'),
  );
  copyFileSync(resolve(vendor, 'LICENSE'), resolve(out, 'THREE-LICENSE.txt'));
  writeFileSync(
    resolve(out, 'tailwind-input.css'),
    '@tailwind base;\n@tailwind components;\n@tailwind utilities;',
  );
  execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/tailwindcss/lib/cli.js'),
      '-i',
      resolve(out, 'tailwind-input.css'),
      '-o',
      resolve(out, 'utilities.css'),
      '--content',
      `${out}/*.html,${out}/*.js`,
      '--minify',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  rmSync(resolve(out, 'tailwind-input.css'));
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  writeFileSync(
    resolve(out, 'build-record.json'),
    JSON.stringify(
      {
        upstream: inventory.upstreamUrl,
        revision: inventory.revision,
        approval: 'pending; local evaluation only',
        excluded: [
          'All assets/sounds: unknown provenance',
          'promotional assets',
          'external CDN requests',
        ],
        source: selected.map((f) => ({ path: f.path, sha256: sha(f.bytes) })),
        toolchain: {
          lockfileSha256: sha(readFileSync(resolve(root, 'package-lock.json'))),
          three: '0.128.0',
          tailwind: '3.4.17',
        },
        artifacts: readdirSync(out)
          .sort()
          .map((path) => ({
            path,
            sha256: sha(readFileSync(resolve(out, path))),
          })),
      },
      null,
      2,
    ),
  );
  console.log(`Built local Server Survival in ${out}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) buildServerSurvival();
