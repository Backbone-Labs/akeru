import base from './playwright.config.mjs';
export default {
  ...base,
  outputDir: './test-results/blackline-webkit',
  testMatch: 'blackline-multiplayer.spec.mjs',
  use: { ...base.use, browserName: 'webkit', launchOptions: {} },
};
