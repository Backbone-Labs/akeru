import { controllerPlate } from './controller-art.js';
export const controllerChapters = [
  {
    title: 'Controller · The Hunt',
    plate: 'A Keeper’s controller',
    art: () =>
      controllerPlate('manor', [
        ['Left stick', 'Move'],
        ['Right stick', 'Aim your lantern'],
        ['RT / X', 'Strike'],
        ['LT', 'Keeper ability'],
        ['B', 'Dash'],
      ]),
    lines: [
      'Move with the <b>left stick</b> or D-pad. Aim with the <b>right stick</b>; you can face a ghost while moving away.',
      'Press <b>RT</b> or <b>X</b> to strike. Press <b>LT</b> for your Keeper’s special ability.',
      'Press <b>B</b> to dash out of danger. Keep ghosts in the light before attacking.',
    ],
    note: 'Xbox button names: A is bottom, B right, X left and Y top. Use the same positions on other Backbone layouts.',
  },
  {
    title: 'Controller · Tools',
    plate: 'Rites, supplies and the map',
    art: () =>
      controllerPlate('manor', [
        ['Hold A', 'Interact / banish'],
        ['Y', 'Use selected item'],
        ['LB / RB', 'Change item'],
        ['View', 'Toggle map'],
        ['Menu', 'Akeru pause menu'],
      ]),
    lines: [
      '<b>Hold A</b> to interact, banish a stunned ghost or revive an ally.',
      '<b>LB / RB</b> cycles your supplies. <b>Y</b> uses the selected item.',
      '<b>View</b> opens the map; <b>Menu</b> opens Akeru’s menu. Online play keeps running.',
    ],
    note: 'Keyboard equivalents: E = hold A · Q = Y · 1 / 2 / 3 = LB / RB.',
  },
];
