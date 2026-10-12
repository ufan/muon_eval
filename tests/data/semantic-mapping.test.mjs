import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSemanticMappings } from '../../dist/modules/semantic-mapping.js';
import { loadCompiledMeshRuntime } from '../../dist/modules/compiled-mesh-runtime.js';
import { createCompiledGeometryView } from '../../dist/modules/compiled-geometry-view.js';
import { evaluateMaterialProjection } from '../../dist/modules/material-projection.js';
import { evaluateCompiledAssessment } from '../../dist/modules/compiled-assessment.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from '../../dist/modules/detector-defaults.js';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';

const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');

test('all scenarios preserve 22 directly mapped targets and explicitly unresolved material aggregates', async () => {
  for (const id of ['low', 'mid', 'high', 'extreme']) {
    const runtime = await loadCompiledMeshRuntime(dataset, id), audit = runtime.semanticAudit;
    assert.equal(audit.targets.length, 22);
    assert.deepEqual(audit.unresolvedComponents, ['concrete', 'rock', 'steel_gates']);
    assert.equal(audit.unmappedPhysicalEntities.length, 22);
    for (const target of audit.targets) {
      assert.ok(dataset.geometry.entities.has(target.id) || dataset.geometry.waterBodies.has(target.id));
      assert.equal(target.significanceAvailable, false);
      for (const componentId of target.componentIds) {
        const component = runtime.components.find(component => component.componentId === componentId);
        assert.equal(component.metadata.source_entity_id, target.id);
        assert.deepEqual(component.sourceEntityIds, [target.id]);
      }
    }
    for (const aggregate of audit.unresolvedComponents) assert.deepEqual(runtime.components.find(c => c.componentId === aggregate).sourceEntityIds, []);
    assert.ok(!audit.targets.some(target => target.id === 'bank_platform_N' || target.id.startsWith('marker:')));
  }
});

test('target queries, ray entity lengths, classification and picking metadata use the same IDs', async () => {
  const runtime = await loadCompiledMeshRuntime(dataset, 'low'), view = createCompiledGeometryView(runtime);
  const origin = dataset.geometry.coordinates.pointToModel(dataset.candidates.candidates[0].example_position);
  const direction = [-Math.sqrt(3) / 2, 0, .5], length = 700;
  const trace = runtime.traceRayModel(origin, direction, length);
  for (const target of runtime.semanticAudit.targets) {
    const queried = runtime.traceTargetRayModel(target.id, origin, direction, length);
    assert.equal(queried.semanticLength, trace.entityLengths[target.id] || 0);
    const sum = queried.segments.reduce((total, segment) => total + segment.t1 - segment.t0, 0);
    assert.ok(Math.abs(sum - queried.semanticLength) < 1e-8);
    assert.ok(queried.segments.every(segment => segment.entityIds.includes(target.id)));
    for (const componentId of target.componentIds) assert.equal(view.meshes.get(componentId).userData.semanticRecord.sourceEntityId, target.id);
  }
  assert.ok(Object.keys(trace.entityLengths).length > 0);
  const classified = runtime.classifyModel(origin);
  assert.ok(classified.entityIds.length > 0);
  for (const id of classified.entityIds) assert.ok(runtime.semanticAudit.targets.some(target => target.id === id));
  view.setOverlays({ air: true, virtual: true });
  for (const mesh of view.meshes.values()) mesh.visible = false;
  assert.deepEqual(runtime.traceRayModel(origin, direction, length), trace);
  assert.throws(() => runtime.traceTargetRayModel('steel_gates', origin, direction, length), /Unmapped/);
  assert.throws(() => runtime.traceTargetRayModel('bank_platform_N', origin, direction, length), /Unmapped/);
  view.dispose();
});

test('material and count pixel masks retain exact compiled semantic lengths and audit provenance', async () => {
  const runtime = await loadCompiledMeshRuntime(dataset, 'high');
  const origin = dataset.geometry.coordinates.pointToModel(dataset.candidates.candidates[0].example_position);
  const config = { origin, azimuthDeg: 180, elevationDeg: 30, halfAngleDeg: 30, bins: 3, length: 700 };
  const material = await evaluateMaterialProjection(runtime, config);
  const counts = await evaluateCompiledAssessment(runtime, config, defaultAssessmentDevice(), defaultAssessmentResponse());
  for (const result of [material, counts]) {
    assert.deepEqual(result.semanticAudit, runtime.semanticAudit);
    for (const pixel of result.pixels) {
      const direct = runtime.traceRayModel(origin, pixel.direction, config.length);
      assert.deepEqual(pixel.targetLengths, direct.entityLengths);
      for (const target of runtime.semanticAudit.targets) {
        assert.equal((pixel.targetLengths[target.id] || 0) > runtime.semanticAudit.maskThresholdM,
          (runtime.traceTargetRayModel(target.id, origin, pixel.direction, config.length).semanticLength) > runtime.semanticAudit.maskThresholdM);
      }
    }
  }
});

test('conflicting attribution and physical virtual entities fail closed; names cannot create mappings', () => {
  const metadata = { source_entity_id: 'gallery_upper', semantics_ref: 'elevator_shaft', flags: { physics: true }, role: 'void' };
  assert.throws(() => auditSemanticMappings([{ componentId: 'gallery_upper', metadata }], dataset.geometry), /Conflicting/);
  assert.throws(() => auditSemanticMappings([{ componentId: 'proxy', metadata: { ...metadata, source_entity_id: 'bank_platform_N', semantics_ref: 'bank_platform_N' } }], dataset.geometry), /Virtual/);
  const audit = auditSemanticMappings([{ componentId: 'gallery_upper', semantics: { class: 'gallery' }, metadata: {
    source_entity_id: 'missing', flags: { physics: true }, role: 'void' } }], dataset.geometry);
  assert.equal(audit.targets.length, 0); assert.equal(audit.records[0].sourceEntityId, null);
});
