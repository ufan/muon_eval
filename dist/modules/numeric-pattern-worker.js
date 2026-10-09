// @ts-check
import { prepareNumericPattern } from './numeric-pattern-work.js';
import { createPatternInputAssembler } from './pattern-input-chunks.js';
const inputs = new Map();
const assemble = createPatternInputAssembler(), waiting = [];
function run(data) {
  try {
    if (data.input) inputs.set(data.graph, { token: data.token, result: data.input });
    const stored = inputs.get(data.graph);
    if (!stored || stored.token !== data.token) { waiting.push(data); return; }
    const start = performance.now(), entry = prepareNumericPattern(data.kind, stored.result, data.options);
    self.postMessage({ id: data.id, entry, performance: { numericKind: data.kind, graph: data.graph, numericPreparationMs: performance.now() - start } });
  } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
}
self.onmessage = ({ data }) => {
  try {
    const request = assemble(data); if (!request) return;
    run(request);
    if (request.input) {
      const ready = waiting.splice(0);
      for (const job of ready) run(job);
    }
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
    for (const job of waiting.splice(0)) self.postMessage({ id: job.id, error: error.message });
  }
};
