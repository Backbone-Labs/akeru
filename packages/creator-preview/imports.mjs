import { parse } from 'espree';
/** Rewrite module specifiers, never matching example prose inside comments/strings. */
export function rewriteImports(code, resolve) {
  const ast = parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    range: true,
  });
  const edits = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
        'ImportExpression',
      ].includes(node.type) &&
      node.source
    ) {
      if (
        node.source.type !== 'Literal' ||
        typeof node.source.value !== 'string'
      )
        throw new Error('Computed title import is not supported');
      edits.push({
        range: node.source.range,
        text: JSON.stringify(resolve(node.source.value)),
      });
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(ast);
  for (const {
    range: [start, end],
    text,
  } of edits.sort((a, b) => b.range[0] - a.range[0]))
    code = code.slice(0, start) + text + code.slice(end);
  return code;
}
