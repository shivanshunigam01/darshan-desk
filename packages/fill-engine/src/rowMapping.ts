import { countLivePilgrimRows } from './livePilgrimFill.js';

/** Resolve visible DOM row index for each stable pilgrim id (falls back to sequential visible blocks). */
export function mapPilgrimRowsById(doc: Document, pilgrimIds: string[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const id of pilgrimIds) {
    const safeId = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const byId = doc.querySelector(`[data-dd-pilgrim-id="${safeId}"]`);
    if (byId) {
      const idx = byId.getAttribute('data-pilgrim-index');
      if (idx != null && idx !== '') {
        map.set(id, Number(idx));
        continue;
      }
    }
  }

  const blocks = Array.from(doc.querySelectorAll('[data-pilgrim-index]')).sort(
    (a, b) => Number(a.getAttribute('data-pilgrim-index')) - Number(b.getAttribute('data-pilgrim-index'))
  );

  let blockCursor = 0;
  for (const id of pilgrimIds) {
    if (map.has(id)) continue;
    while (blockCursor < blocks.length) {
      const idx = Number(blocks[blockCursor].getAttribute('data-pilgrim-index'));
      blockCursor++;
      if (!Number.isFinite(idx)) continue;
      const taken = [...map.values()].includes(idx);
      if (!taken) {
        map.set(id, idx);
        break;
      }
    }
    if (!map.has(id)) {
      map.set(id, map.size);
    }
  }

  return map;
}

export function countVisiblePilgrimBlocks(doc: Document): number {
  const mock = doc.querySelectorAll('[data-pilgrim-index]').length;
  if (mock > 0) return mock;
  return countLivePilgrimRows(doc);
}