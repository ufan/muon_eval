// Affine transforms are shared by adapters and computation; no rendering dependency.
export function createCoordinateTransform(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 3 || matrix.some(row => !Array.isArray(row) || row.length !== 4 || row.some(x => !Number.isFinite(x)))) {
    throw new Error('Coordinate transform must be a finite 3×4 matrix');
  }
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) throw new Error('Coordinate transform is singular');
  const inverse = [
    [e * i - f * h, c * h - b * i, b * f - c * e],
    [f * g - d * i, a * i - c * g, c * d - a * f],
    [d * h - e * g, b * g - a * h, a * e - b * d]
  ].map(row => row.map(value => value / determinant));
  const offset = matrix.map(row => row[3]);
  const multiply = (rows, vector) => rows.map(row => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
  const directionToModel = vector => multiply(matrix, vector);
  const directionToSource = vector => multiply(inverse, vector);
  return {
    determinant,
    reversesWinding: determinant < 0,
    pointToModel: point => directionToModel(point).map((value, axis) => value + offset[axis]),
    pointToSource: point => directionToSource(point.map((value, axis) => value - offset[axis])),
    directionToModel,
    directionToSource
  };
}
