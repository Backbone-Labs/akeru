export function validSave(state) {
  return (
    state !== null &&
    typeof state === 'object' &&
    Number.isSafeInteger(state.best) &&
    state.best >= 0
  );
}
