import { createRelay } from './relay.mjs';
const origins = (process.env.BRAWLER_ALLOWED_ORIGINS ?? '')
  .split(',')
  .filter(Boolean);
if (
  !origins.length ||
  origins.some((o) => {
    try {
      return new URL(o).origin !== o || !o.startsWith('https://');
    } catch {
      return true;
    }
  })
)
  throw Error('Set exact HTTPS title origins');
const relay = createRelay({ origins });
relay.server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', () =>
  console.log('Brawler relay ready'),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, async () => {
    await relay.close();
    process.exit(0);
  });
