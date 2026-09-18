import { titleOptions } from '../arcade-preview/catalog.mjs';
export const options = () =>
  titleOptions(
    'hexgl',
    {
      title: 'HexGL',
      summary: 'Race a futuristic hovercraft through Cityscape.',
      description:
        'The original HexGL Cityscape time trial in an isolated Akeru adapter. Best completed race time saves locally. Local evaluation only: upstream MIT and noncommercial headers require reconciliation.',
      category: 'racing',
      creator: 'Thibaut Despoulain / BKcore',
      controls: {
        controller: [
          'Left stick / D-pad — steer. A — accelerate. B — air brakes.',
        ],
        touch: [
          'Hold on-screen steering, acceleration and brake buttons. Keyboard: arrows / WASD.',
        ],
      },
      saves:
        'Best completed race time saves locally; an unfinished race restarts.',
    },
    { graphics: 'webgl1', assetRequests: true, license: 'unknown' },
  );
