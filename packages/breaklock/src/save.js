const pattern = (p) =>
  Array.isArray(p) &&
  p.length <= 4 &&
  new Set(p).size === p.length &&
  p.every((n) => Number.isInteger(n) && n >= 0 && n <= 8);
export function validSave(s) {
  return (
    !!s &&
    Object.keys(s).length === 4 &&
    pattern(s.secret) &&
    s.secret.length === 4 &&
    pattern(s.current) &&
    Array.isArray(s.history) &&
    s.history.length <= 100 &&
    s.history.every((p) => pattern(p) && p.length === 4) &&
    Number.isSafeInteger(s.wins) &&
    s.wins >= 0 &&
    s.wins <= 1000000
  );
}
