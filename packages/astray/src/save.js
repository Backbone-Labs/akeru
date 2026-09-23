export function validSave(s) {
  return (
    !!s &&
    Object.keys(s).length === 4 &&
    Number.isInteger(s.dimension) &&
    s.dimension >= 11 &&
    s.dimension <= 51 &&
    s.dimension % 2 === 1 &&
    Array.isArray(s.maze) &&
    s.maze.length === s.dimension &&
    s.maze.every(
      (row) =>
        Array.isArray(row) &&
        row.length === s.dimension &&
        row.every((v) => typeof v === 'boolean'),
    ) &&
    Number.isFinite(s.x) &&
    Number.isFinite(s.y) &&
    s.x >= 0 &&
    s.y >= 0 &&
    s.x <= s.dimension &&
    s.y <= s.dimension
  );
}
