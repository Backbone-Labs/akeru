export function validateSave(value, config) {
  return !!(
    value &&
    value.schemaVersion === 1 &&
    value.engine === config.engine &&
    typeof value.data === 'string' &&
    value.data.length < 524288 &&
    value.data.startsWith(
      "SAVEFILE:41:Simon Tatham's Portable Puzzle Collection\nVERSION :1:1\n",
    ) &&
    value.data.includes(
      `\nGAME    :${String(config.title.length)}:${config.title}\n`,
    ) &&
    /^NSTATES :\d+:\d+$/m.test(value.data) &&
    /^STATEPOS:\d+:\d+$/m.test(value.data)
  );
}
