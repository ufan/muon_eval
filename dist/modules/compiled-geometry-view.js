import * as THREE from '../vendor/three/three.module.js';

// This adapter owns normals/materials only. Positions and indices are the same
// computation-owned arrays indexed by the BVH, with model coordinates preserved.
export function createCompiledGeometryView(runtime) {
  const group = new THREE.Group(), meshes = new Map();
  group.rotation.x = -Math.PI / 2; // model Z-up → Three.js Y-up, no change of scale.
  for (const component of runtime.components) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(component.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(component.indices, 1));
    if (component.colors) geometry.setAttribute('color', new THREE.BufferAttribute(component.colors, component.colorSize));
    // Indexed vertex normals average adjacent faces, visually rounding sharp
    // engineering corners. Use per-face shader normals without splitting or
    // modifying the computation-owned positions/indices.
    const hasAlpha = component.colorSize === 4 && component.colors.some((value, index) => index % 4 === 3 && value < 1);
    const material = new THREE.MeshStandardMaterial({ vertexColors: Boolean(component.colors), color: component.colors ? 0xffffff : 0xb4b8bc,
      transparent: hasAlpha, depthWrite: !hasAlpha, side: THREE.DoubleSide, roughness: 0.85, flatShading: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = component.componentId;
    mesh.userData = { componentId: component.componentId, sourceEntityIds: component.sourceEntityIds, sourceMapping: component.sourceMapping,
      materialId: component.metadata.material_id, role: component.metadata.role, pick: component.metadata.flags.pick,
      semanticRecord: runtime.semanticAudit?.records.find(record => record.componentId === component.componentId) || null };
    mesh.visible = component.metadata.flags.display && component.metadata.material_id !== 'air' && component.metadata.realization !== 'virtual';
    meshes.set(component.componentId, mesh); group.add(mesh);
  }
  const setOverlays = ({ air = false, virtual = false }) => {
    for (const component of runtime.components) {
      const allowed = component.metadata.flags.display;
      const visible = component.metadata.realization === 'virtual' ? virtual : component.metadata.material_id === 'air' ? air : true;
      meshes.get(component.componentId).visible = allowed && visible;
    }
  };
  const dispose = () => { for (const mesh of meshes.values()) { mesh.geometry.dispose(); mesh.material.dispose(); } group.clear(); meshes.clear(); };
  return { group, meshes, setOverlays, dispose };
}
