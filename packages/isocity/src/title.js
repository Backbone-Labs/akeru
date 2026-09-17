import { connectGame } from './host.js';
// Original procedural artwork: no upstream bitmap or external fonts.
const names = [
  'Grass',
  'House',
  'Townhouse',
  'Apartment',
  'Office',
  'Tower',
  'Shop',
  'Cafe',
  'Park',
  'Pond',
  'Road',
  'Plaza',
];
const atlas = document.createElement('canvas');
atlas.width = 1560;
atlas.height = 230;
const c = atlas.getContext('2d');
function poly(points, color) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
function box(x, y, width, depth, height, color) {
  poly(
    [
      [x - width, y],
      [x, y + depth],
      [x, y + depth - height],
      [x - width, y - height],
    ],
    color,
  );
  poly(
    [
      [x, y + depth],
      [x + width, y],
      [x + width, y - height],
      [x, y + depth - height],
    ],
    '#567c70',
  );
  poly(
    [
      [x - width, y - height],
      [x, y - depth - height],
      [x + width, y - height],
      [x, y + depth - height],
    ],
    '#e7ebd3',
  );
}
for (let i = 0; i < 12; i++) {
  c.save();
  c.translate(i * 130, 0);
  poly(
    [
      [0, 162],
      [65, 130],
      [130, 162],
      [65, 194],
    ],
    i === 9 ? '#85c0be' : i === 10 ? '#b4beb2' : '#b7d3a0',
  );
  poly(
    [
      [0, 162],
      [65, 194],
      [65, 202],
      [0, 170],
    ],
    '#839e70',
  );
  poly(
    [
      [65, 194],
      [130, 162],
      [130, 170],
      [65, 202],
    ],
    '#6c8d67',
  );
  if (i > 0 && i < 8) {
    const height = [0, 42, 65, 82, 96, 130, 40, 34][i];
    box(
      64,
      153,
      33,
      17,
      height,
      [
        '',
        '#e8b396',
        '#ccbb9e',
        '#b5c8b1',
        '#d5ded2',
        '#a8c4b9',
        '#ddbd8b',
        '#e4a993',
      ][i],
    );
    for (let r = 0; r < Math.floor(height / 18); r++) {
      for (let k = 0; k < 3; k++) {
        poly(
          [
            [38 + k * 8, 143 - r * 18 + k * 4],
            [44 + k * 8, 146 - r * 18 + k * 4],
            [44 + k * 8, 139 - r * 18 + k * 4],
            [38 + k * 8, 136 - r * 18 + k * 4],
          ],
          '#fff1bc',
        );
        poly(
          [
            [72 + k * 8, 153 - r * 18 - k * 4],
            [78 + k * 8, 150 - r * 18 - k * 4],
            [78 + k * 8, 143 - r * 18 - k * 4],
            [72 + k * 8, 146 - r * 18 - k * 4],
          ],
          '#c2e7df',
        );
      }
    }
    if (i === 1 || i === 2 || i === 7) {
      poly(
        [
          [27, 153 - height],
          [64, 126 - height],
          [104, 153 - height],
          [64, 172 - height],
        ],
        '#b77757',
      );
    }
  }
  if (i === 8) {
    for (const [x, y] of [
      [42, 151],
      [81, 166],
      [78, 139],
    ]) {
      box(x, y, 3, 2, 16, '#8e7952');
      c.fillStyle = '#558558';
      c.beginPath();
      c.ellipse(x, y - 26, 15, 22, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#729a64';
      c.beginPath();
      c.ellipse(x - 4, y - 30, 10, 17, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  if (i === 9) {
    poly(
      [
        [24, 161],
        [67, 141],
        [106, 161],
        [64, 183],
      ],
      '#65a7af',
    );
    poly(
      [
        [37, 158],
        [68, 147],
        [90, 158],
        [62, 173],
      ],
      '#94d4d0',
    );
  }
  if (i === 10) {
    poly(
      [
        [14, 157],
        [33, 148],
        [113, 170],
        [93, 180],
      ],
      '#778b87',
    );
    poly(
      [
        [18, 157],
        [21, 156],
        [107, 170],
        [103, 172],
      ],
      '#e8e6b4',
    );
  }
  if (i === 11) {
    poly(
      [
        [20, 162],
        [65, 140],
        [110, 162],
        [65, 185],
      ],
      '#e2d5b3',
    );
    box(65, 158, 12, 6, 18, '#90b7b0');
  }
  c.restore();
}
let selected = 1,
  row = 3,
  column = 3,
  ready = false,
  paused = false;
const engine = window.IsoCity;
const valid = (s) =>
  s &&
  Array.isArray(s.map) &&
  s.map.length === 7 &&
  s.map.every(
    (r) =>
      Array.isArray(r) &&
      r.length === 7 &&
      r.every(
        (v) =>
          Array.isArray(v) &&
          v.length === 2 &&
          v[0] === 0 &&
          Number.isInteger(v[1]) &&
          v[1] >= 0 &&
          v[1] < 12,
      ),
  );
function select(id) {
  selected = id;
  engine.select(id);
  document
    .querySelectorAll('#tools button')
    .forEach((b, j) => b.setAttribute('aria-pressed', String(id === j)));
  document.querySelector('#selected').textContent = 'Selected: ' + names[id];
}
const action = connectGame({
  validate: valid,
  start(saved) {
    engine.start(atlas, saved);
    ready = true;
    select(1);
    engine.hover(row, column);
  },
  pause(value) {
    paused = value;
  },
  serialize: () => engine.serialize(),
  dirty: () => engine.dirty(),
  action(a) {
    if (a === 'left') column = Math.max(0, column - 1);
    if (a === 'right') column = Math.min(6, column + 1);
    if (a === 'up') row = Math.max(0, row - 1);
    if (a === 'down') row = Math.min(6, row + 1);
    if (a === 'confirm') engine.place(row, column);
    if (a === 'cancel') select((selected + 1) % 12);
    engine.hover(row, column);
  },
});
names.forEach((name, id) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', name);
  b.setAttribute('aria-pressed', 'false');
  const tile = document.createElement('canvas');
  tile.width = 130;
  tile.height = 230;
  tile.getContext('2d').drawImage(atlas, id * 130, 0, 130, 230, 0, 0, 130, 230);
  b.append(tile, document.createTextNode(name));
  b.onclick = () => {
    if (ready && !paused) select(id);
  };
  document.querySelector('#tools').append(b);
});
const fg = document.querySelector('#fg');
fg.addEventListener('pointerdown', (event) => {
  if (!ready || paused) return;
  event.preventDefault();
  const rect = fg.getBoundingClientRect();
  engine.pointer({
    offsetX: ((event.clientX - rect.left) * 910) / rect.width,
    offsetY: ((event.clientY - rect.top) * 666) / rect.height,
    which: event.button === 2 ? 3 : 1,
  });
});
fg.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (e.code === 'KeyB') {
    e.preventDefault();
    action('cancel');
  }
});
