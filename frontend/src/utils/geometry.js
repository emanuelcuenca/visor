/** Calcula [minX, minY, maxX, maxY] para una geometría GeoJSON. */
export function geometryBbox(geometry) {
  if (!geometry?.coordinates) return null;
  const xs = [];
  const ys = [];
  const visit = (node) => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
      xs.push(node[0]); ys.push(node[1]); return;
    }
    node.forEach(visit);
  };
  visit(geometry.coordinates);
  if (!xs.length) return null;
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Devuelve los extremos del BBOX en formato [lat, lng], compatible con Leaflet fitBounds. */
export function bboxToLeafletBounds(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) return null;
  return [[bbox[1], bbox[0]], [bbox[3], bbox[2]]];
}
