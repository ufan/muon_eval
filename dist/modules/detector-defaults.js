// Platform assessment defaults, independent of any dam dataset or instrument
// sidecar. They are approximations, not a released instrument calibration.
export function defaultAssessmentDevice() {
  const device = { model: 'JW-S400-10B', layers: 3, stripPitch: .0016, stripsX: 256, stripsY: 256,
    width: 256 * .0016, height: 256 * .0016, spacing: .15, baseline: .30, designResolutionDeg: .3 };
  device.baseline = device.spacing * (device.layers - 1);
  device.nativeSlopeStep = device.stripPitch / device.baseline;
  device.maxSlopeX = (device.stripsX - 1) * device.nativeSlopeStep;
  device.maxSlopeY = (device.stripsY - 1) * device.nativeSlopeStep;
  return device;
}

export function defaultAssessmentResponse() {
  return { layerEfficiency: .95, deadLiveFraction: .98, angularResolutionDeg: .3,
    systematicFraction: .03, exposureDays: 30, angularModel: 'gaisser' };
}
