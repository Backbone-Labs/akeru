import { titleOptions } from '../arcade-preview/catalog.mjs';
export const options = () =>
  titleOptions(
    'racer',
    {
      title: 'Retro Road Racer',
      summary: 'Find your racing line through hills, curves and traffic.',
      description:
        "An adaptation of Jake Gordon’s open-source JavaScript Racer, retaining its road, traffic and driving logic with original procedural artwork. The upstream demo's borrowed sprites and licensed music are excluded.",
      category: 'racing',
      creator: 'Jake Gordon; Akeru adaptation and original artwork',
      controls: {
        controller: ['Left stick / D-pad — steer. A — accelerate. B — brake.'],
        touch: [
          'Hold steering, accelerator and brake buttons. Keyboard: arrows / WASD.',
        ],
      },
      saves: 'Best lap saves locally; an unfinished lap restarts.',
    },
    { graphics: 'canvas2d', assetRequests: false, license: 'MIT' },
  );
