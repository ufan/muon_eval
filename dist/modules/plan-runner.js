// Headless batch runner core (FR-S5, ADR-006): turns a plan into assessment inputs and
// describes a finished run. Pure: no file system, workers or dataset loading, so the CLI
// (scripts/run-plan.mjs) and a future server worker share it with the browser.
import { migratePlan, planHash } from './plan-format.js';
import { defaultDeviceConfiguration, applyDeviceConfiguration } from './device-configuration.js';

export const RUN_SUMMARY_FORMAT = 'muography-plan-run';
export const RUN_SUMMARY_VERSION = '1.0.0';
export const QUALITY_BINS = Object.freeze({ preview: 25, final: 65 });

// `which`: 'all', { deployment: id } (its members, in the deployment's order), or a list of station ids.
export function selectPlanStations(plan, which = 'all') {
  plan = migratePlan(plan);
  const byId = new Map(plan.stations.map(s => [s.id, s]));
  if (which === 'all') return plan.stations;
  if (typeof which?.deployment === 'string') {
    const deployment = plan.deployments.find(d => d.id === which.deployment);
    if (!deployment) throw new Error(`Deployment ${which.deployment} is not in the plan`);
    if (!deployment.stations.length) throw new Error(`Deployment ${which.deployment} has no stations`);
    return deployment.stations.map(id => byId.get(id));
  }
  if (!Array.isArray(which)) throw new Error(`Unknown station choice ${which}`);
  return which.map((id, i) => {
    if (!byId.has(id)) throw new Error(`Station ${id} is not in the plan`);
    if (which.indexOf(id) !== i) throw new Error(`Station ${id} is listed twice`);
    return byId.get(id);
  });
}

// Device parameters go through the app's one configuration path (derived values recomputed).
function detectorConfiguration({ device, response }) {
  const configuration = applyDeviceConfiguration(defaultDeviceConfiguration(), { ...device, ...response });
  return { device: { ...configuration.device, model: device.model }, response: configuration.response };
}

// One input per station, in the shape the assessment port takes (deployment-state snapshot).
export function planAssessmentInputs(plan, { environment, stations = 'all' }) {
  plan = migratePlan(plan);
  const hash = planHash(plan);
  return selectPlanStations(plan, stations).map(s => {
    const { device, response } = detectorConfiguration(plan.detectors[s.detector]);
    return { stationId: s.id, name: s.name, input: {
      station: { id: s.id, name: s.name, x: s.position[0], y: s.position[1], z: s.position[2],
        az: s.pose.azimuthDeg, el: s.pose.elevationDeg, candidateId: s.candidateId },
      device, response, environment: structuredClone(environment), plan: { hash, stationId: s.id } } };
  });
}

export function resultFileName(stationId) {
  if (typeof stationId !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(stationId) || /^\.+$/.test(stationId)) throw new Error('Invalid station id for a file name');
  return `${stationId}.result.json`;
}

// Summary of a run. No clock or host data, so the same plan, release and code give the same bytes.
// `stations`: [{ stationId, name, file, sha256, result }] in run order; `comparison`: file name or null.
export function planRunSummary({ plan, quality, stations, comparison = null }) {
  plan = migratePlan(plan);
  const hash = planHash(plan), bins = QUALITY_BINS[quality];
  if (!bins) throw new Error(`Unknown quality ${quality}`);
  const results = stations.map(s => s.result), scenario = results[0]?.scenarioId ?? null;
  for (const { stationId, result } of stations) {
    if (result.plan?.hash !== hash || result.plan.stationId !== stationId) throw new Error(`Result for ${stationId} belongs to another plan or station`);
    if (result.scenarioId !== scenario || (plan.scene.scenario !== null && result.scenarioId !== plan.scene.scenario)) throw new Error(`Result for ${stationId} has another scenario`);
    if (result.config.bins !== bins) throw new Error(`Result for ${stationId} has another quality`);
  }
  const models = [...new Set(results.map(r => r.modelVersion))];
  if (models.length > 1) throw new Error('Results of one run must share a model version');
  return {
    format: RUN_SUMMARY_FORMAT, schemaVersion: RUN_SUMMARY_VERSION,
    plan: { hash, title: plan.title },
    scene: { release: plan.scene.release, scenario },
    quality, bins, modelVersion: models[0] ?? null,
    stations: stations.map(({ stationId, name, file, sha256, result }) => ({ id: stationId, name, file, sha256,
      totalCount: result.totalCount, weightedTransmission: result.weightedTransmission })),
    comparison,
    limitations: ['Quick comparative model, not calibrated counts or full particle transport.',
      'Stations are evaluated one at a time; no multi-station combination or ranking.']
  };
}
