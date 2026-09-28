import base from './playwright.config.mjs';
export default {
  ...base,
  outputDir: './test-results/kart-webkit',
  testMatch: 'kart-multiplayer.spec.mjs',
  use: { ...base.use, browserName: 'webkit', launchOptions: {} },
};
