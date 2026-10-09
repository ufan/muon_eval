export function cube(min = [0, 0, 0], max = [1, 1, 1]) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  return { positions: new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]) };
}

export function component(id, material = 'concrete', mesh = cube(), flags = {}) {
  return { componentId: id, ...mesh, colors: null, colorSize: 0, semantics: {},
    metadata: { component_id: id, source_entity_id: id, material_id: material, scenario_id: 'low', role: material === 'air' ? 'void' : 'solid',
      frame: 'model_frame', triangles: mesh.indices.length / 3, watertight: true, flags: { physics: true, display: true, pick: true, ...flags } } };
}

export function glbFixture({ mutate = () => {}, interleaved = false, node = {}, mesh = cube(), name = 'cube' } = {}) {
  const stride = interleaved ? 16 : 12, vertexCount = mesh.positions.length / 3, positionBytes = vertexCount * stride;
  const binary = new ArrayBuffer(positionBytes + mesh.indices.byteLength), view = new DataView(binary);
  for (let i = 0; i < vertexCount; i++) for (let j = 0; j < 3; j++) view.setFloat32(i * stride + j * 4, mesh.positions[i * 3 + j], true);
  for (let i = 0; i < mesh.indices.length; i++) view.setUint32(positionBytes + i * 4, mesh.indices[i], true);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0, ...node }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }], buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positionBytes, ...(interleaved ? { byteStride: stride } : {}) }, { buffer: 0, byteOffset: positionBytes, byteLength: mesh.indices.byteLength }],
    accessors: [{ type: 'VEC3', componentType: 5126, bufferView: 0, count: vertexCount }, { type: 'SCALAR', componentType: 5125, bufferView: 1, count: mesh.indices.length }] };
  mutate(json, view);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json)), padded = Math.ceil(jsonBytes.length / 4) * 4;
  const buffer = new ArrayBuffer(12 + 8 + padded + 8 + binary.byteLength), result = new DataView(buffer);
  result.setUint32(0, 0x46546c67, true); result.setUint32(4, 2, true); result.setUint32(8, buffer.byteLength, true);
  result.setUint32(12, padded, true); result.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20, padded).fill(32); new Uint8Array(buffer, 20, jsonBytes.length).set(jsonBytes);
  result.setUint32(20 + padded, binary.byteLength, true); result.setUint32(24 + padded, 0x004e4942, true);
  new Uint8Array(buffer, 28 + padded).set(new Uint8Array(binary));
  return buffer;
}
