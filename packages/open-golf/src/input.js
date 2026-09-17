export function normalizeInput({ axes = {}, buttons = {} } = {}) {
  const axis = (name) =>
    Number.isFinite(axes[name]) ? Math.max(-1, Math.min(1, axes[name])) : 0;
  const down = (name) => Number.isFinite(buttons[name]) && buttons[name] > 0.5;
  return {
    x:
      axis('moveX') ||
      axis('lookX') ||
      Number(down('right')) - Number(down('left')),
    y: axis('moveY') || Number(down('down')) - Number(down('up')),
    confirm: down('confirm') || down('rightTrigger'),
    cancel: down('cancel'),
    menu: down('menu'),
  };
}
export function decodeSave(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 8192)
    throw new Error('Invalid save size');
  const obj = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  );
  if (!obj || Array.isArray(obj) || typeof obj !== 'object')
    throw new Error('Invalid save object');
  for (const [key, value] of Object.entries(obj))
    if (
      !/^(seen_tutorial_[01]|stroke_count_level_(?:[0-9]|1[0-9]))$/.test(key) ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100000
    )
      throw new Error('Invalid progress');
  return bytes;
}
