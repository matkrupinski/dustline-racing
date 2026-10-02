import * as THREE from 'three';
import { CONFIG } from './config.js';
import { track, checkpoints, finishGate } from './track.js';
import { StaticCollisions } from './collisions.js';

const mat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
const palette = {
  grass: mat('#344b3e'), wood: mat('#583b30'),
  navy: mat('#293f48'), cream: mat('#ddd3ad'), red: mat('#ad5137'),
  trunk: mat('#69503b'), leaf: mat('#79804a'), gold: mat('#be9942'),
};

export function box(parent, material, size, position, collidable = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.collidable = collidable;
  parent.add(mesh);
  return mesh;
}

function trackMesh(scene) {
  const points = track.points, positions = [], colors = [], indices = [];
  points.forEach((point, i) => {
    const tangent = points[(i + 1) % points.length].clone().sub(points[(i + points.length - 1) % points.length]).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    // Three strips produce a slightly lighter, worn middle of the road.
    [-0.5, -0.30, 0.30, 0.5].forEach((offset, j) => {
      const vertex = point.clone().addScaledVector(normal, CONFIG.track.width * offset);
      positions.push(vertex.x, 0.025, vertex.z);
      const color = new THREE.Color(j === 0 || j === 3 ? '#946e47' : '#ac8558');
      colors.push(color.r, color.g, color.b);
    });
    for (let j = 0; j < 3; j++) {
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

function tent(scene, x, z, color, scale = 1) {
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
  box(group, palette.wood, [4.6, 0.18, 0.8], [0, 1.25, 0], true);
  for (const px of [-1.7, 1.7]) box(group, palette.wood, [0.14, 1.2, 0.6], [px, 0.6, 0], true);
  box(group, palette.wood, [4.4, 0.14, 0.4], [0, 0.65, 1.2], true);
}

function stall(scene, x, z, color, facing = 1) {
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

function tree(scene, x, z, rand) {
  const height = 4 + rand() * 3;
  box(scene, palette.trunk, [0.35, height * 0.6, 0.4], [x, height * 0.3, z], true);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(height * 0.44, 0), rand() > 0.5 ? palette.leaf : palette.gold);
  crown.position.set(x, height * 0.85, z);
  crown.scale.y = 1.2;
  crown.rotation.y = rand() * Math.PI;
  crown.castShadow = true;
  scene.add(crown);
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
  context.fillText(label, 512, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  mesh.position.set(0, y, 0.17);
  parent.add(mesh);
}

function createRaceMarkers(scene) {
  function groupAt(gate) {
    const group = new THREE.Group();
    group.position.copy(gate.position);
    group.rotation.y = -gate.heading;
    scene.add(group);
    return group;
  }
  const start = groupAt(finishGate);
  const half = track.width / 2;
  for (const side of [-1, 1]) box(start, palette.wood, [0.35, 6.3, 0.35], [side * (half + 0.6), 3.15, 0], true);
  box(start, palette.navy, [track.width + 1.6, 1.2, 0.3], [0, 6.15, 0]);
  sign(start, 'DUSTLINE  /  START · FINISH', track.width + 0.6, 6.15);
  // Shared start/finish line for this single-lap closed circuit.
  for (let row = 0; row < 2; row++) for (let col = 0; col < 16; col++) {
    box(start, (row + col) % 2 ? palette.navy : palette.cream,
      [track.width / 16, 0.012, 0.65], [-half + (col + 0.5) * track.width / 16, 0.044, (row - 0.5) * 0.65]);
  }
  for (const side of [-1, 1]) box(start, palette.cream, [0.12, 0.012, 3], [side * 1.5, 0.044, 6]);
  const markers = checkpoints.map((gate) => {
    const group = groupAt(gate);
    const material = mat('#ddd3ad');
    for (const side of [-1, 1]) {
      box(group, palette.wood, [0.12, 4.2, 0.12], [side * (half + 0.5), 2.1, 0], true);
      box(group, material, [0.7, 2.8, 0.12], [side * (half + 0.5), 2.7, 0], true);
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

export function createWorld(scene) {
  scene.background = new THREE.Color('#c3b08a');
  scene.fog = new THREE.Fog('#c3b08a', 105, 230);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(650, 650), palette.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  trackMesh(scene);

  scene.add(new THREE.HemisphereLight('#fff0d5', '#465346', 1.7));
  const sun = new THREE.DirectionalLight('#ffe0b3', 2.3);
  sun.position.set(-35, 45, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 180 });
  sun.shadow.normalBias = 0.04;
  sun.shadow.bias = -0.0001;
  scene.add(sun, sun.target);

  const raceMarkers = createRaceMarkers(scene);
  // Seeded roadside placements follow the spline all the way around the lap.
  let seed = 83;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let distance = 0; distance < track.length; distance += 12) {
    const frame = track.frame(distance / track.length);
    for (const side of [-1, 1]) {
      const offset = side * (12 + random() * 8);
      const point = frame.position.clone().addScaledVector(frame.right, offset);
      if (track.project(point.x, point.z).distance > 11) tree(scene, point.x, point.z, random);
    }
  }
  for (let distance = 15, index = 0; distance < track.length; distance += 30, index++) {
    const frame = track.frame(distance / track.length);
    for (const side of [-1, 1]) {
      const point = frame.position.clone().addScaledVector(frame.right, side * 11.5);
      if (track.project(point.x, point.z).distance < 10) continue;
      const group = new THREE.Group();
      group.position.copy(point);
      group.rotation.y = -frame.heading;
      scene.add(group);
      if (index % 4 === 0) tent(group, 0, 0, index % 8 ? palette.red : palette.navy, 1.1);
      else if (index % 2 === 0) stall(group, 0, 0, side < 0 ? palette.gold : palette.navy, side);
      else {
        box(group, palette.wood, [0.10, 5, 0.10], [0, 2.5, 0], true);
        box(group, palette.cream, [0.85, 3.4, 0.05], [0.4, 3.2, 0]);
        box(group, palette.red, [0.22, 3.4, 0.07], [0.7, 3.2, 0]);
      }
    }
  }
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.10, 0.5, 3), palette.leaf, 1200);
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
  scene.add(grass);

  const collisions = new StaticCollisions();
  collisions.registerScene(scene);

  return {
    collisions,
    update(pose, race) {
      raceMarkers.update(race);
      // Keep shadow-map coverage near the player instead of wasting it on the whole map.
      sun.position.set(pose.x - 35, 45, pose.z - 25);
      sun.target.position.set(pose.x, 0, pose.z);
    },
  };
}
