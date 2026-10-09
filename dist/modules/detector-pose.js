// Plain model-coordinate directions; no dataset, renderer or application dependency.
export const degreesToRadians=v=>v*(Math.PI/180);
const normalized=v=>{const scale=1/(Math.sqrt(v.x*v.x+v.y*v.y+v.z*v.z)||1);return{x:v.x*scale,y:v.y*scale,z:v.z*scale};};
export function directionModel(c){const az=degreesToRadians(c.az),el=degreesToRadians(c.el);return normalized({x:Math.cos(el)*Math.cos(az),y:Math.cos(el)*Math.sin(az),z:Math.sin(el)});}
export function directionDoc(c,coordinates){return normalized(coordinates.modelDirectionToDoc(directionModel(c)));}
export function directionFromSlopes(c,sx,sy,coordinates){
 const az=degreesToRadians(c.az),el=degreesToRadians(c.el),v=directionModel(c);
 v.x+=-Math.sin(az)*sx;v.y+=Math.cos(az)*sx;v.z+=0*sx;
 v.x+=-Math.sin(el)*Math.cos(az)*sy;v.y+=-Math.sin(el)*Math.sin(az)*sy;v.z+=Math.cos(el)*sy;
 return normalized(coordinates.modelDirectionToDoc(normalized(v)));
}

// Compiled sampling arithmetic is retained independently of legacy Vector3 compatibility.
export function detectorBasis(azimuthDeg, elevationDeg) {
  if (!Number.isFinite(azimuthDeg) || !Number.isFinite(elevationDeg) || Math.abs(elevationDeg) > 90) throw new Error('Invalid projection orientation');
  const az = azimuthDeg * Math.PI / 180, el = elevationDeg * Math.PI / 180;
  return { forward: [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)],
    // Preserve the main application's +sx convention during migration.
    right: [-Math.sin(az), Math.cos(az), 0],
    up: [-Math.sin(el) * Math.cos(az), -Math.sin(el) * Math.sin(az), Math.cos(el)] };
}

export function slopeDirection(basis, sx, sy) {
  if (![sx, sy].every(Number.isFinite)) throw new Error('Invalid projection slopes');
  const direction = basis.forward.map((value, axis) => value + sx * basis.right[axis] + sy * basis.up[axis]);
  const norm = Math.hypot(...direction);
  return direction.map(value => value / norm);
}
