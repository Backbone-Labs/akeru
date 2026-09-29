export const validSave = (s) =>
  !!s &&
  Object.keys(s).length === 1 &&
  Number.isFinite(s.best) &&
  s.best >= 0 &&
  s.best <= 86400000;
