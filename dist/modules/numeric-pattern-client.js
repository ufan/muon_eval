import { numericPatternInput } from './numeric-pattern-work.js';
import { deferPatternWork } from './pattern-timing.js';
import { postPatternInputChunks } from './pattern-input-chunks.js';

export function createNumericPatternClient({ schedule } = {}) {
  let worker, nextId = 0, nextToken = 0, cache = new WeakMap(), tokens = new WeakMap();
  const jobs = new Map(), sent = new Map();
  return {
    read(result, graph, key, kind, options, ready) {
      let saved = cache.get(result); if (!saved) { saved = new Map(); cache.set(result, saved); }
      const existing = saved.get(key);
      if (existing?.error) throw new Error(existing.error);
      if (existing) return existing.entry || null;
      if (!worker) {
        worker = new Worker(new URL('./numeric-pattern-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          const job = jobs.get(data.id); if (!job) return; jobs.delete(data.id);
          job.saved.set(job.key, data.error ? { error: data.error } : { entry: data.entry }); job.ready();
        };
        worker.onerror = event => {
          worker?.terminate(); worker = null; sent.clear();
          const failed = [...jobs.values()]; jobs.clear();
          for (const job of failed) job.saved.set(job.key, { error: event.message || 'Numeric worker failed' });
          for (const job of failed) job.ready();
        };
      }
      let token = tokens.get(result); if (!token) { token = ++nextToken; tokens.set(result, token); }
      const id = ++nextId, sendInput = sent.get(graph) !== token, instance = worker;
      if (saved.size >= 32) saved.clear(); saved.set(key, { pending: true });
      jobs.set(id, { saved, key, ready });
      sent.set(graph, token);
      const current = () => jobs.has(id) && worker === instance;
      const failed = error => { jobs.delete(id); sent.delete(graph); saved.set(key, { error: error.message }); ready(); };
      deferPatternWork(`numeric-input:${graph}`, () => {
        try {
          const input = sendInput ? numericPatternInput(result) : undefined;
          const request = { id, token, graph, kind, options };
          if (input) { postPatternInputChunks(instance, request, input, { name: `numeric-submit:${graph}`, current, failed, schedule }); return; }
          deferPatternWork(`numeric-submit:${graph}`, () => {
            try { instance.postMessage({ id, token, graph, kind, options, input }); } catch (error) { failed(error); }
          }, current, schedule);
        } catch (error) { failed(error); }
      }, current, schedule);
      return null;
    },
    invalidate() { worker?.terminate(); worker = null; jobs.clear(); sent.clear(); cache = new WeakMap(); tokens = new WeakMap(); }
  };
}
