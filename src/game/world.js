import * as THREE from 'three';
import { track as defaultTrack } from './track.js';
import { StaticCollisions } from './collisions.js';
import { CheckpointPylons } from './checkpoint-pylons.js';
import { FallingStreetlights } from './streetlights.js';
import { musicRhythm } from './music-theme.js';

const mat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
const makePalette = (snow) => ({
  grass: mat(snow ? '#dde8ed' : '#344b3e'), wood: mat('#583b30'),
  navy: mat('#293f48'), cream: mat('#ddd3ad'), red: mat('#ad5137'),
  trunk: mat('#69503b'), leaf: mat(snow ? '#355c59' : '#79804a'), gold: mat('#be9942'),
  snow: mat('#f5fafc'),
});

export function box(parent, material, size, position, collidable = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.collidable = collidable;
  parent.add(mesh);
  return mesh;
}

function trackMesh(scene, track) {
  const points = track.points, positions = [], colors = [], indices = [];
  points.forEach((point, i) => {
    const next = track.closed ? (i + 1) % points.length : Math.min(i + 1, points.length - 1);
    const previous = track.closed ? (i + points.length - 1) % points.length : Math.max(i - 1, 0);
    const tangent = points[next].clone().sub(points[previous]).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    // Three strips produce a slightly lighter, worn middle of the road.
    [-0.5, -0.30, 0.30, 0.5].forEach((offset, j) => {
      const vertex = point.clone().addScaledVector(normal, track.width * offset);
      positions.push(vertex.x, 0.025, vertex.z);
      const color = new THREE.Color(track.theme === 'neon' ? (j === 0 || j === 3 ? '#28334a' : '#3e4a61') : track.theme === 'snow'
        ? (j === 0 || j === 3 ? '#d3e4ec' : '#a9c4d2')
        : (j === 0 || j === 3 ? '#946e47' : '#ac8558'));
      colors.push(color.r, color.g, color.b);
    });
    for (let j = 0; j < 3 && (track.closed || i < points.length - 1); j++) {
      const a = i * 4 + j, b = ((i + 1) % points.length) * 4 + j;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const road = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  road.receiveShadow = true;
  scene.add(road);
}

function tent(scene, x, z, color, scale, palette, snow) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  scene.add(group);
  for (const px of [-2.4, 2.4]) for (const pz of [-2, 2]) box(group, palette.wood, [0.12, 3.5, 0.12], [px, 1.75, pz], true);
  // An open tent with a pitched, four-sided roof and simple tables inside.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.75, 1.6, 4), color);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.86;
  roof.position.y = 4.2;
  roof.castShadow = true;
  group.add(roof);
  if (snow) {
    const cap = new THREE.Mesh(roof.geometry, palette.snow);
    cap.rotation.copy(roof.rotation); cap.scale.copy(roof.scale).multiplyScalar(1.02);
    cap.position.copy(roof.position); cap.position.y += 0.1;
    group.add(cap);
  }
  box(group, palette.wood, [4.6, 0.18, 0.8], [0, 1.25, 0], true);
  for (const px of [-1.7, 1.7]) box(group, palette.wood, [0.14, 1.2, 0.6], [px, 0.6, 0], true);
  box(group, palette.wood, [4.4, 0.14, 0.4], [0, 0.65, 1.2], true);
}

function stall(scene, x, z, color, facing, palette) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = facing * Math.PI / 2;
  scene.add(group);
  box(group, palette.wood, [2.8, 1.25, 1.05], [0, 0.625, 0], true);
  box(group, palette.cream, [3, 0.13, 1.25], [0, 1.3, 0], true);
  for (const x of [-1.35, 1.35]) box(group, palette.wood, [0.10, 2.8, 0.10], [x, 1.4, 0.35], true);
  for (let i = 0; i < 8; i++) {
    const strip = box(group, i % 2 ? palette.cream : color, [0.4, 0.1, 2], [-1.4 + i * 0.4, 2.65, -0.2]);
    strip.rotation.x = -0.14;
    box(group, i % 2 ? palette.cream : color, [0.4, 0.32, 0.08], [-1.4 + i * 0.4, 2.36, -1.18]);
  }
  for (let i = 0; i < 4; i++) box(group, i % 2 ? palette.gold : palette.leaf, [0.42, 0.25, 0.6], [-0.95 + i * 0.62, 1.49, 0]);
}

function tree(scene, x, z, rand, palette, snow) {
  const height = 4 + rand() * 3;
  box(scene, palette.trunk, [0.35, height * 0.6, 0.4], [x, height * 0.3, z], true);
  if (snow) {
    // Three angular evergreen tiers, with white caps above dark lower branches.
    for (let tier = 0; tier < 3; tier++) {
      const radius = height * (0.33 - tier * 0.07), y = height * (0.45 + tier * 0.21);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(radius, height * 0.42, 6), palette.leaf);
      foliage.position.set(x, y, z); foliage.castShadow = true; scene.add(foliage);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.87, height * 0.36, 6), palette.snow);
      cap.position.set(x, y + height * 0.055, z); cap.castShadow = true; scene.add(cap);
    }
  } else {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(height * 0.44, 0), rand() > 0.5 ? palette.leaf : palette.gold);
    crown.position.set(x, height * 0.85, z);
    crown.scale.y = 1.2;
    crown.rotation.y = rand() * Math.PI;
    crown.castShadow = true;
    scene.add(crown);
  }
}

