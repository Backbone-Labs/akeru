import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inspectPublicFile } from '../scripts/check-public-tree.mjs';
import { packageSource } from '../scripts/package-source.mjs';

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'akeru-package-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ engines: { node: process.versions.node }, packageManager: 'npm@11.17.0' }));
  writeFileSync(join(cwd, '.gitignore'), 'dist/\n');
  writeFileSync(join(cwd, 'README.md'), '# Original fixture\n');
  const commit = () => { git('add', '.'); git('commit', '-m', 'fixture'); };
  commit();
  return { cwd, git, commit };
}

test('public tree rejects internal paths and credentials, accepts ordinary source', () => {
  assert.deepEqual(inspectPublicFile('packages/example/index.js', 'export const value = 1;'), []);
  assert.deepEqual(inspectPublicFile('.env.example', 'PUBLIC_ORIGIN=https://example.invalid'), []);
  for (const path of ['research/notes.md', '.env.local', 'keys/signing.p12', '../outside']) {
    assert.ok(inspectPublicFile(path, '').length, path);
  }
  assert.ok(inspectPublicFile('config.txt', 'ghp_' + 'x'.repeat(36)).length);
  assert.ok(inspectPublicFile('notes.md', 'https://' + 'github.com/Backbone-Labs/' + 'ios/blob/main/file').length);
});

test('same clean revision produces identical archive and complete file hashes', (t) => {
  const { cwd } = repository(t);
  const first = packageSource(cwd);
  const second = packageSource(cwd);
  assert.deepEqual(first, second);
  const archive = readFileSync(join(cwd, 'dist/source', first.artifact.filename));
  assert.equal(first.artifact.sha256, createHash('sha256').update(archive).digest('hex'));
  assert.deepEqual(first.files.map((file) => file.path), ['.gitignore', 'README.md', 'package.json']);
  const source = first.files.find((file) => file.path === 'README.md');
  assert.equal(source.sha256, createHash('sha256').update('# Original fixture\n').digest('hex'));
});

test('packaging rejects dirty and untracked files', (t) => {
  const { cwd, git } = repository(t);
  writeFileSync(join(cwd, 'README.md'), 'changed');
  assert.throws(() => packageSource(cwd), /clean checkout/u);
  git('restore', 'README.md');
  writeFileSync(join(cwd, 'untracked.txt'), 'not part of revision');
  assert.throws(() => packageSource(cwd), /clean checkout/u);
});

test('packaging refuses archive rules that break source-to-hash correspondence', (t) => {
  const { cwd, commit } = repository(t);
  writeFileSync(join(cwd, '.gitattributes'), 'README.md export-ignore\n');
  commit();
  assert.throws(() => packageSource(cwd), /export attributes/u);
});

test('packaging refuses tracked secrets and symlinks', (t) => {
  const { cwd, commit } = repository(t);
  writeFileSync(join(cwd, '.env'), 'PLACEHOLDER=not-a-real-secret');
  commit();
  assert.throws(() => packageSource(cwd), /credential file/u);
  rmSync(join(cwd, '.env'));
  symlinkSync('README.md', join(cwd, 'linked.md'));
  commit();
  assert.throws(() => packageSource(cwd), /symlinks/u);
});
