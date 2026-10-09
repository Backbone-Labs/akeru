/** A title-local synchronous facade over asynchronous host-owned saves. */
export function validStorage(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length <= keys.length &&
    Object.entries(value).every(
      ([k, v]) =>
        keys.includes(k) && typeof v === 'string' && v.length <= 131072,
    )
  );
}
export function createStorage(keys, changed) {
  let values = Object.create(null);
  return {
    hydrate(value) {
      if (value !== null && !validStorage(value, keys))
        throw new Error('Invalid creator save');
      values = Object.assign(Object.create(null), value ?? {});
    },
    serialize: () => ({ ...values }),
    getItem: (k) => values[k] ?? null,
    setItem(k, v) {
      if (!keys.includes(k) || typeof v !== 'string' || v.length > 131072)
        throw new Error('Unsupported title storage');
      if (values[k] !== v) {
        values[k] = v;
        changed();
      }
    },
    removeItem(k) {
      if (keys.includes(k) && Object.hasOwn(values, k)) {
        delete values[k];
        changed();
      }
    },
  };
}
