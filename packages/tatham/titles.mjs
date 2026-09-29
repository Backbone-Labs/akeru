/** Original Simon Tatham collection engines; metadata is not publication approval. */
export const titles = [
  [
    'net',
    'Net',
    'Rotate the pipes until every computer joins one connected network.',
  ],
  [
    'fifteen',
    'Fifteen',
    'Slide numbered tiles into order using the empty space.',
  ],
  [
    'flood',
    'Flood',
    'Spread one colour from the top-left corner across the entire board.',
  ],
  [
    'samegame',
    'Same Game',
    'Remove connected colour groups and clear the board.',
  ],
  ['pegs', 'Pegs', 'Jump pegs over neighbours until only one remains.'],
  [
    'solo',
    'Solo',
    'Fill the Sudoku grid so every row, column and block contains each digit.',
  ],
  [
    'unequal',
    'Unequal',
    'Fill a Latin square while respecting every inequality.',
  ],
  ['towers', 'Towers', 'Place heights so the visible towers match the clues.'],
  [
    'mines',
    'Mines',
    'Uncover safe squares and mark mines using adjacent counts.',
  ],
  [
    'lightup',
    'Light Up',
    'Place bulbs to illuminate every square without lighting another bulb.',
  ],
  [
    'bridges',
    'Bridges',
    'Connect islands with bridges matching each island’s number.',
  ],
  [
    'loopy',
    'Loopy',
    'Draw a single closed loop that satisfies every numbered clue.',
  ],
  [
    'blackbox',
    'Black Box',
    'Fire rays into a hidden box and deduce where the balls lie.',
  ],
  [
    'guess',
    'Guess',
    'Deduce a hidden colour combination from the feedback on each guess.',
  ],
  [
    'inertia',
    'Inertia',
    'Slide through the maze collecting gems while avoiding mines.',
  ],
  [
    'untangle',
    'Untangle',
    'Move graph vertices until none of the connecting lines cross.',
  ],
].map(([engine, title, description]) => ({
  id: `tatham-${engine}`,
  engine,
  title,
  description,
  numeric: ['solo', 'unequal', 'towers'].includes(engine),
}));
