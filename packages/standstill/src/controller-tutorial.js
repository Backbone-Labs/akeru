import { controllerPlate } from './controller-art.js';
export const controllerPages = [
  {
    title: 'YOUR CONTROLLER.',
    lead: 'Two sticks. Every second is yours.',
    body: 'Left stick moves. Right stick aims. Release both to slow time. RT or RB punches with empty hands, shoots a gun, or swings a melee weapon. Mouse: left click does the same.',
    notes: [
      'A jumps. Airborne = full speed.',
      'X / E grabs or catches a weapon.',
      'LT / Y or right click throws.',
    ],
    art: () =>
      controllerPlate('standstill', [
        ['Left stick', 'Move'],
        ['Right stick', 'Aim'],
        ['RT / RB', 'Shoot / punch'],
        ['A', 'Jump'],
        ['X', 'Grab / catch'],
      ]),
  },
  {
    title: 'STOP. THINK. ACT.',
    lead: 'Make your next move count.',
    body: 'Stop to read the room. Actions briefly speed up time. Menu opens Akeru. B opens the game’s pause menu and tutorial.',
    notes: [
      'A / RB next. LB previous. B back.',
      'Menus: stick browse. A select.',
      'A bottom · B right · X left · Y top.',
    ],
    art: () =>
      controllerPlate('standstill', [
        ['LT / Y', 'Throw'],
        ['Menu', 'Pause menu'],
        ['A / RB', 'Next page'],
        ['LB', 'Previous page'],
        ['B', 'Back / close'],
      ]),
  },
];
