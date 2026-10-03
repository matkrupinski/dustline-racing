import * as THREE from 'three';
import { CONFIG, SURFACE_PHYSICS } from './config.js';
import { PHONK } from './music-theme.js';

// A single source of truth for road geometry, surface queries, race gates and props.
// The north arc sweeps into a right/left chicane, then a tight southern corner.
const dirtAnchors = [
  [0, 28], [0, -20], [20, -65], [70, -85], [110, -60],
  [115, -15], [95, 10], [110, 32], [90, 50], [70, 40],
  [55, 65], [55, 95], [30, 110], [4, 90], [0, 65],
];
// Every course owns its spline, gates, spawn and record key. The exported dirt
// aliases below preserve the small development fixtures and default API.
export function createTrack({ id, name, theme, anchors, length, width, bestKey, closed = true, music = null, checkpointFractions = CONFIG.race.checkpointFractions }) {
  const curve = new THREE.CatmullRomCurve3(anchors.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
  curve.arcLengthDivisions = 4096;
  const origin = curve.points[0].clone();
  const scale = length / curve.getLength();
  curve.points.forEach((point) => point.sub(origin).multiplyScalar(scale).add(origin));
  curve.updateArcLengths();

  const track = {
    id, name, theme, bestKey, closed, music, physics: SURFACE_PHYSICS[theme],
    curve,
    length: curve.getLength(),
    width,
    points: closed ? curve.getSpacedPoints(CONFIG.track.samples).slice(0, -1)
      : curve.getSpacedPoints(Math.max(CONFIG.track.samples, Math.ceil(length / 2))),

    frame(u) {
      const wrapped = closed ? ((u % 1) + 1) % 1 : Math.max(0, Math.min(1, u));
      const position = curve.getPointAt(wrapped);
      const forward = curve.getTangentAt(wrapped).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      return { position, forward, right, heading: Math.atan2(forward.x, -forward.z) };
    },

    // Project onto sampled segments (rather than nearest vertices) for continuous
    // distances. Longer stages use a segment approximately every two meters.
    project(x, z) {
      let best = Infinity, progress = 0;
      const segments = closed ? this.points.length : this.points.length - 1;
      for (let i = 0; i < segments; i++) {
        const a = this.points[i], b = this.points[(i + 1) % this.points.length];
        const dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        const distanceSquared = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
        if (distanceSquared < best) { best = distanceSquared; progress = (i + t) / segments; }
      }
      return { distance: Math.sqrt(best), progress };
    },
  };

  function gateAt(u, name) {
    return { ...track.frame(u), u, name, halfWidth: track.width / 2 + 0.8 };
  }

  track.startGate = gateAt(closed ? 0 : 6 / track.length, closed ? 'START / FINISH' : 'START');
  track.finishGate = closed ? track.startGate : gateAt(1 - 8 / track.length, 'FINISH');
  track.checkpoints = checkpointFractions.map((u, i) => gateAt(u, `CP ${String(i + 1).padStart(2, '0')}`));
  const grid = track.frame(closed ? 1 - 6 / track.length : 0);
  track.gridPose = { x: grid.position.x, z: grid.position.z, heading: grid.heading };
  track.onTrack = (x, z) => track.project(x, z).distance <= track.width / 2;
  track.bounds = closed ? { minX: -240, maxX: 240, minZ: -240, maxZ: 240 } : {
    minX: Math.min(...track.points.map((p) => p.x)) - 80, maxX: Math.max(...track.points.map((p) => p.x)) + 80,
    minZ: Math.min(...track.points.map((p) => p.z)) - 80, maxZ: Math.max(...track.points.map((p) => p.z)) + 80,
  };
  return track;
}

export const COURSES = {
  'dirt-circuit': createTrack({
    id: 'dirt-circuit', name: 'Dirt Circuit', theme: 'dirt', anchors: dirtAnchors,
    length: CONFIG.track.length, width: CONFIG.track.width,
    bestKey: 'dustline:spline-circuit-v1:best',
  }),
  'winter-pass': createTrack({
    id: 'winter-pass', name: 'Winter Pass', theme: 'snow', length: 560, width: 14,
    anchors: [[0, 28], [-5, -15], [-40, -50], [-70, -85], [-25, -110],
      [35, -100], [55, -65], [35, -30], [55, -10], [80, 0], [85, 45],
      [45, 75], [5, 70], [0, 50]],
    bestKey: 'dustline:winter-pass-v1:best',
  }),
  'phonk-docks': createTrack({
    id: 'phonk-docks', name: 'Phonk Docks', theme: 'neon', closed: false,
    music: PHONK, length: 3600, width: 17,
    bestKey: 'dustline:phonk-docks-v2:best',
    // A compact dock route folds back through five hairpins. Alternating
    // chicanes and wider sweeps require repeated braking and direction changes;
    // adjacent lanes remain separated so scenery cannot close the racing line.
    anchors: [[0, 0], [0, -55], [25, -100], [80, -120],
      [150, -100], [205, -155], [265, -115], [325, -160],
      [385, -145], [435, -175], [445, -220], [405, -260], [345, -265],
      [280, -235], [210, -290], [145, -250], [80, -295],
      [10, -280], [-45, -315], [-55, -360], [-15, -400], [45, -405],
      [110, -380], [170, -430], [235, -385], [295, -440],
      [360, -420], [420, -455], [435, -500], [395, -545], [335, -550],
      [265, -525], [195, -580], [125, -540], [55, -590],
      [-15, -580], [-70, -615], [-80, -660], [-40, -705], [25, -710],
      [95, -680], [160, -735], [230, -695], [300, -745],
      [370, -730], [430, -770], [450, -825], [410, -875],
      [345, -895], [275, -865], [210, -910], [140, -880], [70, -925], [0, -925]],
    checkpointFractions: [24, 48, 72, 96, 120, 138].map((seconds) => seconds / PHONK.duration),
  }),
};
export const track = COURSES['dirt-circuit'];
export const { finishGate, checkpoints, gridPose, onTrack } = track;

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
