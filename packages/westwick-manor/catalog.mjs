import { creatorOptions } from '../creator-preview/catalog.mjs';
export const options = () =>
  creatorOptions('westwick-manor', {
    title: 'Westwick Manor',
    category: 'action',
    summary: 'Explore a haunted manor, reveal ghosts and banish them together.',
    description:
      'An isometric ghost-hunting game with six floors, four Keepers, solo runs and co-op lobbies.',
    saveDescription:
      'Solo floor checkpoints and meta progression are saved. Continue restarts the saved floor; this is not an exact mid-combat snapshot.',
    controls: {
      controller: [
        'Left stick / D-pad move; right stick aims. RT / X attacks, LT ability, A holds interact/banish, B dash, Y uses an item. LB/RB switch item; View toggles map.',
        'D-pad / stick navigates menus; A selects; B goes back. Menu opens Akeru controls.',
      ],
      touch: [
        'Akeru twin sticks move and aim. A interacts, X attacks, B dashes, Y uses an item, LT triggers the ability. Tap menus directly.',
        'Keyboard: WASD, mouse aim, click/J attack, Space ability, Shift dash, E interact, Q item, 1/2/3 item slot.',
      ],
    },
  });
