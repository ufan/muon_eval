// One plan per release in browser storage (docs/specs/PLAN_FORMAT.md). Storage is
// passed in; reads and writes never throw (private windows, blocked storage).
import { parsePlan, serializePlan, planFromState, planFromLegacyStorage } from './plan-format.js';
import { defaultDeviceConfiguration, applyDeviceConfiguration, deviceSettingsData } from './device-configuration.js';

export const planStorageKey = release => `muon-plan:${release}`;
const LEGACY_STATIONS = release => `muon-candidates:${release}`, LEGACY_DEVICE = 'muon-device-settings-v1';
const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
// Device settings go through the app's one configuration path, so ranges and fallbacks match the form.
const normalise = (base, extra) => deviceSettingsData(applyDeviceConfiguration(applyDeviceConfiguration(defaultDeviceConfiguration(), base), extra ?? {}));

export function storePlan(storage, plan) {
  try { storage.setItem(planStorageKey(plan.scene.release), serializePlan(plan)); return true; } catch { return false; }
}

// Returns { plan, source: 'stored' | 'migrated' | 'default', warning? }. The scenario
// always follows the app's current selection; stations and detectors are per release.
export function loadStoredPlan({ storage, release, scenario, model, candidateIds, defaultStations, defaultSettings }) {
  let warning;
  const stored = read(storage, planStorageKey(release));
  if (stored !== null) {
    try {
      const plan = parsePlan(stored);
      if (plan.scene.release !== release) throw new Error('Invalid plan: stored under another release');
      return { plan: { ...plan, scene: { ...plan.scene, scenario } }, source: 'stored' };
    } catch (error) { warning = `Stored plan ignored: ${error.message}`; }
  }
  let legacyDevice = null;
  try { legacyDevice = JSON.parse(read(storage, LEGACY_DEVICE)); } catch {}
  const settings = normalise(defaultSettings, legacyDevice);
  let legacyStations = null;
  try { legacyStations = JSON.parse(read(storage, LEGACY_STATIONS(release))); } catch {}
  if (warning === undefined && Array.isArray(legacyStations) && legacyStations.length) {
    try {
      const plan = planFromLegacyStorage({ release, scenario, model, candidateIds, stations: legacyStations, settings });
      if (storePlan(storage, plan)) { try { storage.removeItem(LEGACY_STATIONS(release)); } catch {} }
      return { plan, source: 'migrated' };
    } catch (error) { warning = `Stored stations ignored: ${error.message}`; }
  }
  const plan = planFromState({ release, scenario, model, stations: defaultStations, activeIndex: 0, selected: [], settings });
  return warning === undefined ? { plan, source: 'default' } : { plan, source: 'default', warning };
}
