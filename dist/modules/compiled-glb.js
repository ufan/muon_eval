// Bounded glTF 2.0/GLB decoder for static, indexed triangle releases.
// Contract: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
// Decoded buffers belong to computation and are also consumed directly by the view.
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, column = Math.floor(i / 4);
    return a[row] * b[column * 4] + a[row + 4] * b[column * 4 + 1]
      + a[row + 8] * b[column * 4 + 2] + a[row + 12] * b[column * 4 + 3];
  });
}
function nodeMatrix(node) {
  if (node.matrix) {
    if (node.translation || node.rotation || node.scale || node.matrix.length !== 16 || !node.matrix.every(Number.isFinite)
      || node.matrix[3] !== 0 || node.matrix[7] !== 0 || node.matrix[11] !== 0 || node.matrix[15] !== 1) throw new Error('Invalid GLB affine node matrix');
    return node.matrix;
  }
  const q = node.rotation || [0, 0, 0, 1], s = node.scale || [1, 1, 1], t = node.translation || [0, 0, 0];
  if (q.length !== 4 || s.length !== 3 || t.length !== 3 || ![...q, ...s, ...t].every(Number.isFinite)
    || Math.abs(Math.hypot(...q) - 1) > 1e-6) throw new Error('Invalid GLB node TRS');
  const [x, y, z, w] = q;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    ...t, 1
  ];
}
const determinant = m => m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);

