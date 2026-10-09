// @ts-check
import { createImmutablePatternComparisonEvaluator } from './pattern-comparison.js';
const entries = new Map(), compare = createImmutablePatternComparisonEvaluator();
self.onmessage = ({ data }) => {
  try {
    if (data.kind === 'add') {
      if (!entries.has(data.id) && entries.size >= 20) throw new Error('At most 20 comparison rows');
      entries.set(data.id, data.result); return;
    }
    if (!Array.isArray(data.ids) || data.ids.length > 20) throw new Error('At most 20 comparison rows');
    const results = data.ids.map(id => { if (!entries.has(id)) throw new Error('Missing comparison input'); return entries.get(id); });
    for (const id of entries.keys()) if (!data.ids.includes(id)) entries.delete(id);
    const start = performance.now(), comparison = compare(results, data.selection);
    self.postMessage({ revision: data.revision, comparison: { ...comparison,
      rows: comparison.rows.map(({ snapshot, indicators }) => ({ snapshot, indicators })) },
      performance: { comparisonSummaryMs: performance.now() - start, rows: results.length } });
  } catch (error) { self.postMessage({ revision: data.revision, error: error.message }); }
};
