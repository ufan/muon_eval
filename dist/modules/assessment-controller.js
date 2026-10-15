// Application scheduling knows only snapshots, the assessment port and publication callbacks.

const abortError = () => new DOMException('Assessment cancelled', 'AbortError');

// Assessment port (ADR-006): open(input) binds one snapshot to one geometry context;
// evaluate(quality, { signal, onProgress }) returns a Promise of that pass's result and
// rejects with an AbortError when cancelled. This local adapter steps today's
// synchronous session in small batches between scheduler ticks; a worker or server
// port implements the same interface.
export function createLocalAssessmentPort(assessment, { scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) } } = {}) {
  return Object.freeze({
    open(input) {
      const session = assessment.createSession(input);
      return Object.freeze({
        cloud: () => session.cloud?.() ?? null, quickMetrics: () => session.quickMetrics?.() ?? null,
        ensureTargetSignificance: (data, id) => session.ensureTargetSignificance?.(data, id),
        evaluate(quality, { signal, onProgress = () => {} } = {}) {
          if (!['preview', 'final'].includes(quality)) throw new Error(`Unknown assessment quality ${quality}`);
          return new Promise((resolve, reject) => {
            if (signal?.aborted) { reject(abortError()); return; }
            const work = session.projection(quality), rows = quality === 'preview' ? 5 : 3;
            let timer = null;
            const stop = () => { if (timer !== null) scheduler.clear(timer); timer = null; reject(abortError()); };
            signal?.addEventListener('abort', stop, { once: true });
            const batch = () => {
              timer = null;
              if (signal?.aborted) return;
              try {
                const state = work.advance(rows);
                if (!state.done) { onProgress(state.progress); timer = scheduler.set(batch, 0); return; }
                signal?.removeEventListener('abort', stop);
                resolve(work.complete(state.result));
              } catch (error) { signal?.removeEventListener('abort', stop); reject(error); }
            };
            timer = scheduler.set(batch, 0);
          });
        }
      });
    }
  });
}

export function createAssessmentController({ assessment, port, readInputs, onStart = () => {}, onQuick = () => {}, onProgress = () => {}, onResult = () => {}, onInvalidate = () => {}, onError = () => {}, delayMs = 160, scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) } }) {
  port ??= createLocalAssessmentPort(assessment, { scheduler });
  let generation = 0, timer = null, abort = null, session = null, result = null, disposed = false;
  function invalidate() {
    generation++; abort?.abort(); abort = null;
    if (timer !== null) scheduler.clear(timer);
    timer = null; session = result = null; onInvalidate();
  }
  function run() {
    if (disposed) return;
    invalidate();
    const job = generation, controller = new AbortController(), current = () => job === generation && !disposed;
    abort = controller;
    let input;
    try {
      input = structuredClone(readInputs()); session = port.open(input); onStart(input);
      if (!current()) return;
      onQuick({ cloud: session.cloud(), metrics: session.quickMetrics() }, input);
      if (!current()) return;
    } catch (error) { invalidate(); onError(error); return; }
    const opened = session;
    (async () => {
      for (const quality of ['preview', 'final']) {
        const next = await opened.evaluate(quality, { signal: controller.signal, onProgress: progress => { if (current()) onProgress({ quality, progress }); } });
        if (!current()) return;
        result = next; onResult(next, input);
        if (!current()) return;
      }
    })().catch(error => {
      if (error?.name === 'AbortError' || !current()) return;
      invalidate(); onError(error);
    });
  }
  return Object.freeze({
    run,
    schedule() { if (disposed) return; invalidate(); timer = scheduler.set(() => { timer = null; run(); }, delayMs); },
    ensureTargetSignificance(data, id) { if (data === result) session?.ensureTargetSignificance(data, id); },
    dispose() { disposed = true; invalidate(); }
  });
}
