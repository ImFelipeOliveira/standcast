import { isMap, isNode, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';

type Position = { line: number; column: number };

type Located = { key: unknown; value: unknown; lineCounter: LineCounter };

function walk(source: string, path: string): Located | null {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter });
  if (doc.errors.length > 0) return null;
  let key: unknown = null;
  let node: unknown = doc.contents;
  const segments = path === '' ? [] : path.split('.');
  for (const segment of segments) {
    if (isMap(node)) {
      const pair = node.items.find((p) => isScalar(p.key) && String(p.key.value) === segment);
      if (!pair) return null;
      key = pair.key;
      node = pair.value;
    } else if (isSeq(node)) {
      if (!/^\d+$/.test(segment)) return null;
      key = null;
      node = node.items[Number(segment)];
    } else {
      return null;
    }
  }
  return { key, value: node, lineCounter };
}

function positionOf(node: unknown, lineCounter: LineCounter): Position | null {
  if (!isNode(node) || !node.range) return null;
  const { line, col } = lineCounter.linePos(node.range[0]);
  return { line, column: col };
}

export function locateConfigPath(source: string, path: string): Position | null {
  const located = walk(source, path);
  return located ? positionOf(located.value, located.lineCounter) : null;
}

export function locateConfigKey(source: string, path: string): Position | null {
  const located = walk(source, path);
  return located ? positionOf(located.key, located.lineCounter) : null;
}