function sign(parent, label, width, y, color = '#eee4ce') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#293f48';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = 'bold 64px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(label, 512, 68, 980);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  mesh.position.set(0, y, 0.17);
  parent.add(mesh);
}

function createRaceMarkers(scene, track, palette, pylons) {
  const { checkpoints, finishGate } = track;
  function groupAt(gate) {
    const group = new THREE.Group();
    group.position.copy(gate.position);
    group.rotation.y = -gate.heading;
    scene.add(group);
    return group;
  }
  const half = track.width / 2;
  function arch(gate, label) {
    const group = groupAt(gate);
    for (const side of [-1, 1]) box(group, palette.wood, [0.35, 6.3, 0.35], [side * (half + 0.6), 3.15, 0], true);
    box(group, palette.navy, [track.width + 1.6, 1.2, 0.3], [0, 6.15, 0]);
    sign(group, label, track.width + 0.6, 6.15);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
      box(group, (row + col) % 2 ? palette.navy : palette.cream,
        [track.width / 16, 0.012, 0.65], [-half + (col + 0.5) * track.width / 16, 0.044, (row - 0.5) * 0.65]);
    }
    return group;
  }
  const start = arch(track.startGate, track.closed ? 'DUSTLINE  /  START · FINISH' : 'DUSTLINE  /  NIGHT STAGE · START');
  if (!track.closed) arch(finishGate, 'DUSTLINE  /  FINISH');
  for (const side of [-1, 1]) box(start, palette.cream, [0.12, 0.012, 3], [side * 1.5, 0.044, 6]);
  const markers = checkpoints.map((gate) => {
    const group = groupAt(gate);
    const material = mat('#ddd3ad');
    for (const side of [-1, 1]) {
      // Separate movable groups; neither the pole nor its panel is registered
      // as a static obstacle. The checkpoint gate stays at its original pose.
      const pylon = new THREE.Group();
      pylon.name = `${gate.name}-pylon-${side}`;
      pylon.position.copy(gate.position).addScaledVector(gate.right, side * (half + 0.5));
      pylon.rotation.y = -gate.heading;
      scene.add(pylon);
      box(pylon, palette.wood, [0.12, 4.2, 0.12], [0, 2.1, 0]);
      box(pylon, material, [0.7, 2.8, 0.12], [0, 2.7, 0]);
      pylons.add(pylon, gate.heading);
    }
    sign(group, gate.name, 4.2, 4.5);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(track.width, 0.32), material);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.y = 0.05;
    group.add(stripe);
    return material;
  });
  let previousCount = -1;
  return {
    update(race) {
      if (previousCount === race.splits.length) return;
      previousCount = race.splits.length;
      markers.forEach((material, index) => material.color.set(index < previousCount ? '#79804a' : index === previousCount ? '#56a3cc' : '#ddd3ad'));
    },
  };
}

