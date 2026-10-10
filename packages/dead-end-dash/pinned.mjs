/** The one Dead End Dash source that both recipes build, and the only way
 * either of them reads it: committed objects through Git plumbing. The working
 * tree is never read and no script, hook or filter from the checkout is run. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Where the source lives, which commit, and what the files each recipe reads
// from that commit hash to. All four change together.
export const sourceUrl = 'https://github.com/HyperLightAlex/dead-end-dash';
export const revision = 'bc7160d377d715c1b278ba6f3f82a83f40e2ce62';
// The title (build.mjs).
export const sourceDigest =
  '279359c2032a4c8d57dc09a1f2f67339aa71c8e897608632709d70dd38926af3';
// The party relay (build-server.mjs).
export const serverDigest =
  '6ee09aa11f128287d80ff10246c7e39898d93cd3b98e4532eb7873d8e8d925b1';

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** `git@github.com:owner/repo.git` and its HTTPS forms name one repository. */
export function normalizeRemote(remote) {
  const url = String(remote)
    .trim()
    .replace(/^git@([^:/]+):/, 'https://$1/')
    .replace(/\.git$/, '');
  if (!/^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(url))
    throw new Error('Unsupported Dead End Dash remote');
  return url;
}

/** Regular committed files only: a link or submodule is never followed. */
export function regularBlobs(tree) {
  return new Set(
    String(tree)
      .split('\n')
      .map((line) => /^100(?:644|755) blob [a-f0-9]+\t(.+)$/.exec(line)?.[1])
      .filter(Boolean),
  );
}

/** One value for everything read from the pinned commit. */
export const digestSources = (sources) =>
  hash(
    JSON.stringify(
      [...sources]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([path, sha256]) => ({ path, sha256 })),
    ),
  );

/** Open the checkout at `source` if, and only if, its `HEAD` is the pinned
 * commit and its `origin` the pinned repository. `read(path)` returns one
 * committed file and remembers its hash. `seal(expected)` gives one digest for
 * everything read, and refuses when it is not the one that was reviewed: Git
 * does not re-verify object ids on every read, so this is what ties a build
 * to known bytes. */
export function openPinned(source, pin) {
  if (!source) throw new Error('Pass the path to the Dead End Dash checkout');
  // Plumbing only, with replacement objects and the checkout's monitor hook
  // off. Nothing here compares against the working tree, so no clean filter
  // or hook configured in the checkout has a reason to run.
  const git = (args) =>
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.fsmonitor=false',
        '-C',
        resolve(source),
        ...args,
      ],
      {
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: {
          ...process.env,
          GIT_NO_REPLACE_OBJECTS: '1',
          GIT_OPTIONAL_LOCKS: '0',
        },
      },
    );
  let head, remote;
  try {
    head = git(['rev-parse', '--verify', 'HEAD']).toString().trim();
  } catch {
    throw new Error('Not a Dead End Dash checkout: ' + source);
  }
  if (head !== pin.revision)
    throw new Error('Unexpected Dead End Dash source revision');
  try {
    remote = git(['config', '--get', 'remote.origin.url']).toString();
  } catch {
    throw new Error('Dead End Dash checkout has no origin remote');
  }
  if (normalizeRemote(remote) !== pin.sourceUrl)
    throw new Error('Dead End Dash checkout is not from the pinned repository');
  const tracked = regularBlobs(git(['ls-tree', '-r', pin.revision]));
  const selected = new Map();
  return {
    read(path) {
      if (!tracked.has(path))
        throw new Error('Dead End Dash source file is missing: ' + path);
      const bytes = git(['cat-file', 'blob', `${pin.revision}:${path}`]);
      selected.set(path, hash(bytes));
      return bytes;
    },
    seal(expected) {
      const digest = digestSources(selected);
      if (expected !== undefined && digest !== expected)
        throw new Error(
          `Dead End Dash source does not match its pinned digest (read ${digest})`,
        );
      return {
        digest,
        source: [...selected]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([path, sha256]) => ({ path, sha256 })),
      };
    },
  };
}
