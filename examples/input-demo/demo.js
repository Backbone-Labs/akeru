import { createBrowserInputProvider } from '../../packages/input/src/browser.js';

const output = document.querySelector('#output');
const provider = createBrowserInputProvider({ titleId: 'input-demo' });
provider.mount({ touchRoot: document.querySelector('#touch-controls'), controlsRoot: document.querySelector('#control-settings') });
provider.subscribe(snapshot => { output.textContent = JSON.stringify({ channel: 'gameplay', ...snapshot }, null, 2); });
provider.subscribeNavigation(event => { output.textContent = JSON.stringify({ channel: 'navigation', ...event }, null, 2); });
document.querySelector('#settings').addEventListener('click', () => provider.showControls());
document.querySelector('#hide-settings').addEventListener('click', () => provider.hideControls());
provider.start();
addEventListener('pagehide', () => provider.dispose(), { once: true });
