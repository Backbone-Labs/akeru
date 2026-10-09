import { creatorOptions } from '../creator-preview/catalog.mjs';
export const options = () =>
  creatorOptions('mythic-kitchen', {
    title: 'Mythic Kitchen',
    category: 'action',
    summary: 'Cook, chop and serve with a crew of mythical chefs.',
    description:
      'A co-op cooking game with solo chef switching, local keyboard co-op and online lobbies.',
    saveDescription:
      'Earned stars, unlocked kitchens and preferences are saved. Active cooking rounds restart when reopened.',
    controls: {
      controller: [
        'Left stick / D-pad moves. A picks up / puts down. Hold X / RT to chop, wash or extinguish. B dashes. Y switches the active chef in solo.',
        'D-pad / stick navigates menus; A selects; B goes back. Menu opens Akeru controls. One host-selected controller drives the first/active chef; local player two uses the keyboard.',
      ],
      touch: [
        'Akeru left stick moves. A picks up / puts down; hold X to work; B dashes; Y switches chef. Tap menus directly.',
        'Keyboard: WASD, Space interact, Ctrl/J work, Shift dash, Tab switch. Local player two: arrows, Enter, Right Shift and /.',
      ],
    },
  });
