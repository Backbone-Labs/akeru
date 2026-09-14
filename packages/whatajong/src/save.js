/** Only the opening deck can be restored. Reject unsupported special/campaign state. */
export function validSave(s) {
  if (
    !s ||
    s.version !== 1 ||
    !Number.isSafeInteger(s.points) ||
    s.points < 0 ||
    s.points > 10000 ||
    !Array.isArray(s.tiles) ||
    s.tiles.length !== 54
  )
    return false;
  const ids = new Set(),
    positions = new Set(),
    cards = new Map();
  for (const t of s.tiles) {
    if (
      !t ||
      !/^([1-9]|[1-4][0-9]|5[0-4])$/.test(t.id) ||
      ids.has(t.id) ||
      !/^(bam|crack|dot)[1-9]$/.test(t.cardId) ||
      t.material !== 'bone' ||
      typeof t.deleted !== 'boolean' ||
      typeof t.selected !== 'boolean' ||
      (t.deleted && t.selected)
    )
      return false;
    if (
      ![t.x, t.y, t.z].every(Number.isSafeInteger) ||
      t.x < 0 ||
      t.x > 15 ||
      t.y < 0 ||
      t.y > 15 ||
      t.z < 0 ||
      t.z > 1
    )
      return false;
    const position = `${t.x},${t.y},${t.z}`;
    if (positions.has(position)) return false;
    ids.add(t.id);
    positions.add(position);
    cards.set(t.cardId, (cards.get(t.cardId) || 0) + 1);
  }
  return (
    cards.size === 27 &&
    [...cards.values()].every((n) => n === 2) &&
    s.tiles.filter((t) => t.selected).length <= 1 &&
    s.tiles.filter((t) => t.deleted).length % 2 === 0
  );
}
