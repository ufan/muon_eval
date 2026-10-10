import { loadDataset } from './dataset-loader.js';
import { loadCompiledMeshRuntime } from './compiled-mesh-runtime.js';
import { validateDerivedInterfaceArtifact } from './derived-interface-artifact.js';
import { sha256Portable } from './sha256.js';
import { prepareFiniteModelReferences, extractFiniteModelReferences } from './finite-model-references.js';
import { prepareReferenceViewLayers } from './reference-view-layers.js';
import { materialFieldFromProjection } from './projection-pattern-fields.js';
import { createPatternInputAssembler } from './pattern-input-chunks.js';
const assemble = createPatternInputAssembler();
let cached;
let preparationMetrics;
async function prepare(releaseId, scenarioId) {
  if (cached?.key === `${releaseId}/${scenarioId}`) { preparationMetrics = { cached: true }; return cached.prepared; }
  const start = performance.now(), stages = {}; let last = start;
  const mark = name => { const now = performance.now(); stages[name] = now - last; last = now; };
  const root = new URL('../data/derived-interfaces/', import.meta.url);
  const response = await fetch(new URL('manifest.json', root));
  if (!response.ok) throw new Error('Finite-model assets unavailable; run the documented preprocessing/package commands');
  const manifest = await response.json();
  if (manifest.version !== '1.0.0' || manifest.scope !== 'finite-model-not-certified-physical') throw new Error('Unknown finite reference manifest');
  const entry = manifest.entries.find(e => e.releaseId === releaseId && e.scenarioId === scenarioId);
  if (!entry || !/^[a-z0-9-]+\.interface\.v1\.json\.gz$/.test(entry.file)) throw new Error('No source-bound finite reference asset for this scenario');
  const compressedResponse = await fetch(new URL(entry.file, root));
  if (!compressedResponse.ok) throw new Error('Finite reference asset missing');
  const bytes = new Uint8Array(await compressedResponse.arrayBuffer());
  mark('fetch');
  if (bytes.length !== entry.byteLength || sha256Portable(bytes) !== entry.compressedSha256) throw new Error('Finite reference asset integrity failure');
  mark('compressedIntegrity');
  if (!globalThis.DecompressionStream) throw new Error('Browser lacks offline gzip decompression support');
  const decoded = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  mark('decompressParse');
  const dataset = await loadDataset(releaseId, new URL('../datasets/registry.json', import.meta.url).href), runtime = await loadCompiledMeshRuntime(dataset, scenarioId);
  mark('sourceRuntimeLoad');
  const domainFaces = Object.fromEntries(decoded.inputs.map(i => [i.componentId, i.domainFaceIds]));
  const artifact = validateDerivedInterfaceArtifact(decoded, { runtime, domainFaces, domainPolicy: entry.domainPolicy,
    sourceCaseId: entry.sourceCaseId, expectedSha256: entry.contentSha256 });
  mark('sourceBoundValidation');
  const prepared = prepareFiniteModelReferences(artifact);
  mark('connectivity');
  preparationMetrics = { cached: false, stages, totalMs: performance.now() - start,
    meshBufferBytes: artifact.mesh.positions.byteLength + artifact.mesh.indices.byteLength,
    edges: prepared.topology.edges.length, triangles: artifact.mesh.indices.length / 3 };
  cached = { key: `${releaseId}/${scenarioId}`, prepared };
  return prepared;
}
// Serialized to avoid duplicate cold validation. UI request identities discard
// superseded poses; scenario changes terminate this worker and its cache.
let queue = Promise.resolve();
self.onmessage = event => {
  let request;
  try { request = assemble(event.data); } catch (error) { self.postMessage({ id: event.data.id, error: error.message }); return; }
  if (!request) return;
  queue = queue.catch(() => {}).then(async () => {
    try {
      const prepared = await prepare(request.snapshot.inputs.datasetRelease, request.snapshot.inputs.scenario);
      const start = performance.now();
      const overlays = extractFiniteModelReferences(prepared, request);
      const extractionMs = performance.now() - start, mappingStart = performance.now();
      // Accept the prior validated-field payload for already-open preview pages.
      const fields = request.fields ?? request.materials.map(material => materialFieldFromProjection(request.input, material));
      const allLayers = prepareReferenceViewLayers(overlays, fields, request.grid.sx.length);
      self.postMessage({ id: request.id, snapshotKey: request.snapshot.key, overlays, allLayers,
        performance: { preparation: preparationMetrics, extractionMs, mappingMs: performance.now() - mappingStart } });
    } catch (error) { self.postMessage({ id: request.id, error: error.message }); }
  });
};
