import { titleOptions } from '../arcade-preview/catalog.mjs';
export const options = () =>
  titleOptions(
    'breaklock',
    {
      title: 'BreakLock',
      summary: 'Crack the hidden pattern, one clue at a time.',
      description:
        'Uses BreakLock’s original pattern generation and matching logic with an accessible Akeru interface. Four dots form the secret: a filled marker means correct position, a hollow marker means correct dot elsewhere.',
      category: 'puzzle',
      creator: 'maxwellito; Akeru interface',
      controls: {
        controller: [
          'D-pad — select dot. A — add dot. B — clear current pattern.',
        ],
        touch: [
          'Tap dots to draw a guess. Four dots submit automatically. Keyboard: arrows then Enter.',
        ],
      },
      saves: 'Current lock, guesses and solved count save locally.',
    },
    { graphics: 'dom', assetRequests: false, license: 'MIT' },
  );
