import { titleOptions } from '../arcade-preview/catalog.mjs';
export const options = () =>
  titleOptions(
    'astray',
    {
      title: 'Astray',
      summary: 'Roll through a maze and find the way out.',
      description:
        'The original Astray maze generator, Box2D physics and Three.js renderer with Akeru controller and save adapters. Your maze and ball position save locally.',
      category: 'puzzle',
      creator: 'wwwtyro',
      controls: {
        controller: ['Left stick / D-pad — move the ball.'],
        touch: ['Hold direction buttons. Keyboard: arrows / WASD.'],
      },
      saves: 'Current maze and position save locally.',
    },
    { graphics: 'webgl1', assetRequests: false, license: 'Unlicense' },
  );
