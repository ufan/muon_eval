import * as THREE from 'three';
// Coverage tint injected into the subject materials' own shader (ADR-026): each surface is
// tinted at most once (front-facing side), mixed into its colour, with a minimum opacity,
// so transparency sorting is unchanged and stacked layers do not add up. GLSL mirror of
// coverage-map.js (lineSlopes, classifyCoverage, slopeBin); scene frame has Y up.
export function createCoverageUniforms() {
  return {
    covMode: { value: 0 },               // 0 off, 1 geometric, 2 physical
    covHasMap: { value: 0 },             // physical map of the current result available
    covCore: { value: 0 },               // emphasise the core field of view (half the slopes)
    covOrigin: { value: new THREE.Vector3() }, covForward: { value: new THREE.Vector3(1, 0, 0) },
    covRight: { value: new THREE.Vector3(0, 0, 1) }, covUp: { value: new THREE.Vector3(0, 1, 0) },
    covMax: { value: new THREE.Vector2(1, 1) }, covStep: { value: 1 }, covStrips: { value: 2 }, covBins: { value: 1 },
    covMap: { value: null }, covColor: { value: new THREE.Color(0xff65bd) }, covMinOpacity: { value: .35 }
  };
}

const VERTEX = ['varying vec3 vCovWorld;', 'vCovWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'];
const FRAGMENT_HEAD = `
varying vec3 vCovWorld;
uniform int covMode; uniform int covHasMap; uniform int covCore; uniform float covLayer;
uniform vec3 covOrigin; uniform vec3 covForward; uniform vec3 covRight; uniform vec3 covUp;
uniform vec2 covMax; uniform float covStep; uniform float covStrips; uniform float covBins;
uniform sampler2D covMap; uniform vec3 covColor; uniform float covMinOpacity;
float covBin(float s) { // exact inverse of nativeAxisBins (coverage-map.js slopeBin)
  float count = 2.0 * covStrips - 1.0, j = floor(s / covStep + 0.5) + covStrips - 1.0;
  return (ceil((j + 1.0) * covBins / count) - 1.0 + 0.5) / covBins;
}`;
const FRAGMENT_BODY = `
if (covMode > 0 && covLayer > 0.5 && gl_FrontFacing) {
  vec3 covD = vCovWorld - covOrigin; float covF = dot(covD, covForward);
  if (abs(covF) > 1e-6) {
    float covSx = dot(covD, covRight) / covF, covSy = dot(covD, covUp) / covF;
    float covEdge = max(abs(covSx) / covMax.x, abs(covSy) / covMax.y);
    bool covUpward = covD.y > 0.0, covShown = covUpward || covF > 0.0;
    if (covEdge <= 1.0 && covShown) {
      vec3 covTint = covColor; float covStrength = 0.55;
      if (!covUpward) { covTint = vec3(0.42); covStrength = 0.45; }          // in front, below the horizon: no flux
      else if (covMode == 2 && covHasMap == 1) {                            // counts per steradian, log brightness
        float covB = texture2D(covMap, vec2(covBin(covSx), covBin(covSy))).r;
        // Ramp dark → station colour → white, so one decade of counts reads as a clear step.
        covTint = covB < 0.5 ? mix(covColor * 0.08, covColor, covB * 2.0) : mix(covColor, vec3(1.0), (covB - 0.5) * 1.6); covStrength = 0.85;
      }
      if (covCore == 1 && covEdge <= 0.5) covStrength = min(0.9, covStrength + 0.2);
      diffuseColor.rgb = mix(diffuseColor.rgb, covTint, covStrength);
      diffuseColor.a = max(diffuseColor.a, covMinOpacity);
    }
    // Crisp boundary lines of constant screen width: field of view and, in front, the horizon.
    float covW = fwidth(covEdge);
    if (covShown && abs(covEdge - 1.0) < covW * 1.5) { diffuseColor.rgb = covColor; diffuseColor.a = 1.0; }
    if (covEdge <= 1.0 && covF > 0.0 && abs(covD.y) < fwidth(covD.y) * 1.5) { diffuseColor.rgb = vec3(0.9); diffuseColor.a = 1.0; }
  }
}`;

// `layer` is this material's own { value: 0 | 1 } switch (subject on by default; context
// surfaces only when the user adds them).
export function attachCoverage(material, uniforms, layer) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { covLayer: layer });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX[0]}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX[1]}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_BODY}`);
  };
  material.customProgramCacheKey = () => 'coverage-v1';
  return material;
}
