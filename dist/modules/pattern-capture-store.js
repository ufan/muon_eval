// @ts-check
// Completed scientific inputs are immutable; only result.display is view state.
// Detach once per result/reference identity, then share the detached scientific
// arrays between repeated rows. JSON exports still contain complete rows.
export function createPatternCaptureStore() {
  let snapshots = new WeakMap();
  return {
    capture(result, references, label) {
      let saved = snapshots.get(result);
      if (!saved || saved.sourceReferences !== references) {
        saved = { sourceReferences: references, snapshot: structuredClone({ result, references }) };
        snapshots.set(result, saved);
      }
      const captured = { ...saved.snapshot.result };
      if (Object.hasOwn(result, 'display')) captured.display = structuredClone(result.display);
      return { label, result: captured, references: saved.snapshot.references };
    },
    clear() { snapshots = new WeakMap(); }
  };
}
