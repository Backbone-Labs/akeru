import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCatalogServer } from '../../scripts/serve-catalog.mjs';
import { expect, expectNoHorizontalOverflow, test } from './fixtures.mjs';

let directory;
let server;
let url;

test.beforeAll(async () => {
  const packaged = resolve(process.env.AKERU_CATALOG_DIST ?? 'dist/catalog');
  directory = mkdtempSync(join(tmpdir(), 'akeru-packaged-catalog-'));
  const release = join(directory, 'catalog');
  cpSync(packaged, release, { recursive: true, errorOnExist: true });
  server = createCatalogServer(release);
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  url = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose())),
    );
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test('serves the validated production release with an empty catalog', async ({
  page,
}) => {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: /Good games/ })).toBeVisible();
  await expect(page.getByText('0 games', { exact: true })).toBeVisible();
  await expect(page.getByText('The library is being prepared.')).toBeVisible();
  await expect(page.locator('#demo-banner')).toBeHidden();
  await expectNoHorizontalOverflow(page);

  await page.goto(`${url}/g/not-published`);
  await expect(
    page.getByRole('heading', { name: 'This game isn’t available.' }),
  ).toBeVisible();
});
