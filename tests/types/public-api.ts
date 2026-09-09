// Compile-only integrator contract. Every negative case must remain a type error.
import { createBrowserInputProvider } from '@akeru/input';
import {
  createReferenceHost,
  planLaunch,
} from '@akeru/contracts/reference-host';
import {
  assertTitleAdapterV1,
  validateManifest,
  type HostServicesV1,
  type TitleAdapterV1,
} from '@akeru/contracts';
const provider = createBrowserInputProvider({
  titleId: 'example-title',
  storage: null,
});
const host = createReferenceHost();
provider.subscribe((input) => host.deliverInput(input));
provider.mount({ touchRoot: document.createElement('div') });
provider.setMapping('gamepad', { buttons: { south: 'fire' }, axes: {} });
provider
  .refreshControllers()
  .forEach((controller) => provider.selectController(controller.index));
provider.subscribeNavigation((event) => {
  if (event.type === 'move') console.log(event.direction);
});
validateManifest({});
planLaunch(
  {},
  {
    grants: [],
    graphics: ['webgl2'],
    features: [],
    shellOrigin: 'https://shell.invalid',
    titleOrigin: 'https://title.invalid',
  },
);
const adapter: TitleAdapterV1 = {
  controlHelp: { controller: [], touch: [] },
  async initialize(services: HostServicesV1) {
    await services.saves.write(
      'slot',
      { schemaVersion: 1, bytes: new Uint8Array() },
      null,
    );
    // @ts-expect-error Games cannot choose another player's identity.
    await services.saves.read('slot', 'another-user');
    // @ts-expect-error Credentials are not part of the game-facing API.
    services.credentials;
    // @ts-expect-error Arbitrary content is not an allowed telemetry payload.
    services.telemetry.emit({ type: 'saveContents', value: 'private' });
  },
  async pause() {},
  async resume() {},
  async dispose() {},
};
assertTitleAdapterV1(adapter);
// @ts-expect-error Gameplay requires a touch root.
provider.mount({});
// @ts-expect-error Unknown input providers are not accepted.
provider.setMapping('unrestricted-native', { buttons: {}, axes: {} });
host.deliverInput({
  sequence: 0,
  timeMs: 0,
  provider: 'touch',
  connected: true,
  // @ts-expect-error Snapshots cannot supply a nonnumeric control value.
  buttons: { fire: 'yes' },
  axes: {},
});
// @ts-expect-error A provider cannot mutate published controller metadata.
provider.refreshControllers()[0].index = 4;

// Host-only save administration must not become part of the game service.
import { createSaveStore } from '@akeru/saves';
import { createSaveClient } from '@akeru/contracts/save-client';
const guestStore = createSaveStore().forTitle({
  titleId: 'example-title',
  schemaVersion: 1,
});
void guestStore.service.read('main');
void guestStore.exportData();
// @ts-expect-error Games cannot reset an entire title namespace through SaveService.
guestStore.service.reset();
// @ts-expect-error Games cannot choose another title through SaveService.
guestStore.service.forTitle({ titleId: 'other', schemaVersion: 1 });
const saveClient = createSaveClient(() => {});
void saveClient.service.status();
saveClient.dispose();
