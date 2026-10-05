'use strict';
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['service.cjs'], {
  env: {
    ...process.env,
    ALLOWED_ORIGINS: 'https://build.invalid',
    PORT: '8080',
  },
  stdio: 'inherit',
});
let done = false;
child.on('exit', (code) => {
  if (!done) process.exit(code || 1);
});
(async () => {
  try {
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const response = await fetch('http://127.0.0.1:8080/ready');
        if (response.ok && (await response.json()).ready) {
          const created = await fetch('http://127.0.0.1:8080/rooms', {
            method: 'POST',
            headers: {
              Origin: 'https://build.invalid',
              'Content-Type': 'application/json',
            },
            body: '{}',
          });
          if (created.status !== 201 || !(await created.json()).token)
            throw Error('Native private room failed startup');
          done = true;
          child.kill('SIGTERM');
          return;
        }
      } catch {
        // The engine may still be starting; the bounded loop retries readiness.
      }
    }
    throw Error('Native server failed readiness during image build');
  } catch (error) {
    console.error(error.message);
    done = true;
    child.kill('SIGTERM');
    process.exitCode = 1;
  }
})();
