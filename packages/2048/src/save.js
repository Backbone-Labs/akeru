export function validSave(state) {
  return (
    state !== null &&
    typeof state === 'object' &&
    Number.isSafeInteger(state.score) &&
    state.score >= 0 &&
    ['over', 'won', 'keepPlaying'].every(
      (k) => typeof state[k] === 'boolean',
    ) &&
    state.grid?.size === 4 &&
    Array.isArray(state.grid.cells) &&
    state.grid.cells.length === 4 &&
    state.grid.cells.every(
      (column, x) =>
        Array.isArray(column) &&
        column.length === 4 &&
        column.every(
          (tile, y) =>
            tile === null ||
            (Number.isSafeInteger(tile?.value) &&
              tile.value >= 2 &&
              tile.value <= 2 ** 30 &&
              Math.log2(tile.value) % 1 === 0 &&
              tile.position?.x === x &&
              tile.position?.y === y),
        ),
    )
  );
}
