import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContainedFileReader } from './read-contained-file.mjs';

export function inspectPublicFile(path, content) {
  const errors = [];
  const parts = path.split('/');
  if (
    path.startsWith('/') ||
    parts.some((part) => part === '..') ||
    // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted paths.
    /[\\\x00-\x1f]/u.test(path)
  ) {
    errors.push('unsafe repository path');
  }
  if (
    /^(research|tmp|node_modules|dist|coverage)(\/|$)/u.test(path) ||
    (/(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|mobileprovision))$/u.test(
      path,
    ) &&
      !path.endsWith('.env.example')) ||
    /^(AKERU_DISCOVERY|REPOSITORY_INVENTORY)\.md$/u.test(path)
  ) {
    errors.push('private, generated or credential file');
  }
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(content) ||
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/u.test(content) ||
    /\bAKIA[0-9A-Z]{16}\b/u.test(content)
  ) {
    errors.push('possible credential');
  }
  if (
    /https:\/\/github\.com\/Backbone-Labs\/(?:ios|android|b3|cloud)(?:[/#?]|$)/iu.test(
      content,
    ) ||
    /\/(?:Users|home)\/[A-Za-z0-9._-]+\//u.test(content)
  ) {
    errors.push('private source reference or local account path');
  }
  return errors;
}

export function checkPublicTree(cwd = process.cwd()) {
  const reader = createContainedFileReader(cwd);
  const paths = execFileSync('git', ['ls-files', '-z'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  const failures = [];
  for (const path of paths) {
    const pathErrors = inspectPublicFile(path, '');
    if (pathErrors.length) {
      for (const error of pathErrors) failures.push(`${path}: ${error}`);
      continue;
    }
    let content;
    try {
      content = reader.read(path, 'utf8');
    } catch {
      failures.push(`${path}: only regular tracked files are allowed`);
      continue;
    }
    for (const error of inspectPublicFile(path, content)) {
      failures.push(`${path}: ${error}`);
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return paths.length;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(
      `Public tree checks passed (${checkPublicTree()} tracked files).`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
