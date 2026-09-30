// Present one input language at a time, including HUD nodes recreated by the game.
const labels = [
  ['RT / RB · LEFT CLICK', 'RT / RB', 'LEFT CLICK'],
  ['LT / Y / RIGHT CLICK', 'LT / Y', 'RIGHT CLICK'],
  ['LT / Y · RIGHT CLICK', 'LT / Y', 'RIGHT CLICK'],
  ['RT / RB / LMB', 'RT / RB', 'LMB'],
  ['LT / Y / RMB', 'LT / Y', 'RMB'],
  ['L STICK / WASD', 'LEFT STICK', 'WASD'],
  ['R STICK / MOUSE', 'RIGHT STICK', 'MOUSE'],
  ['A / ANY KEY', 'A', 'ANY KEY'],
  ['A / ENTER', 'A', 'ENTER'],
  ['A / SPACE', 'A', 'SPACE'],
  ['X / E', 'X', 'E'],
  ['X / R', 'X', 'R'],
  ['Y / L', 'Y', 'L'],
  ['B / ESC', 'B', 'ESC'],
  ['LB / DEL', 'LB', 'DEL'],
  ['D-PAD / 1–5', 'D-PAD', '1–5'],
  ['Press E and take it', 'Press X and take it', 'Press E and take it'],
  [
    'E — GRAB IT FROM THE AIR',
    'X — GRAB IT FROM THE AIR',
    'E — GRAB IT FROM THE AIR',
  ],
  ['SPACE — SKIP', 'A — SKIP', 'SPACE — SKIP'],
  [
    'LEFT CLICK USES WHAT YOU HOLD',
    'RT / RB USES WHAT YOU HOLD',
    'LEFT CLICK USES WHAT YOU HOLD',
  ],
];

export function controlHint(text, mode) {
  for (const [both, controller, keyboard] of labels)
    text = text.replaceAll(both, mode === 'controller' ? controller : keyboard);
  return text;
}

export function installControlHints(root) {
  let mode = 'controller';
  const originals = new WeakMap();
  const paint = (node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const prior = originals.get(node);
    const source = prior?.rendered === node.data ? prior.source : node.data;
    const rendered = controlHint(source, mode);
    originals.set(node, { source, rendered });
    if (node.data !== rendered) node.data = rendered;
  };
  const scan = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return paint(node);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) paint(walker.currentNode);
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') paint(record.target);
      else for (const node of record.addedNodes) scan(node);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true });
  const set = (value) => {
    if (value === mode) return;
    mode = value;
    root.dataset.inputMode = mode;
    scan(root);
  };
  root.dataset.inputMode = mode;
  scan(root);
  return { set };
}
