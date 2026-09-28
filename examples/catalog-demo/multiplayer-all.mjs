/** Two isolated local workers and one catalog. No deployment or publication. */
import { fork } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startCatalogDemo } from './server.mjs';
import { options as kartOptions } from '../../packages/old-san-juan-kart/catalog.mjs';
import { blacklineOptions } from '../../packages/operation-blackline/catalog.mjs';
async function availablePort(host) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function startWorker(config) {
  const child = fork(new URL('./multiplayer-worker.mjs', import.meta.url), [], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    execArgv: [],
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(Error('Multiplayer worker startup timed out'));
    }, 15000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(Error(`Multiplayer worker exited (${code})`));
    });
    child.once('message', (result) => {
      clearTimeout(timer);
      if (result.status === 'ready') resolve();
      else reject(Error(result.message || 'Worker startup failed'));
    });
  });
  child.send({ action: 'configure', ...config });
  return { child, ready };
}
async function stopWorker({ child }) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 4000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    if (child.connected) child.send({ action: 'stop' });
    else child.kill();
  });
}
export async function startMultiplayerDemo({
  publicHost = process.env.AKERU_LAN_HOST || '127.0.0.1',
} = {}) {
  const octets = publicHost.split('.').map(Number);
  if (
    octets.length !== 4 ||
    publicHost !== octets.join('.') ||
    octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255) ||
    !(
      publicHost === '127.0.0.1' ||
      octets[0] === 10 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    )
  )
    throw Error('Use a private LAN IPv4 address');
  const bindHost = publicHost === '127.0.0.1' ? publicHost : '0.0.0.0';
  const titleIds = ['old-san-juan-kart', 'operation-blackline'];
  const ports = [];
  while (ports.length < titleIds.length) {
    const port = await availablePort(bindHost);
    if (!ports.includes(port)) ports.push(port);
  }
  const workers = [];
  let preview;
  try {
    preview = await startCatalogDemo({
      titles: [kartOptions({ multiplayer: true }), blacklineOptions()],
      publicHost,
      bindHost,
      multiplayerEndpoints: Object.fromEntries(
        titleIds.map((id, i) => [id, `http://${publicHost}:${ports[i]}`]),
      ),
    });
    for (const [index, titleId] of titleIds.entries())
      workers.push(
        startWorker({
          titleId,
          port: ports[index],
          host: bindHost,
          origins: [preview.url],
        }),
      );
    await Promise.all(workers.map((w) => w.ready));
    return {
      ...preview,
      workers: workers.map((w, i) => ({
        titleId: titleIds[i],
        port: ports[i],
        pid: w.child.pid,
      })),
      close: async () => {
        await preview.close();
        await Promise.all(workers.map(stopWorker));
      },
    };
  } catch (error) {
    await preview?.close();
    await Promise.all(workers.map(stopWorker));
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const preview = await startMultiplayerDemo();
  console.log(`Catalog: ${preview.url}/games`);
  console.log(`Kart: ${preview.url}/play/old-san-juan-kart`);
  console.log(`Blackline: ${preview.url}/play/operation-blackline`);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await preview.close();
      process.exit(0);
    });
}