export function createWorld(scene, track = defaultTrack) {
  const snow = track.theme === 'snow', neon = track.theme === 'neon', palette = makePalette(snow);
  if (neon) {
    palette.grass.color.set('#101727'); palette.wood.color.set('#283649');
    palette.navy.color.set('#19223b'); palette.cream.color.set('#8ddcd9');
    palette.red.color.set('#973956'); palette.leaf.color.set('#1e3944');
  }
  // Own all course resources so switching maps cannot leak meshes or colliders.
  const root = new THREE.Group();
  root.name = track.id;
  scene.add(root);
  scene.background = new THREE.Color(neon ? '#080e21' : snow ? '#bdd5e4' : '#c3b08a');
  scene.fog = new THREE.Fog(scene.background, neon ? 70 : 105, neon ? 200 : 230);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(neon ? track.bounds.maxX - track.bounds.minX + 250 : 650,
    neon ? track.bounds.maxZ - track.bounds.minZ + 250 : 650), palette.grass);
  if (neon) ground.position.set((track.bounds.minX + track.bounds.maxX) / 2, 0, (track.bounds.minZ + track.bounds.maxZ) / 2);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  trackMesh(root, track);

  root.add(new THREE.HemisphereLight(neon ? '#b3bbff' : snow ? '#edf7ff' : '#fff0d5', neon ? '#2f2652' : snow ? '#638aa3' : '#465346', neon ? 1.35 : 1.7));
  const sun = new THREE.DirectionalLight(neon ? '#a5beff' : snow ? '#fff0df' : '#ffe0b3', neon ? 1.5 : snow ? 1.8 : 2.3);
  sun.position.set(-35, 45, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 180 });
  sun.shadow.normalBias = 0.04;
  sun.shadow.bias = -0.0001;
  root.add(sun, sun.target);

  const pylons = new CheckpointPylons({ snow });
  const streetlights = new FallingStreetlights();
  const raceMarkers = createRaceMarkers(root, track, palette, pylons);
  // Seeded roadside placements follow the spline all the way around the lap.
  let seed = 83;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const night = neon ? createNightScenery(root, track, palette, random, streetlights) : null;
  for (let distance = 0; !neon && distance < track.length; distance += 12) {
    const frame = track.frame(distance / track.length);
    for (const side of [-1, 1]) {
      const offset = side * (12 + random() * 8);
      const point = frame.position.clone().addScaledVector(frame.right, offset);
      if (track.project(point.x, point.z).distance > 11) tree(root, point.x, point.z, random, palette, snow);
    }
  }
  for (let distance = 15, index = 0; !neon && distance < track.length; distance += 30, index++) {
    const frame = track.frame(distance / track.length);
    for (const side of [-1, 1]) {
      const point = frame.position.clone().addScaledVector(frame.right, side * 11.5);
      if (track.project(point.x, point.z).distance < 10) continue;
      const group = new THREE.Group();
      group.position.copy(point);
      group.rotation.y = -frame.heading;
      root.add(group);
      if (index % 4 === 0) tent(group, 0, 0, index % 8 ? palette.red : palette.navy, 1.1, palette, snow);
      else if (index % 2 === 0) stall(group, 0, 0, side < 0 ? palette.gold : palette.navy, side, palette);
      else {
        box(group, palette.wood, [0.10, 5, 0.10], [0, 2.5, 0], true);
        box(group, palette.cream, [0.85, 3.4, 0.05], [0.4, 3.2, 0]);
        box(group, palette.red, [0.22, 3.4, 0.07], [0.7, 3.2, 0]);
      }
    }
  }
  const grass = new THREE.InstancedMesh(snow ? new THREE.IcosahedronGeometry(0.22, 0) : new THREE.ConeGeometry(0.10, 0.5, 3), snow ? palette.snow : palette.leaf, 1200);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 1200; i++) {
    const frame = track.frame(random());
    const point = frame.position.addScaledVector(frame.right, (random() > 0.5 ? 1 : -1) * (8 + random() * 17));
    // Omit tufts where neighbouring sections of the circuit approach each other.
    const clear = track.project(point.x, point.z).distance > track.width / 2 + 0.5;
    dummy.position.set(point.x, 0.22, point.z);
    dummy.rotation.y = random() * 6;
    dummy.scale.setScalar(clear ? 0.6 + random() : 0);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  root.add(grass);

  if (snow) {
    // Soft, decorative banks follow both road edges; the solid props still use
    // the shared collision system. No invisible walls limit a drifting car.
    const banks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), palette.snow, Math.ceil(track.length / 4) * 2);
    banks.receiveShadow = true;
    let count = 0;
    for (let distance = 0; distance < track.length; distance += 4) {
      const frame = track.frame(distance / track.length);
      for (const side of [-1, 1]) {
        const point = frame.position.clone().addScaledVector(frame.right, side * (track.width / 2 + 1.1));
        if (track.project(point.x, point.z).distance < track.width / 2 + 0.7) continue;
        dummy.position.set(point.x, 0.05, point.z);
        dummy.rotation.set(0, -frame.heading, 0);
        dummy.scale.set(1.15, 0.45 + random() * 0.2, 2.4);
        dummy.updateMatrix(); banks.setMatrixAt(count++, dummy.matrix);
      }
    }
    banks.count = count; root.add(banks);
    for (let i = 0; i < 12; i++) {
      const frame = track.frame(i / 12);
      const point = frame.position.clone().addScaledVector(frame.right, (i % 2 ? -1 : 1) * 70);
      if (track.project(point.x, point.z).distance < 40) continue;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(16 + random() * 10, 25 + random() * 15, 5), palette.snow);
      peak.position.set(point.x, 8, point.z); root.add(peak);
    }
  }

  const collisions = new StaticCollisions();
  collisions.registerScene(root);

  return {
    collisions,
    pylons,
    streetlights,
    root,
    dispose() {
      root.removeFromParent();
      const geometries = new Set(), materials = new Set(Object.values(palette)), textures = new Set();
      root.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const material of [object.material].flat()) {
          materials.add(material);
          if (material.map) textures.add(material.map);
        }
        // Instanced meshes and lights own GPU resources beyond their geometry.
        if (object.isInstancedMesh || object.isLight) object.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      collisions.obstacles.length = 0; collisions.cells.clear();
      pylons.clear();
      streetlights.clear();
    },
    update(pose, race, musicTime = race.elapsed ?? 0) {
      raceMarkers.update(race);
      if (night) night.update(musicRhythm(musicTime, track.music), pose);
      // Keep shadow-map coverage near the player instead of wasting it on the whole map.
      sun.position.set(pose.x - 35, 45, pose.z - 25);
      sun.target.position.set(pose.x, 0, pose.z);
    },
  };
}

