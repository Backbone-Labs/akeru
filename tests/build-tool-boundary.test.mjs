import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const title of ['tatham', 'freedoom']) {
  test(`${title} ignores executable overrides and rejects an unsupported installed tool`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'akeru-build-tools-'));
    try {
      const marker = join(dir, 'override-was-executed');
      const executable = (name, body) => {
        const path = join(dir, name);
        writeFileSync(path, '#!/bin/sh\n' + body, { mode: 0o755 });
        return path;
      };
      const override = executable('override', ': > "$AKERU_TEST_MARKER"\n');
      executable(
        'emcc',
        title === 'freedoom'
          ? "printf 'emcc (Emscripten) 4.0.15\\n'\n"
          : "printf 'emcc 0.0.0\\n'\n",
      );
      executable('deutex', "printf 'DeuTex 0.0.0\\n'\n");
      const result = spawnSync(
        process.execPath,
        [`packages/${title}/build.mjs`],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: dir,
            AKERU_EMCC: override,
            DEUTEX: override,
            AKERU_TEST_MARKER: marker,
          },
          encoding: 'utf8',
          timeout: 10000,
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        title === 'tatham'
          ? /Emscripten 4\.0\.15 is required/
          : /DeuTex 5\.2\.3 required/,
      );
      assert.equal(
        existsSync(marker),
        false,
        'environment override must never execute',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
