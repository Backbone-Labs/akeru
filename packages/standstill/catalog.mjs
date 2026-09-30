import { creatorOptions } from '../creator-preview/catalog.mjs';
export const options = () =>
  creatorOptions('standstill', {
    title: 'Standstill',
    category: 'action',
    offlineOnly: true,
    summary: 'A first-person shooter where time follows your movement.',
    description:
      'Read the room, dodge bullets and turn enemy weapons against them. Includes campaign levels, endless mode and replay highlights.',
    saveDescription:
      'Unlocked levels, best scores, tutorial progress and settings are saved locally. Active levels restart; this is not an exact mid-fight snapshot.',
    controls: {
      controller: [
        'Left stick / D-pad move, right stick aim, RT / RB shoot or punch, A jump, X grab/catch, LT or Y throw. Menu opens Akeru pause controls.',
        'Tutorial: A/RB next, LB previous, B close. Menus: D-pad/stick browse, A selects, B goes back.',
      ],
      touch: [
        'Akeru twin sticks move and aim. RT punches/shoots, A jumps, X grabs/catches, LT or Y throws. Tap menus directly.',
        'Keyboard: WASD/arrows move, Space jump, E grab, F throw. Click the game to capture the mouse, then move it to aim. Left click punches/shoots, right click throws, Esc pauses and releases the cursor.',
      ],
    },
  });
