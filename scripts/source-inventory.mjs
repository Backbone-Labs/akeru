import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Inventory identity is evidence, never a license assertion or publication grant.
export function createInventory(upstreamUrl, revision, entries) {
  const url = new URL(upstreamUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Use a public HTTPS upstream without credentials, query or fragment',
    );
  if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(revision))
    throw new Error('An immutable Git revision is required');
  const seen = new Set();
  const files = entries
    .filter((e) => e.type !== 'tree')
    .map((e) => {
      if (
        typeof e.path !== 'string' ||
        !e.path ||
        e.path.startsWith('/') ||
        e.path.split('/').some((p) => !p || p === '..' || p === '.') ||
        // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted paths.
        /[\x00-\x1f\\]/.test(e.path) ||
        seen.has(e.path)
      )
        throw new Error('Unsafe or duplicate source path');
      seen.add(e.path);
      if (
        !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(e.sha) ||
        !['100644', '100755', '120000', '160000'].includes(e.mode)
      )
        throw new Error('Invalid Git object identity');
      if ((e.mode === '160000' ? 'commit' : 'blob') !== e.type)
        throw new Error('Git mode/type mismatch');
      return {
        path: e.path,
        gitObjectId: e.sha,
        mode: e.mode,
        kind:
          e.type === 'commit'
            ? 'submodule'
            : e.mode === '120000'
              ? 'symlink'
              : 'file',
        rightsStatus: 'unreviewed',
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (!files.length) throw new Error('Empty inventory');
  return {
    schemaVersion: 1,
    upstreamUrl,
    revision,
    scope: 'source-tree',
    rightsStatus: 'unreviewed',
    limitation:
      'Tracked paths only; submodules, external dependencies, generated outputs and runtime requests require separate inventories. File presence and root license do not establish file rights.',
    files,
  };
}

export function formatInventory(inventory) {
  const { files, ...metadata } = inventory;
  return (
    JSON.stringify(metadata, null, 2).slice(0, -2) +
    ',\n  "files": [\n' +
    files.map((file) => '    ' + JSON.stringify(file)).join(',\n') +
    '\n  ]\n}\n'
  );
}

export function inventoryCheckout(checkout, revision, upstreamUrl) {
  if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(revision))
    throw new Error('An immutable Git revision is required');
  const resolved = execFileSync(
    'git',
    ['-C', checkout, 'rev-parse', '--verify', `${revision}^{commit}`],
    { encoding: 'utf8' },
  ).trim();
  if (resolved !== revision) throw new Error('Revision must identify a commit');
  const output = execFileSync(
    'git',
    ['-C', checkout, 'ls-tree', '-rz', '--full-tree', revision],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const entries = output
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      const [mode, type, sha] = line.slice(0, tab).split(' ');
      return { mode, type, sha, path: line.slice(tab + 1) };
    });
  return createInventory(upstreamUrl, revision, entries);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [checkout, revision, upstream, output] = process.argv.slice(2);
  if (!checkout || !revision || !upstream || !output)
    throw new Error(
      'Usage: node scripts/source-inventory.mjs CHECKOUT COMMIT UPSTREAM_URL OUTPUT.json',
    );
  writeFileSync(
    output,
    formatInventory(inventoryCheckout(checkout, revision, upstream)),
    { flag: 'wx' },
  );
}