function createNightScenery(root, track, palette, random, streetlights) {
  const pink = new THREE.MeshStandardMaterial({ color: '#e461c7', emissive: '#ed32ba', emissiveIntensity: 0.8 });
  const cyan = new THREE.MeshStandardMaterial({ color: '#83eee8', emissive: '#26cbd4', emissiveIntensity: 0.8 });
  const windows = new THREE.MeshStandardMaterial({ color: '#80bada', emissive: '#9ddfff', emissiveIntensity: 0.35, roughness: 0.7 });
  // Repeated luminous strips use two draw calls along the complete stage.
  const spacing = 26 * 60 / track.music.bpm * 4;
  const count = Math.floor(track.length / spacing) + 1;
  const strips = [pink, cyan].map((material) => new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.08, 4), material, count));
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const frame = track.frame(i * spacing / track.length);
    strips.forEach((strip, side) => {
      dummy.position.copy(frame.position).addScaledVector(frame.right, (side ? 1 : -1) * (track.width / 2 - 0.2));
      dummy.position.y = 0.09; dummy.rotation.y = -frame.heading; dummy.updateMatrix(); strip.setMatrixAt(i, dummy.matrix);
    });
  }
  root.add(...strips);
  const windowTransforms = [], windowSources = [], beamTransforms = [], roofBars = [[], []];
  const containerRibs = [];
  const containerSteel = mat('#53616b'), containerPaint = mat('#9e392e');
  for (let distance = 12, index = 0; distance < track.length; distance += 30, index++) {
    const frame = track.frame(distance / track.length);
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.position.copy(frame.position); group.rotation.y = -frame.heading; root.add(group);
      const light = side < 0 ? pink : cyan, edge = side * (track.width / 2 + 2.2);
      const lamp = new THREE.Group();
      lamp.name = `streetlight-${index}-${side}`; lamp.position.x = edge; group.add(lamp);
      // The whole lamp pivots from its base and is handled by movable physics.
      box(lamp, palette.wood, [0.72, 0.4, 0.72], [0, 0.2, 0]).name = 'streetlight-base';
      box(lamp, palette.wood, [0.3, 6, 0.3], [0, 3, 0]).name = 'streetlight-pole';
      box(lamp, light, [2.6, 0.14, 0.32], [-side * 1.2, 6, 0]);
      root.updateMatrixWorld(true); root.attach(lamp);
      streetlights.add(lamp, frame.heading, 0.36, 0.36, 6.1);
      const buildingX = side * (20 + random() * 10), height = 5 + random() * 9;
      box(group, index % 3 ? palette.navy : palette.wood, [8, height, 12], [buildingX, height / 2, 0], true);
      box(group, light, [8.05, 0.22, 0.12], [buildingX, height * 0.75, -6.05]);
      group.updateMatrix();
      // The spotlight and visible shaft start at an actual lower-row window,
      // pointing out toward the road instead of making a spot on the facade.
      const source = new THREE.Vector3(buildingX - side * 4.09, height * 0.4, -1.4);
      const candidates = [];
      for (const z of [-4, -1.4, 1.4, 4]) for (const y of [height * 0.4, height * 0.7]) {
        candidates.push({ position: new THREE.Vector3(source.x, y, z).applyMatrix4(group.matrix),
          target: new THREE.Vector3(buildingX - side * 13, 0.2, z).applyMatrix4(group.matrix) });
      }
      windowSources.push({ candidates, selection: 0, distanceSquared: 0,
        // Seeded permutation: each beat picks another window, independent of FPS.
        seed: index * 17 + (side > 0 ? 11 : 3), matrix: group.matrix.clone(), side, buildingX, height });
      dummy.position.copy(source); dummy.rotation.set(0, side > 0 ? Math.PI : 0, 0);
      dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      beamTransforms.push(group.matrix.clone().multiply(dummy.matrix));
      // Windows face the road; their emissive material changes brightness only.
      // These elevated decorations never change the static building collider.
      for (const z of [-4, -1.4, 1.4, 4]) for (const y of [height * 0.4, height * 0.7]) {
        dummy.position.set(buildingX - side * 4.03, y, z);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(0.08, 0.8, 1.3); dummy.updateMatrix();
        windowTransforms.push(group.matrix.clone().multiply(dummy.matrix));
      }
      if (index % 3 === 0) for (let band = 0; band < 3; band++) {
        const position = new THREE.Vector3(buildingX + (band - 1) * 1.7, height, 0).applyMatrix4(group.matrix);
        roofBars[side < 0 ? 0 : 1].push({ position, heading: -frame.heading, band, height: 1.8 + band * 0.6 });
      }
      if (index % 3 === 0) {
        const container = new THREE.Group();
        container.name = `shipping-container-${index}-${side}`;
        container.position.set(side * 15, 0, 8); group.add(container);
        // Keep the same solid footprint; the steel details are decorative.
        box(container, containerPaint, [4, 2.5, 7], [0, 1.25, 0], true).name = 'container-body';
        for (const x of [-1.93, 1.93]) {
          for (const z of [-3.43, 3.43]) box(container, containerSteel, [0.18, 2.55, 0.18], [x, 1.275, z]);
          for (const y of [0.1, 2.4]) box(container, containerSteel, [0.16, 0.16, 7], [x, y, 0]);
        }
        for (const x of [-0.98, 0.98]) {
          box(container, containerPaint, [1.87, 2.24, 0.08], [x, 1.25, 3.55]).name = 'container-door';
          for (const rodX of [x - 0.5, x + 0.5]) {
            box(container, containerSteel, [0.055, 2.08, 0.07], [rodX, 1.25, 3.61]);
            box(container, containerSteel, [0.28, 0.055, 0.09], [rodX + 0.1, 1.05, 3.65]);
          }
        }
        box(container, containerSteel, [0.05, 2.3, 0.09], [0, 1.25, 3.61]);
        box(container, palette.cream, [0.5, 0.3, 0.02], [1.2, 1.9, 3.61]);
        container.updateMatrix();
        const containerMatrix = group.matrix.clone().multiply(container.matrix);
        // Batch hundreds of corrugations into one draw call for the route.
        for (let z = -3.2; z <= 3.2; z += 0.4) for (const x of [-2.025, 2.025]) {
          dummy.position.set(x, 1.25, z); dummy.rotation.set(0, 0, 0);
          dummy.scale.set(0.08, 2.18, 0.12); dummy.updateMatrix();
          containerRibs.push(containerMatrix.clone().multiply(dummy.matrix));
        }
        for (let x = -1.8; x <= 1.8; x += 0.4) {
          dummy.position.set(x, 2.53, 0); dummy.scale.set(0.12, 0.06, 6.7); dummy.updateMatrix();
          containerRibs.push(containerMatrix.clone().multiply(dummy.matrix));
        }
      }
    }
  }
  const windowMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), windows.clone(), windowTransforms.length);
  windowMesh.material.emissiveIntensity = 0.14;
  windowMesh.name = 'building-windows';
  windowTransforms.forEach((matrix, index) => windowMesh.setMatrixAt(index, matrix)); root.add(windowMesh);
  const flashingWindows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), windows, windowSources.length);
  flashingWindows.name = 'music-reactive-windows'; root.add(flashingWindows);
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), containerPaint, containerRibs.length);
  ribs.name = 'container-corrugations'; ribs.castShadow = true; ribs.receiveShadow = true;
  containerRibs.forEach((matrix, index) => ribs.setMatrixAt(index, matrix)); root.add(ribs);
  // A faint tapered shaft makes the origin in the window readable in the dark.
  const beamGeometry = new THREE.BufferGeometry();
  const corners = [[0,-0.4,-0.65],[0,0.4,-0.65],[0,0.4,0.65],[0,-0.4,0.65],
    [8,-3.3,-1.8],[8,-1.5,-1.8],[8,-1.5,1.8],[8,-3.3,1.8]];
  beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  beamGeometry.setIndex([0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
  const beamMaterial = new THREE.MeshBasicMaterial({ color:'#b7e6ff', transparent:true, opacity:0,
    blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const beams = new THREE.InstancedMesh(beamGeometry, beamMaterial, beamTransforms.length);
  beams.name = 'window-light-shafts';
  beamTransforms.forEach((matrix, index) => beams.setMatrixAt(index, matrix)); root.add(beams);
  const roofMeshes = [pink, cyan].map((material, side) => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.65, 1, 1.5), material, roofBars[side].length);
    mesh.name = `music-reactive-roof-bars-${side}`; root.add(mesh); return mesh;
  });
  // A restrained local wash follows the chase camera; no full-screen flashes.
  const wash = new THREE.PointLight('#cc63e0', 30, 35, 2);
  root.add(wash);
  // Reuse a small, fixed light pool for the nearest buildings rather than
  // adding a dynamic light to every building along the entire stage.
  const strobeLights = Array.from({ length: 4 }, (_, index) => {
    const light = new THREE.SpotLight('#b7e6ff', 0, 32, Math.PI / 5, 0.65, 2);
    light.name = `window-strobe-${index}`; root.add(light, light.target); return light;
  });
  let previousTime = -1, previousBeat = -1;
  return { update(rhythm, pose) {
    wash.position.set(pose.x, 6, pose.z);
    const beat = Math.floor(rhythm.beat);
    if (beat !== previousBeat) {
      previousBeat = beat;
      windowSources.forEach((source, index) => {
        // Permuted eight-window blocks avoid repeating a window on adjacent beats.
        const block = Math.floor(beat / 8), slot = beat % 8;
        let hash = Math.imul((block + 1) ^ source.seed, 0x45d9f3b);
        hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
        hash = (hash ^ (hash >>> 16)) >>> 0;
        const stride = [1, 3, 5, 7][hash & 3];
        source.selection = (source.seed + ((hash >>> 2) & 3) * 2 + slot * stride) % 8;
        const chosen = source.candidates[source.selection];
        dummy.position.copy(chosen.position);
        dummy.rotation.set(0, -Math.atan2(source.matrix.elements[2], source.matrix.elements[0]) + (source.side > 0 ? Math.PI : 0), 0);
        dummy.scale.set(1, 1, 1); dummy.updateMatrix(); beams.setMatrixAt(index, dummy.matrix);
        const outward = new THREE.Vector3(-source.side, 0, 0).transformDirection(source.matrix);
        dummy.position.addScaledVector(outward, -0.04);
        dummy.scale.set(0.08, 0.8, 1.3); dummy.updateMatrix();
        flashingWindows.setMatrixAt(index, dummy.matrix);
      });
      beams.instanceMatrix.needsUpdate = true;
      flashingWindows.instanceMatrix.needsUpdate = true;
    }
    windowSources.forEach((source) => {
      const position = source.candidates[source.selection].position;
      source.distanceSquared = (position.x - pose.x) ** 2 + (position.z - pose.z) ** 2;
    });
    const nearest = [...windowSources].sort((a, b) => a.distanceSquared - b.distanceSquared);
    strobeLights.forEach((light, index) => {
      const source = nearest[index], chosen = source.candidates[source.selection];
      light.position.copy(chosen.position);
      light.target.position.copy(chosen.target);
      light.intensity = source.distanceSquared < 45 ** 2 ? rhythm.strobe * 250 : 0;
    });
    if (rhythm.seconds === previousTime) return;
    previousTime = rhythm.seconds;
    pink.emissiveIntensity = cyan.emissiveIntensity = 0.55 + rhythm.pulse * 1.15;
    windows.emissiveIntensity = 0.14 + rhythm.strobe * 4.5;
    beamMaterial.opacity = rhythm.strobe * 0.065;
    // Deterministic beat-driven accents, not a frequency spectrum. Deriving
    // transforms from playback time makes seek/reset/pause exact and avoids
    // accumulated drift or a separate animation clock.
    roofMeshes.forEach((mesh, side) => {
      roofBars[side].forEach((bar, index) => {
        const accent = 0.5 + 0.2 * Math.sin(rhythm.beat * Math.PI / 2 + bar.band);
        const height = bar.height * (0.85 + rhythm.pulse * accent);
        dummy.position.copy(bar.position); dummy.position.y += height / 2 + 0.15;
        dummy.rotation.set(0, bar.heading, 0); dummy.scale.set(1, height, 1); dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  } };
}
