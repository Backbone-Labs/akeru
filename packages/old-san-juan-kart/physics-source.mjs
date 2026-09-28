/** Strip rendering construction from the same verified Kart source on both ends. */
export function headlessKart(source) {
  const code = source
    .replace(/^import .*model.*\n/m, '')
    .replace(/^import .*device.*\n/m, '');
  const start = code.indexOf('    const model = buildKart('),
    end = code.indexOf('    // --- state ---', start);
  if (start < 0 || end < 0) throw Error('Kart physics anchor changed');
  return (
    code.slice(0, start) +
    '    this.object = new THREE.Object3D();\n' +
    code.slice(end)
  );
}
