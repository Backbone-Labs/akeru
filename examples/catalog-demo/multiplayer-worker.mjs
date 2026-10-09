/** Local preview worker. A separate process avoids Colyseus global state sharing. */
const origins = [];
let worker;
let starting = false;
async function stop() {
  await worker?.close();
  process.exit(0);
}
process.on('message', async (message) => {
  if (message?.action === 'stop') return stop();
  if (
    message?.action !== 'configure' ||
    !Array.isArray(message.origins) ||
    !message.origins.length
  )
    return;
  if (
    message.origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          !['http:', 'https:'].includes(url.protocol) || url.origin !== origin
        );
      } catch {
        return true;
      }
    })
  )
    return;
  origins.splice(0, origins.length, ...message.origins);
  if (worker || starting) return;
  starting = true;
  try {
    const starters = {
      'old-san-juan-kart': async () =>
        (
          await import('../../packages/old-san-juan-kart/multiplayer/server.mjs')
        ).startKartServer,
      'operation-blackline': async () =>
        (
          await import('../../packages/operation-blackline/multiplayer/server.mjs')
        ).startBlacklineServer,
    };
    if (!Object.hasOwn(starters, message.titleId))
      throw Error('Unknown title worker');
    const start = await starters[message.titleId]();
    worker = await start({ port: message.port, host: message.host, origins });
    process.send({ status: 'ready', port: worker.port });
  } catch (error) {
    process.send({ status: 'error', message: error.message });
    process.exit(1);
  }
});
process.on('disconnect', stop);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
