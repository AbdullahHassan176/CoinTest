/** Great-circle route as Leaflet [lat, lng][] for polylines on a sphere. */

export type LatLon = { lat: number; lon: number };

function toCartesian(latDeg: number, lonDeg: number): [number, number, number] {
  const φ = (latDeg * Math.PI) / 180;
  const λ = (lonDeg * Math.PI) / 180;
  const cosφ = Math.cos(φ);
  return [cosφ * Math.cos(λ), cosφ * Math.sin(λ), Math.sin(φ)];
}

function fromCartesian(x: number, y: number, z: number): [number, number] {
  const r = Math.hypot(x, y, z);
  if (r < 1e-12) return [0, 0];
  const lat = (Math.asin(Math.max(-1, Math.min(1, z / r))) * 180) / Math.PI;
  let lon = (Math.atan2(y, x) * 180) / Math.PI;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return [lat, lon];
}

function slerp(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ω = Math.acos(Math.max(-1, Math.min(1, dot)));
  if (ω < 1e-8) {
    return [
      a[0] + t * (b[0] - a[0]),
      a[1] + t * (b[1] - a[1]),
      a[2] + t * (b[2] - a[2]),
    ];
  }
  const s1 = Math.sin((1 - t) * ω) / Math.sin(ω);
  const s2 = Math.sin(t * ω) / Math.sin(ω);
  return [s1 * a[0] + s2 * b[0], s1 * a[1] + s2 * b[1], s1 * a[2] + s2 * b[2]];
}

/** Samples the shortest path on the sphere between two WGS84 points (degrees). */
export function greatCirclePolyline(a: LatLon, b: LatLon, segments = 96): [number, number][] {
  const A = toCartesian(a.lat, a.lon);
  const B = toCartesian(b.lat, b.lon);
  const out: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const [x, y, z] = slerp(A, B, t);
    const [lat, lon] = fromCartesian(x, y, z);
    out.push([lat, lon]);
  }
  return out;
}
