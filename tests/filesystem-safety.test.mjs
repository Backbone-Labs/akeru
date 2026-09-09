import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPublicTree } from '../scripts/check-public-tree.mjs';
import { createContainedFileReader } from '../scripts/read-contained-file.mjs';
import { verifyAuditSources } from '../scripts/validate-rights-audit.mjs';

const temporaryDirectory = (t, prefix) => {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('contained reads reject final and ancestor symlinks that leave the root', (t) => {
  const root = temporaryDirectory(t, 'akeru-contained-root-');
  const outside = temporaryDirectory(t, 'akeru-contained-outside-');
  writeFileSync(join(outside, 'notice.txt'), 'outside bytes\n');
  const reader = createContainedFileReader(root);

  symlinkSync(join(outside, 'notice.txt'), join(root, 'notice.txt'));
  assert.throws(() => reader.read('notice.txt'), /regular file/u);

  mkdirSync(join(root, 'evidence'));
  rmSync(join(root, 'evidence'), { recursive: true });
  symlinkSync(outside, join(root, 'evidence'));
  assert.throws(() => reader.read('evidence/notice.txt'), /leaves root/u);
});

test(
  'contained reads reject a FIFO without waiting for a writer',
  { skip: process.platform === 'win32' },
  (t) => {
    const root = temporaryDirectory(t, 'akeru-contained-fifo-');
    execFileSync('mkfifo', [join(root, 'input')]);
    const reader = createContainedFileReader(root);
    assert.throws(() => reader.read('input'), /regular file/u);
  },
);

test('rights source verification rejects matching evidence through an outside symlink', (t) => {
  const root = temporaryDirectory(t, 'akeru-rights-root-');
  const outside = temporaryDirectory(t, 'akeru-rights-outside-');
  const bytes = Buffer.from('matching evidence\n');
  writeFileSync(join(outside, 'NOTICE'), bytes);
  symlinkSync(outside, join(root, 'linked'));
  const audit = {
    evidence: [
      {
        path: 'linked/NOTICE',
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        gitObjectId: createHash('sha1')
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest('hex'),
      },
    ],
  };

  assert.throws(() => verifyAuditSources(audit, root), /Unsafe evidence file/u);
});

test('public tree inspection rejects a tracked file reached through a replaced directory', (t) => {
  const root = temporaryDirectory(t, 'akeru-public-root-');
  const outside = temporaryDirectory(t, 'akeru-public-outside-');
  const git = (...args) => execFileSync('git', args, { cwd: root });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs/notice.txt'), 'public bytes\n');
  git('add', '.');
  git('commit', '-m', 'fixture');

  rmSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(outside, 'notice.txt'), 'public bytes\n');
  symlinkSync(outside, join(root, 'docs'));

  assert.throws(() => checkPublicTree(root), /only regular tracked files/u);
});
