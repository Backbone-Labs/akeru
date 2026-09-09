import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

// This validates immutable local build inputs against symlink escapes and
// final-entry substitution. It is not an OS sandbox for a directory that a
// hostile process can continuously rename or modify during validation.

const sameFile = (left, right) =>
  left.dev === right.dev && left.ino === right.ino;

const unchangedFile = (before, after) =>
  sameFile(before, after) &&
  before.size === after.size &&
  before.mtimeNs === after.mtimeNs &&
  before.ctimeNs === after.ctimeNs;

const isContained = (root, path) => {
  const remainder = relative(root, path);
  return (
    remainder !== '' &&
    !isAbsolute(remainder) &&
    remainder !== '..' &&
    !remainder.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  );
};

export function createContainedFileReader(directory) {
  const root = realpathSync.native(resolve(directory));
  if (!statSync(root).isDirectory()) throw new Error('Expected directory');

  return Object.freeze({
    root,
    read(name, encoding) {
      const path = resolve(root, name);
      if (!isContained(root, path)) throw new Error('Unsafe file path');

      let descriptor;
      try {
        descriptor = openSync(
          path,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        const before = fstatSync(descriptor, { bigint: true });
        if (!before.isFile()) throw new Error('Expected regular file');

        // The descriptor supplies the bytes. Resolving the pathname only proves
        // that its current target is below the canonical root and is the file we
        // opened; it is never used for a second content read.
        const target = realpathSync.native(path);
        if (!isContained(root, target)) throw new Error('File leaves root');
        const targetStat = statSync(target, { bigint: true });
        if (!sameFile(before, targetStat)) throw new Error('File changed');

        const bytes = readFileSync(descriptor, encoding);
        if (!unchangedFile(before, fstatSync(descriptor, { bigint: true })))
          throw new Error('File changed while reading');
        return bytes;
      } catch (error) {
        if (error?.code === 'ELOOP')
          throw new Error('Expected regular file', { cause: error });
        throw error;
      } finally {
        if (descriptor !== undefined) closeSync(descriptor);
      }
    },
  });
}
