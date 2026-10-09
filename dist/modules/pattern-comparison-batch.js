import { evaluateCompiledAssessment } from './compiled-assessment.js';
import { comparePatternResults } from './pattern-comparison.js';
// Small explicit site/pose batches only; not an optimizer or access/safety scan.
export async function evaluatePatternComparisonBatch(runtime, configs, device, response, selection,
  { signal, yieldTask = () => Promise.resolve(), onProgress = () => {}, levels = [.01, .1, .5, .9] } = {}) {
  if (!Array.isArray(configs) || !configs.length) throw new Error('Explicit batch configurations required');
  const frozen = structuredClone({ configs, device, response, selection, levels }), results = [];
  const check = () => { if (signal?.aborted) throw new DOMException('Pattern batch cancelled', 'AbortError'); };
  for (const config of frozen.configs) {
    check();
    const index = results.length;
    const result = await evaluateCompiledAssessment(runtime, config, frozen.device, frozen.response,
      { signal, yieldTask, onProgress: fraction => onProgress((index + fraction) / frozen.configs.length) });
    check(); results.push(result);
  }
  check(); return { results, comparison: comparePatternResults(results, frozen.selection, frozen.levels) };
}
