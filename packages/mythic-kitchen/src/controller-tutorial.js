import { controllerPlate } from './controller-art.js';
export const controllerSteps = [
  {
    id: 'controller-cooking',
    title: 'COOK WITH A CONTROLLER',
    art: () =>
      controllerPlate('kitchen', [
        ['Left stick', 'Move your chef'],
        ['A', 'Pick up / put down'],
        ['Hold X / RT', 'Chop, wash, spray'],
        ['B', 'Dash'],
        ['Y', 'Swap solo chef'],
      ]),
    lines: [
      'Use the <b>left stick</b> or D-pad to move. Face a station and press <b>A</b> to pick up or put down.',
      '<b>Hold X or RT</b> to chop, wash dishes or use the extinguisher. Keep holding until the job is done.',
      'Tap <b>B</b> to dash. In Single Player, <b>Y</b> swaps the chef you control.',
      'Button positions: <b>A bottom · B right · X left · Y top</b>, including on other Backbone layouts.',
    ],
  },
  {
    id: 'controller-team',
    title: 'YOUR CREW & MENUS',
    art: () =>
      controllerPlate('kitchen', [
        ['Menu', 'Akeru pause menu'],
        ['A / RB', 'Next tutorial page'],
        ['LB', 'Previous page'],
        ['B', 'Close tutorial'],
        ['D-pad', 'Browse game menus'],
      ]),
    lines: [
      'One controller drives your active chef. <b>Local player two uses the keyboard</b>; a second gamepad is not routed yet.',
      'In online play, each player uses their own device and controller. Opening <b>Menu</b> stops your inputs while the kitchen keeps running.',
      'In game menus, use the stick or D-pad to browse, <b>A</b> to select and <b>B</b> to go back.',
      'The next chapters show keyboard controls: <b>Space = A</b>, <b>Ctrl / J = X / RT</b>, <b>Shift = B</b> and <b>Tab = Y</b>.',
    ],
  },
];

// Native tutorial scenes generate level-specific keyframes. Construct a sheet
// instead of inserting an inline style element into the isolated title.
let tutorialSheet;
export function tutorialStyles(css) {
  if (!tutorialSheet) {
    tutorialSheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [
      ...document.adoptedStyleSheets,
      tutorialSheet,
    ];
  }
  tutorialSheet.replaceSync(css);
  return '';
}
