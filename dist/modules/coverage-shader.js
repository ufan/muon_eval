import * as THREE from 'three';
// Coverage tint injected into the subject materials' own shader (ADR-026): each surface is
// tinted at most once (front-facing side), mixed into its colour, with a minimum opacity,
// so transparency sorting is unchanged and stacked layers do not add up. GLSL mirror of
// coverage-map.js (lineSlopes, classifyCoverage, slopeBin, coveringStations); scene frame has Y up.
// With extra stations (14d sketching), surfaces are shaded by how many stations probe them, in one hue that grows
// stronger with each station, and each station's field-of-view edge is drawn in its own colour.
export const COVERAGE_EXTRA_SLOTS = 8;
// Per-pixel physical maps of the working station (slot 0) and the other stations (slots 1–8), side by side:
// R = counts, G = counts per steradian, bottom row first, each slot COVERAGE_SLOT_BINS wide.
export const COVERAGE_SLOT_BINS = 65;
export const MULTI_MAPS = Object.freeze({ off: 0, views: 1, spread: 2, class: 3, dominant: 4, total: 5 });
const slots = make => Array.from({ length: COVERAGE_EXTRA_SLOTS }, make), slots9 = make => Array.from({ length: COVERAGE_EXTRA_SLOTS + 1 }, make);
export function createCoverageUniforms() {
  return {
    covExtraCount: { value: 0 },
    // Physical multi-station maps (15d): which map, thresholds, the slot atlas and each slot's bins (0 = pending).
    covMulti: { value: 0 }, covMinCounts: { value: 100 }, covClassViews: { value: 3 }, covGoodSpread: { value: 30 }, covMinSpread: { value: 10 },
    covAtlas: { value: null }, covSlotBins: { value: new Array(COVERAGE_EXTRA_SLOTS + 1).fill(0) },
    // Pose and readout of every slot (0 = working station, 1–8 = the others) for the loop of the physical maps.
    covSlotOrigin: { value: slots9(() => new THREE.Vector3()) }, covSlotForward: { value: slots9(() => new THREE.Vector3(1, 0, 0)) },
    covSlotRight: { value: slots9(() => new THREE.Vector3(0, 0, 1)) }, covSlotUp: { value: slots9(() => new THREE.Vector3(0, 1, 0)) },
    covSlotMax: { value: slots9(() => new THREE.Vector2(1, 1)) }, covSlotStep: { value: new Array(COVERAGE_EXTRA_SLOTS + 1).fill(1) },
    covSlotStrips: { value: new Array(COVERAGE_EXTRA_SLOTS + 1).fill(2) }, covSlotColor: { value: slots9(() => new THREE.Color(0xffffff)) },
    covLogRange: { value: new THREE.Vector2(3, 7.5) },
    covExtraOrigin: { value: slots(() => new THREE.Vector3()) }, covExtraForward: { value: slots(() => new THREE.Vector3(1, 0, 0)) },
    covExtraRight: { value: slots(() => new THREE.Vector3(0, 0, 1)) }, covExtraUp: { value: slots(() => new THREE.Vector3(0, 1, 0)) },
    covExtraMax: { value: slots(() => new THREE.Vector2(1, 1)) }, covExtraColor: { value: slots(() => new THREE.Color(0xffffff)) },
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
uniform int covMode; uniform int covHasMap; uniform int covCore; uniform float covLayer; uniform float covTwoSided;
uniform vec3 covOrigin; uniform vec3 covForward; uniform vec3 covRight; uniform vec3 covUp;
uniform vec2 covMax; uniform float covStep; uniform float covStrips; uniform float covBins;
uniform sampler2D covMap; uniform vec3 covColor; uniform float covMinOpacity;
#define COV_EXTRA 8
uniform int covExtraCount; uniform vec3 covExtraOrigin[COV_EXTRA]; uniform vec3 covExtraForward[COV_EXTRA];
uniform vec3 covExtraRight[COV_EXTRA]; uniform vec3 covExtraUp[COV_EXTRA]; uniform vec2 covExtraMax[COV_EXTRA]; uniform vec3 covExtraColor[COV_EXTRA];
// Field-of-view edge measure of one station at a point (<= 1 inside); 99 on the detector plane.
float covEdgeOf(vec3 d, vec3 f, vec3 r, vec3 u, vec2 m) { float F = dot(d, f); return abs(F) < 1e-6 ? 99.0 : max(abs(dot(d, r) / F) / m.x, abs(dot(d, u) / F) / m.y); }
// One hue for the number of covering stations, light to deep (ColorBrewer Reds, linear values): each extra
// station makes the tint darker and stronger (5 steps, 5+ shared).
uniform int covMulti; uniform float covMinCounts; uniform int covClassViews; uniform float covGoodSpread; uniform float covMinSpread;
uniform highp sampler2D covAtlas; uniform int covSlotBins[COV_EXTRA + 1]; uniform vec2 covLogRange;
uniform vec3 covSlotOrigin[COV_EXTRA + 1]; uniform vec3 covSlotForward[COV_EXTRA + 1]; uniform vec3 covSlotRight[COV_EXTRA + 1]; uniform vec3 covSlotUp[COV_EXTRA + 1];
uniform vec2 covSlotMax[COV_EXTRA + 1]; uniform float covSlotStep[COV_EXTRA + 1]; uniform float covSlotStrips[COV_EXTRA + 1]; uniform vec3 covSlotColor[COV_EXTRA + 1];
// Exact inverse of nativeAxisBins (coverage-map.js slopeBin) as an index, or -1 outside the readout.
int covBinIndex(float s, float step, float strips, int bins) {
  float count = 2.0 * strips - 1.0, j = floor(s / step + 0.5) + strips - 1.0;
  if (j < 0.0 || j >= count) return -1;
  return int(ceil((j + 1.0) * float(bins) / count) - 1.0);
}
float covBright(float perSr) { return perSr > 0.0 ? clamp((log(perSr) / log(10.0) - covLogRange.x) / (covLogRange.y - covLogRange.x), 0.0, 1.0) : 0.0; }
vec3 covSpreadColor(float deg) { return deg < 10.0 ? vec3(0.565, 0.708, 0.863) : deg < 30.0 ? vec3(0.147, 0.423, 0.672) : deg < 60.0 ? vec3(0.015, 0.165, 0.462) : vec3(0.002, 0.030, 0.147); }
vec3 covClassColor(int k) { return k == 1 ? vec3(0.680, 0.030, 0.020) : k == 2 ? vec3(0.982, 0.423, 0.120) : vec3(0.010, 0.314, 0.080); }
vec3 covCountColor(int k) { return k == 1 ? vec3(0.973, 0.497, 0.356) : k == 2 ? vec3(0.973, 0.287, 0.168) : k == 3 ? vec3(0.965, 0.144, 0.068) : k == 4 ? vec3(0.73, 0.026, 0.019) : vec3(0.376, 0.005, 0.007); }
float covCountStrength(int k) { return k == 1 ? 0.55 : k == 2 ? 0.65 : k == 3 ? 0.74 : k == 4 ? 0.82 : 0.9; }
float covBin(float s) { // exact inverse of nativeAxisBins (coverage-map.js slopeBin)
  float count = 2.0 * covStrips - 1.0, j = floor(s / covStep + 0.5) + covStrips - 1.0;
  return (ceil((j + 1.0) * covBins / count) - 1.0 + 0.5) / covBins;
}`;
const FRAGMENT_BODY = `
#ifdef COV_MULTI
if (covMode == 2 && covMulti > 0 && covLayer > 0.5 && (gl_FrontFacing || covTwoSided > 0.5) && covExtraCount > 0) {
  // Several stations, physical: multi-view coverage, angular spread, class, dominant station or total counts.
  // One loop over the slots (0 = working station): the station code appears once in the shader, which keeps it
  // small enough to compile quickly (nine inlined calls made the first draw stall). Mirror of coverage-map.js
  // stationViewAt / multiViewCoverage.
  int seen = 0, usable = 0; vec3 dirs[COV_EXTRA + 1]; float bestSr = -1.0, totalSr = 0.0; vec3 bestColor = vec3(0.0);
  for (int i = 0; i < COV_EXTRA + 1; i++) {
    if (i > covExtraCount) break;
    vec3 d = vCovWorld - covSlotOrigin[i]; float F = dot(d, covSlotForward[i]);
    if (abs(F) < 1e-6 || d.y <= 0.0) continue;
    float sx = dot(d, covSlotRight[i]) / F, sy = dot(d, covSlotUp[i]) / F;
    if (max(abs(sx) / covSlotMax[i].x, abs(sy) / covSlotMax[i].y) > 1.0) continue;
    seen++;
    int bins = covSlotBins[i];
    if (bins == 0) continue;
    int ix = covBinIndex(sx, covSlotStep[i], covSlotStrips[i], bins), iy = covBinIndex(sy, covSlotStep[i], covSlotStrips[i], bins);
    if (ix < 0 || iy < 0) continue;
    vec2 c = texelFetch(covAtlas, ivec2(i * 65 + ix, iy), 0).rg;
    totalSr += c.g;
    if (c.g > bestSr) { bestSr = c.g; bestColor = covSlotColor[i]; }
    if (c.r >= covMinCounts) { dirs[usable] = normalize(d); usable++; }
  }
  float spread = 0.0;
  for (int i = 0; i < COV_EXTRA + 1; i++) { if (i >= usable) break; for (int j = 0; j < COV_EXTRA + 1; j++) { if (j >= usable) break; if (j > i) spread = max(spread, degrees(acos(clamp(dot(dirs[i], dirs[j]), -1.0, 1.0)))); } }
  vec3 covTint = vec3(0.03); float covS = 0.0;
  if (seen > 0) {
    covS = 0.6;                                                                   // seen, but no usable view: dark grey, unlike bare concrete
    if (covMulti == 1 && usable > 0) { covTint = covCountColor(min(usable, 5)); covS = covCountStrength(min(usable, 5)); }
    else if (covMulti == 2 && usable > 0) { covTint = covSpreadColor(spread); covS = 0.8; }
    else if (covMulti == 3) { int k = usable < 2 || spread < covMinSpread ? 1 : usable >= covClassViews && spread >= covGoodSpread ? 3 : 2; covTint = covClassColor(k); covS = 0.8; }
    else if (covMulti == 4 && bestSr > 0.0) { float b = covBright(bestSr); covTint = b < 0.5 ? mix(bestColor * 0.08, bestColor, b * 2.0) : mix(bestColor, vec3(1.0), (b - 0.5) * 1.6); covS = 0.85; }
    else if (covMulti == 5 && totalSr > 0.0) { vec3 hue = vec3(1.0, 0.36, 0.06); float b = covBright(totalSr); covTint = b < 0.5 ? mix(hue * 0.08, hue, b * 2.0) : mix(hue, vec3(1.0), (b - 0.5) * 1.6); covS = 0.85; }
    diffuseColor.rgb = mix(diffuseColor.rgb, covTint, covS); diffuseColor.a = max(diffuseColor.a, covMinOpacity + 0.5 * covS);
  }
  // Each station's field-of-view edge in its colour (as in the geometric view).
  vec3 covD = vCovWorld - covOrigin; float covE = covEdgeOf(covD, covForward, covRight, covUp, covMax), covW = fwidth(covE);
  bool covOnLine = abs(covE - 1.0) < covW * 1.5 && (covD.y > 0.0 || dot(covD, covForward) > 0.0); vec3 covLine = covColor;
  for (int i = 0; i < COV_EXTRA; i++) {
    if (i >= covExtraCount) break;
    vec3 e = vCovWorld - covExtraOrigin[i]; float edge = covEdgeOf(e, covExtraForward[i], covExtraRight[i], covExtraUp[i], covExtraMax[i]), w = fwidth(edge);
    if (!covOnLine && abs(edge - 1.0) < w * 1.5 && (e.y > 0.0 || dot(e, covExtraForward[i]) > 0.0)) { covOnLine = true; covLine = covExtraColor[i]; }
  }
  if (covOnLine) { diffuseColor.rgb = covLine; diffuseColor.a = 1.0; }
} else
#endif
if (covMode > 0 && covLayer > 0.5 && (gl_FrontFacing || covTwoSided > 0.5) && covExtraCount > 0) {
  // Several stations: count those probing this point (inside the field of view, point above the station).
  vec3 covD = vCovWorld - covOrigin; float covE = covEdgeOf(covD, covForward, covRight, covUp, covMax), covW = fwidth(covE);
  int covK = covE <= 1.0 && covD.y > 0.0 ? 1 : 0; vec3 covLine = covColor; bool covOnLine = abs(covE - 1.0) < covW * 1.5 && (covD.y > 0.0 || dot(covD, covForward) > 0.0);
  for (int i = 0; i < COV_EXTRA; i++) {
    if (i >= covExtraCount) break;
    vec3 e = vCovWorld - covExtraOrigin[i]; float edge = covEdgeOf(e, covExtraForward[i], covExtraRight[i], covExtraUp[i], covExtraMax[i]), w = fwidth(edge);
    if (edge <= 1.0 && e.y > 0.0) covK++;
    if (!covOnLine && abs(edge - 1.0) < w * 1.5 && (e.y > 0.0 || dot(e, covExtraForward[i]) > 0.0)) { covOnLine = true; covLine = covExtraColor[i]; }
  }
  if (covK > 0) { float covS = covCountStrength(covK); diffuseColor.rgb = mix(diffuseColor.rgb, covCountColor(covK), covS); diffuseColor.a = max(diffuseColor.a, covMinOpacity + 0.5 * covS); }
  if (covOnLine) { diffuseColor.rgb = covLine; diffuseColor.a = 1.0; }
} else if (covMode > 0 && covLayer > 0.5 && (gl_FrontFacing || covTwoSided > 0.5)) {
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
// The physical multi-station maps are a separate shader variant (COV_MULTI), compiled only when they are shown:
// they make the shader much larger, and software GPUs then stall for about a second on its first draw.
export function setCoverageVariant(materials, multi) {
  for (const material of materials) {
    const on = Boolean(material.defines?.COV_MULTI);
    if (on === multi) continue;
    material.defines = { ...(material.defines ?? {}) };
    if (multi) material.defines.COV_MULTI = ''; else delete material.defines.COV_MULTI;
    material.needsUpdate = true;
  }
}
// `twoSided` tints both faces (the slice plane); other surfaces are tinted once, on their front face.
export function attachCoverage(material, uniforms, layer, twoSided = { value: 0 }) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { covLayer: layer, covTwoSided: twoSided });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX[0]}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX[1]}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_BODY}`);
  };
  material.customProgramCacheKey = () => 'coverage-v5';
  return material;
}