export function decodeCompiledGlb(buffer, { components, scenarioId, visualOnlyIds = [] }) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 28) throw new Error('Invalid GLB buffer');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error('Invalid GLB header');
  let json = null, binary = null, offset = 12, chunkIndex = 0;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw new Error('Truncated GLB chunk');
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    offset += 8;
    if (length % 4 || offset + length > buffer.byteLength) throw new Error('Invalid GLB chunk length');
    if (type === 0x4e4f534a) {
      if (json || chunkIndex !== 0) throw new Error('Invalid GLB JSON chunk order');
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset, length)));
    } else if (type === 0x004e4942) {
      if (!json || binary) throw new Error('Invalid GLB binary chunk order');
      binary = { offset, length };
    }
    offset += length; chunkIndex++;
  }
  if (!json || !binary || json.asset?.version !== '2.0' || json.extensionsRequired?.length || json.animations?.length || json.skins?.length
    || json.buffers?.length !== 1 || json.buffers[0].uri || !Number.isInteger(json.buffers[0].byteLength)
    || json.buffers[0].byteLength > binary.length || binary.length - json.buffers[0].byteLength > 3) throw new Error('Unsupported compiled GLB contract');
  const declarations = new Map();
  for (const component of components) {
    if (!component.component_id || declarations.has(component.component_id) || component.scenario_id !== scenarioId || component.frame !== 'model_frame') throw new Error('Invalid compiled component declaration');
    declarations.set(component.component_id, component);
  }
  const visual = new Set(visualOnlyIds), decoded = [], names = new Set(), visited = new Set();
  function accessor(id, kind) {
    const a = json.accessors?.[id], v = json.bufferViews?.[a?.bufferView];
    if (!a || !v || a.sparse || a.extensions || v.extensions || v.buffer !== 0 || !Number.isInteger(a.count) || a.count <= 0) throw new Error('Unsupported GLB accessor');
    const sizes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }, lanes = { SCALAR: 1, VEC3: 3, VEC4: 4 };
    const size = sizes[a.componentType], count = lanes[a.type];
    if (!size || !count || (kind === 'position' && (a.type !== 'VEC3' || a.componentType !== 5126 || a.normalized))
      || (kind === 'index' && (a.type !== 'SCALAR' || ![5121, 5123, 5125].includes(a.componentType) || a.normalized))
      || (kind === 'color' && (!['VEC3', 'VEC4'].includes(a.type) || ![5121, 5123, 5126].includes(a.componentType)
        || (a.componentType !== 5126 && !a.normalized) || (a.componentType === 5126 && a.normalized)))) throw new Error(`Unsupported GLB ${kind} accessor`);
    const start = v.byteOffset || 0, local = a.byteOffset || 0, stride = v.byteStride || size * count;
    if (![start, local, stride, v.byteLength].every(Number.isInteger) || start < 0 || local < 0 || v.byteLength < 0
      || stride < size * count || stride % size || local % size || (start + local) % size
      || start + v.byteLength > json.buffers[0].byteLength || local + (a.count - 1) * stride + size * count > v.byteLength) throw new Error('GLB accessor exceeds buffer view');
    const result = kind === 'index' ? new Uint32Array(a.count) : new Float32Array(a.count * count);
    for (let i = 0; i < a.count; i++) for (let lane = 0; lane < count; lane++) {
      const at = binary.offset + start + local + i * stride + lane * size;
      let value = a.componentType === 5126 ? view.getFloat32(at, true)
        : a.componentType === 5125 ? view.getUint32(at, true) : a.componentType === 5123 ? view.getUint16(at, true) : view.getUint8(at);
      if (a.normalized) value /= a.componentType === 5121 ? 255 : 65535;
      if (!Number.isFinite(value)) throw new Error('Non-finite GLB attribute');
      result[i * count + lane] = value;
    }
    return { values: result, count: a.count, lanes: count };
  }
  function visit(id, parent) {
    if (visited.has(id)) throw new Error('GLB scene must be a tree without repeated nodes');
    const node = json.nodes?.[id];
    if (!node || node.skin !== undefined || node.weights || node.extensions) throw new Error('Unsupported GLB node');
    visited.add(id);
    const matrix = multiply(parent, nodeMatrix(node)), det = determinant(matrix);
    if (Math.abs(det) < 1e-12) throw new Error('Singular GLB node transform');
    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh], name = node.name;
      if (!mesh || !name || names.has(name) || mesh.weights || mesh.extensions || mesh.primitives?.length !== 1) throw new Error('Unsupported compiled mesh node');
      const declaration = declarations.get(name);
      if (!declaration && (!visual.has(name) || node.extras?.realization !== 'virtual')) throw new Error(`Unregistered GLB node ${name}`);
      const primitive = mesh.primitives[0];
      if ((primitive.mode ?? 4) !== 4 || primitive.extensions || primitive.targets || primitive.indices === undefined) throw new Error('Compiled meshes must use indexed triangles');
      const positions = accessor(primitive.attributes?.POSITION, 'position'), indices = accessor(primitive.indices, 'index').values;
      const color = primitive.attributes.COLOR_0 === undefined ? null : accessor(primitive.attributes.COLOR_0, 'color');
      if (indices.length % 3 || indices.some(index => index >= positions.count) || (color && color.count !== positions.count)) throw new Error('Invalid compiled triangle attributes');
      for (let i = 0; i < positions.values.length; i += 3) {
        const x = positions.values[i], y = positions.values[i + 1], z = positions.values[i + 2];
        positions.values[i] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        positions.values[i + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        positions.values[i + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
      }
      if (!positions.values.every(Number.isFinite)) throw new Error('GLB transform overflow');
      if (det < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      if (declaration && (declaration.triangles !== indices.length / 3 || declaration.watertight !== true
        || (node.extras?.material && node.extras.material !== declaration.material_id))) throw new Error(`GLB/manifest mismatch on ${name}`);
      names.add(name);
      decoded.push({ componentId: name, positions: positions.values, indices, colors: color?.values || null, colorSize: color?.lanes || 0,
        semantics: structuredClone(node.extras?.semantics || {}),
        metadata: declaration ? structuredClone(declaration) : { component_id: name, role: 'visual_proxy', material_id: null, scenario_id: scenarioId,
          frame: 'model_frame', flags: { physics: false, display: true, pick: true }, realization: 'virtual' } });
    }
    for (const child of node.children || []) visit(child, matrix);
  }
  const scene = json.scenes?.[json.scene ?? 0];
  if (!scene?.nodes) throw new Error('GLB has no default scene');
  for (const node of scene.nodes) visit(node, identity());
  for (const name of declarations.keys()) if (!names.has(name)) throw new Error(`Missing GLB component ${name}`);
  return { format: 'compiled-mesh-runtime', version: '0.1.0', frame: 'model_frame', scenarioId, components: decoded };
}
