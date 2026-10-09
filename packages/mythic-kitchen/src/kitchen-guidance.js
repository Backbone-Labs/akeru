// Presentation only: authoritative simulation state remains owned by the game/server.
const onion = (item) => item?.kind === 'ingredient' && item.type === 'onion';
const cleanPlate = (item) =>
  item?.kind === 'plate' && !item.dirty && !item.contents.length;
const soupPlate = (item) =>
  item?.kind === 'plate' &&
  item.contents.some((i) => i.kind === 'soup' && i.type === 'onion');
const instruction = (step, title, detail, target) => ({
  step,
  title,
  detail,
  target,
});
export function soupGuidance(state, player, levelId) {
  if (levelId !== 'castle-1' || !player) return null;
  const tiles = state.tiles;
  const find = (type) => tiles.find((t) => t.type === type);
  const held = player.held;
  const fire = tiles.find((t) => t.onFire);
  if (fire)
    return instruction(
      '!',
      'Put out the fire',
      held?.kind === 'extinguisher'
        ? 'Face the flames · hold {X} to spray.'
        : 'Pick up the extinguisher with {A}, then hold {X} at the fire.',
      held?.kind === 'extinguisher' ? fire : find('extinguisher'),
    );
  if (soupPlate(held))
    return instruction(
      6,
      'Serve your soup',
      'Take the plate to ORDER UP! · press {A}.',
      find('delivery'),
    );
  if (held?.kind === 'pot')
    return instruction(
      3,
      'Keep the pot on the stove',
      'Face an empty stove · press {A} to put it back.',
      tiles.find((t) => t.type === 'stove' && !t.item),
    );
  const pots = tiles.filter((t) => t.item?.kind === 'pot');
  const burnt = pots.find((t) => t.item.state === 'burnt');
  if (burnt)
    return instruction(
      '!',
      'Start a fresh pot',
      'Lift the burnt pot with {A}, empty it in the bin, then return it to the stove.',
      burnt,
    );
  const plated = tiles.find((t) => soupPlate(t.item));
  if (plated && !held)
    return instruction(
      6,
      'Your soup is ready to serve',
      'Pick up the filled plate with {A}, then take it to ORDER UP!',
      plated,
    );
  const cooked = pots.find((t) => t.item.state === 'cooked');
  const cooking = pots.find((t) => t.item.state === 'cooking');
  const plateSource =
    tiles.find((t) => cleanPlate(t.item)) ??
    tiles.find((t) => t.type === 'plates' && t.count !== 0) ??
    tiles.find((t) => t.type === 'sink' && t.clean > 0);
  if (cooked) {
    if (cleanPlate(held))
      return instruction(
        5,
        'Plate the soup before it burns',
        'Hold your plate, face the cooked pot · press {A} to fill it.',
        cooked,
      );
    if (held)
      return instruction(
        5,
        'Make room for a clean plate',
        'Put your item on an empty counter with {A}. Soup needs a clean plate.',
        tiles.find((t) => t.type === 'counter' && !t.item),
      );
    if (plateSource)
      return instruction(
        5,
        'Get a clean plate',
        'Pick up a plate with {A}, then press {A} at the cooked pot.',
        plateSource,
      );
    return instruction(
      5,
      'Wash a plate for your soup',
      'Put a dirty plate in the sink with {A} · hold {X} to wash.',
      find('sink'),
    );
  }
  if (held?.kind === 'plate' && held.dirty)
    return instruction(
      5,
      'Wash this plate',
      'Place it in the sink with {A}, then hold {X}.',
      find('sink'),
    );
  if (cooking)
    return instruction(
      4,
      'Cooking automatically',
      cleanPlate(held)
        ? 'Wait for the pot to finish, then press {A} to fill your plate.'
        : `${Math.max(1, Math.ceil((1 - cooking.item.progress) * 9))}s to go · get a clean plate with {A} while it cooks.`,
      cleanPlate(held) ? cooking : (plateSource ?? find('sink')),
    );
  if (cleanPlate(held))
    return instruction(
      1,
      'Set your plate aside for now',
      'Press {A} at an empty counter. First, chop three onions.',
      tiles.find((t) => t.type === 'counter' && !t.item),
    );
  if (held?.kind === 'extinguisher')
    return instruction(
      1,
      'Set the extinguisher down',
      'Press {A} at an empty counter so you can pick up an onion.',
      tiles.find((t) => t.type === 'counter' && !t.item),
    );
  const pot = pots
    .filter((t) => t.item.state === 'empty')
    .sort((a, b) => b.item.contents.length - a.item.contents.length)[0];
  const count = pot?.item.contents.length ?? 0;
  if (onion(held) && held.state === 'chopped')
    return instruction(
      3,
      `Fill one pot · ${count}/3 onions`,
      'Face the stove · press {A} to add this chopped onion. All three go in the same pot.',
      pot,
    );
  const board = tiles.find(
    (t) => t.type === 'cutting' && onion(t.item) && t.item.state === 'raw',
  );
  if (onion(held))
    return instruction(
      2,
      'Put the onion on a chopping board',
      'Face an empty board · press {A} to put it down, then hold {X}.',
      tiles.find((t) => t.type === 'cutting' && !t.item),
    );
  if (board)
    return instruction(
      2,
      'Chop the onion',
      'Stand facing the board · hold {X} until chopping finishes.',
      board,
    );
  const chopped = tiles.find(
    (t) => onion(t.item) && t.item.state === 'chopped',
  );
  if (chopped)
    return instruction(
      3,
      `Fill one pot · ${count}/3 onions`,
      'Pick up the chopped onion with {A}, then press {A} at the pot.',
      chopped,
    );
  return instruction(
    1,
    count
      ? `Add ${3 - count} more chopped onion${count === 2 ? '' : 's'}`
      : 'Pick up an onion',
    count
      ? `${count}/3 in the pot. Get another onion with {A}, chop it, and use the same pot.`
      : 'Go to the onion crate · press {A}. You need three chopped onions per soup.',
    tiles.find((t) => t.type === 'crate' && t.ingredient === 'onion'),
  );
}
export function stationHint(tile, player) {
  if (!tile || !player) return null;
  const held = player.held,
    item = tile.item;
  if (tile.onFire)
    return held?.kind === 'extinguisher'
      ? 'Hold {X} · Extinguish'
      : 'Get the extinguisher';
  if (
    tile.type === 'cutting' &&
    !held &&
    item?.kind === 'ingredient' &&
    item.state === 'raw'
  )
    return 'Hold {X} · Chop';
  if (tile.type === 'sink') {
    if (held?.kind === 'plate' && held.dirty) return '{A} · Put plate in sink';
    if (!held && tile.dirty > 0) return 'Hold {X} · Wash';
    if (!held && tile.clean > 0) return '{A} · Take clean plate';
  }
  if (tile.type === 'crate' && !held) return `{A} · Take ${tile.ingredient}`;
  if (tile.type === 'plates' && !held && tile.count !== 0)
    return '{A} · Take plate';
  if (
    tile.type === 'delivery' &&
    held?.kind === 'plate' &&
    held.contents.length
  )
    return '{A} · Serve';
  if (item?.kind === 'pot' || item?.kind === 'pan') {
    if (item.state === 'cooked' && cleanPlate(held)) return '{A} · Fill plate';
    if (item.state === 'cooking') return 'Cooking… get a clean plate';
    if (item.state === 'cooked') return 'Ready! Bring a clean plate';
    if (
      held?.kind === 'ingredient' &&
      held.state === 'chopped' &&
      item.state === 'empty'
    )
      return '{A} · Add ingredient';
    if (held?.kind === 'ingredient' && held.state === 'raw')
      return 'Chop it first';
  }
  if (tile.type === 'trash' && held) return '{A} · Empty into bin';
  if (
    ['counter', 'cutting', 'extinguisher', 'stove', 'return'].includes(
      tile.type,
    )
  ) {
    if (!held && item) return '{A} · Pick up';
    if (held && !item && tile.type !== 'return') return '{A} · Put down';
  }
  return null;
}
