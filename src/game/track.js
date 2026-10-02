import * as THREE from 'three';
import { CONFIG } from './config.js';

// A single source of truth for road geometry, surface queries, race gates and props.
// The north arc sweeps into a right/left chicane, then a tight southern corner.
const anchors = [
  [0, 28], [0, -20], [20, -65], [70, -85], [110, -60],
  [115, -15], [95, 10], [110, 32], [90, 50], [70, 40],
  [55, 65], [55, 95], [30, 110], [4, 90], [0, 65],
];
const curve = new THREE.CatmullRomCurve3(anchors.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
curve.arcLengthDivisions = 4096;
const origin = curve.points[0].clone();
const scale = CONFIG.track.length / curve.getLength();
curve.points.forEach((point) => point.sub(origin).multiplyScalar(scale).add(origin));
curve.updateArcLengths();

export const track = {
  curve,
  length: curve.getLength(),
  width: CONFIG.track.width,
  points: curve.getSpacedPoints(CONFIG.track.samples).slice(0, -1),

  frame(u) {
    const wrapped = ((u % 1) + 1) % 1;
    const position = curve.getPointAt(wrapped);
    const forward = curve.getTangentAt(wrapped).normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    return { position, forward, right, heading: Math.atan2(forward.x, -forward.z) };
  },

  // Project onto sampled segments (rather than nearest vertices) for continuous
  // distances. 640 segments are inexpensive for one car at a fixed 120 Hz.
  project(x, z) {
    let best = Infinity, progress = 0;
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i], b = this.points[(i + 1) % this.points.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const distanceSquared = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
      if (distanceSquared < best) { best = distanceSquared; progress = (i + t) / this.points.length; }
    }
    return { distance: Math.sqrt(best), progress };
  },
};

function gateAt(u, name) {
  return { ...track.frame(u), u, name, halfWidth: track.width / 2 + 0.8 };
}

export const finishGate = gateAt(0, 'START / FINISH');
export const checkpoints = CONFIG.race.checkpointFractions.map((u, i) => gateAt(u, `CP ${String(i + 1).padStart(2, '0')}`));
const grid = track.frame(1 - 6 / track.length);
export const gridPose = { x: grid.position.x, z: grid.position.z, heading: grid.heading };
export const onTrack = (x, z) => track.project(x, z).distance <= track.width / 2;

// A finite gate plane, swept between simulation positions: no missed gates at
// speed, no credit for reverse crossings, and no trigger far beyond the road.
export function gateCrossing(before, after, gate) {
  const signed = (p) => (p.x - gate.position.x) * gate.forward.x + (p.z - gate.position.z) * gate.forward.z;
  const from = signed(before), to = signed(after);
  if (from >= 0 || to < 0) return null;
  const fraction = -from / (to - from);
  const x = before.x + (after.x - before.x) * fraction - gate.position.x;
  const z = before.z + (after.z - before.z) * fraction - gate.position.z;
  return Math.abs(x * gate.right.x + z * gate.right.z) <= gate.halfWidth ? fraction : null;
}
