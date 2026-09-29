import { titleOptions } from '../arcade-preview/catalog.mjs';
export const options = () =>
  titleOptions(
    'old-san-juan-kart',
    {
      title: 'Old San Juan Kart',
      summary: 'Quick kart races through the streets of San Juan.',
      description:
        'Nathaniel Silva’s open-source arcade racer, with procedural scenery and sound, eight racers and a direct quick-race launch. Mobile evaluation build.',
      category: 'racing',
      creator: 'Nathaniel Silva',
      controls: {
        controller: [
          'Left stick — steer. A — gas. B — brake. D-pad down — drift; up — item.',
        ],
        touch: [
          'On-screen steering, gas, brake and item controls. Keyboard: WASD, Shift to drift, E for items.',
        ],
      },
      saves:
        'Audio preferences save locally; races restart when reopened. No race save states.',
    },
    { graphics: 'webgl2', assetRequests: true, license: 'MIT' },
  );
