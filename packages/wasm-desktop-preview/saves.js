// Only files inside this title's private user directory cross the host save boundary.
export function validSave(s) {
  return (
    !!s &&
    Object.keys(s).length === 1 &&
    Array.isArray(s.files) &&
    s.files.length <= 128 &&
    new Set(s.files.map((f) => f?.path)).size === s.files.length &&
    s.files.every(
      (f) =>
        f &&
        Object.keys(f).length === 2 &&
        typeof f.path === 'string' &&
        /^[a-zA-Z0-9_. /-]{1,180}$/.test(f.path) &&
        !f.path.startsWith('/') &&
        f.path.split('/').every((p) => p && p !== '.' && p !== '..') &&
        typeof f.data === 'string' &&
        f.data.length <= 131072 &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          f.data,
        ),
    ) &&
    JSON.stringify(s).length <= 524288
  );
}
export function restore(FS, root, state) {
  if (!state) return;
  if (!validSave(state)) throw new Error('Invalid title save');
  for (const f of state.files) {
    const path = root + '/' + f.path;
    FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    FS.writeFile(
      path,
      Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0)),
    );
  }
}
export function snapshot(FS, root) {
  const files = [];
  function walk(dir) {
    for (const name of FS.readdir(dir).filter((n) => n !== '.' && n !== '..')) {
      if (/\.log(?:\.\d+)?$/.test(name) || name === '.cache') continue;
      const path = dir + '/' + name,
        stat = FS.lstat(path);
      if (FS.isDir(stat.mode)) walk(path);
      else if (FS.isFile(stat.mode)) {
        if (stat.size > 98304 || files.length >= 128)
          throw new Error('Title save exceeds limit');
        const bytes = FS.readFile(path);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        files.push({ path: path.slice(root.length + 1), data: btoa(binary) });
      }
    }
  }
  if (FS.analyzePath(root).exists) walk(root);
  const state = { files };
  if (!validSave(state)) throw new Error('Title save exceeds limit');
  return state;
}
