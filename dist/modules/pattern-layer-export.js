import { prepareProjectionPattern } from './projection-pattern-fields.js';
import { createContributionExport, replayContributionExport } from './contribution-export.js';
import { responsePattern } from './response-patterns.js';
import { createPatternOverlay } from './projection-pattern-contract.js';
import { sha256Portable } from './sha256.js';
import { prepareFiniteModelReferences, extractFiniteModelReferences } from './finite-model-references.js';
const sha = value => sha256Portable(new TextEncoder().encode(JSON.stringify(value)));
export function createPatternLayerExport(result, { references = [], contributionSelection, responseOptions = null }, display = {}) {
  const { snapshot } = prepareProjectionPattern(result);
  const curves = references.map(reference => {
    const checked = createPatternOverlay(reference);
    if (checked.snapshot.key !== snapshot.key || checked.semantic !== 'structural-reference'
      || checked.settings.scope !== 'finite-model-not-certified-physical' || checked.provenance.complete
      || checked.provenance.physicalScope !== 'unresolved' || checked.provenance.lineSources.length !== checked.lines.length
      || checked.provenance.lineSources.some(s => s.sourceEntityId !== null)
      || !/^[a-f0-9]{64}$/.test(checked.settings.sourceContentSha256)
      || checked.source.id !== checked.settings.sourceContentSha256) throw new Error('Invalid finite reference provenance');
    return checked;
  });
  const body = { schemaVersion: '1.0.0', kind: 'projection-pattern-layers', result: structuredClone(result), snapshot,
    contribution: createContributionExport(result, contributionSelection), references: curves,
    response: responseOptions ? responsePattern(result, responseOptions) : null, responseOptions: structuredClone(responseOptions),
    display: structuredClone(display), warnings: ['Finite-model references only; known caps excluded, remaining physical scope and canonical aggregate entities unresolved.',
      'Numerical fields replay from stored raw results; native structural reconstruction additionally requires the pinned derived artifact.',
      'Integrity is not authentication, survey accuracy, calibrated detector response or measured-muogram support.'] };
  return { ...body, contentSha256: sha(body) };
}
export function replayPatternLayerExport(document, { referenceArtifact } = {}) {
  const { contentSha256, ...body } = document;
  if (body.schemaVersion !== '1.0.0' || body.kind !== 'projection-pattern-layers' || sha(body) !== contentSha256) throw new Error('Unknown or altered pattern layer export');
  replayContributionExport(body.contribution);
  const replay = createPatternLayerExport(body.result, { references: body.references, contributionSelection: body.contribution.selection,
    responseOptions: body.responseOptions }, body.display);
  if (JSON.stringify(replay) !== JSON.stringify(document)) throw new Error('Pattern field/settings/curve replay mismatch');
  if (referenceArtifact) {
    const prepared = prepareFiniteModelReferences(referenceArtifact), { snapshot, grid } = prepareProjectionPattern(body.result);
    for (const reference of body.references) {
      const curves = extractFiniteModelReferences(prepared, { snapshot, grid, materials: [reference.settings.material],
        featureAngleDeg: reference.settings.featureAngleDeg, includeCreases: reference.settings.includeCreases, nearDepthM: reference.settings.nearDepthM });
      if (JSON.stringify(curves[0]) !== JSON.stringify(reference)) throw new Error('Pinned artifact/reference reconstruction mismatch');
    }
  }
  return { document: replay, referenceVerification: referenceArtifact ? 'reconstructed-from-source-bound-artifact' : 'stored-integrity-only' };
}
