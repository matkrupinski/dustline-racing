import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StaticCollisions } from '../src/game/collisions.js';
import { Vehicle } from '../src/game/vehicle.js';
import { CONFIG } from '../src/game/config.js';
import { createWorld, box } from '../src/game/world.js';
import { track, gridPose } from '../src/game/track.js';

function move(system, pose, velocity, dt, finalHeading = pose.heading) {
  const car = new Vehicle();
  Object.assign(car, pose, velocity);
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.heading = finalHeading;
  const collided = system.resolve(car, pose, dt);
  return { car, collided };
}

test('unobstructed movement and steering remain unchanged', () => {
  const system = new StaticCollisions();
  system.addBox(100, 100, 2, 3);
  const { car, collided } = move(system, { x: 0, z: 10, heading: 0.2 }, { vx: 5, vz: -30 }, 0.1, 0.23);
  assert.equal(collided, false);
  assert.ok(Math.abs(car.x - 0.5) < 1e-10);
  assert.ok(Math.abs(car.z - 7) < 1e-10);
  assert.equal(car.heading, 0.23);
  assert.equal(car.vx, 5);
  assert.equal(car.vz, -30);
});

test('a high-speed car cannot tunnel through a thin post', () => {
  const system = new StaticCollisions();
  system.addBox(0, 0, 0.05, 0.05);
  const { car, collided } = move(system, { x: 0, z: 8, heading: 0 }, { vx: 0, vz: -37 }, 0.45);
  assert.equal(collided, true);
  assert.ok(car.z >= CONFIG.collision.halfLength + 0.05);
  assert.ok(car.speed < 3, 'impact should dissipate most forward energy');
  assert.ok(car.vz >= 0, 'car must not retain velocity into the post');
  assert.ok(Math.abs(car.forwardSpeed + car.vz) < 1e-10);
});

test('glancing contact slides along an obstacle while losing speed', () => {
  const system = new StaticCollisions();
  system.addBox(0, 0, 0.2, 20);
  const { car, collided } = move(system, { x: -3, z: 5, heading: 0 }, { vx: 12, vz: -18 }, 0.25);
  assert.equal(collided, true);
  assert.ok(car.x <= -CONFIG.collision.halfWidth - 0.2);
  assert.ok(car.z < 2, 'tangential motion should continue');
  assert.ok(car.vx <= 0);
  assert.ok(car.vz < -14, 'a side scrape should not stop tangential motion');
  assert.ok(car.speed < Math.hypot(12, 18));
});

test('rear of the car collides while reversing', () => {
  const system = new StaticCollisions();
  system.addBox(0, 5, 4, 0.1);
  const { car, collided } = move(system, { x: 0, z: 0, heading: 0 }, { vx: 0, vz: 9 }, 0.8);
  assert.equal(collided, true);
  assert.ok(car.z <= 5 - CONFIG.collision.halfLength - 0.1);
  assert.ok(car.vz <= 0);
});

test('rotated obstacles produce a collision normal matching their surface', () => {
  const system = new StaticCollisions();
  const heading = Math.PI / 4;
  system.addBox(0, 0, 8, 0.15, heading);
  const normal = { x: Math.sin(heading), z: -Math.cos(heading) };
  const { car, collided } = move(system,
    { x: normal.x * 6, z: normal.z * 6, heading: 0 },
    { vx: -normal.x * 30, vz: -normal.z * 30 }, 0.2);
  const extent = (CONFIG.collision.halfWidth + CONFIG.collision.halfLength) / Math.sqrt(2);
  assert.equal(collided, true);
  assert.ok(car.x * normal.x + car.z * normal.z >= extent + 0.15);
  assert.ok(car.vx * normal.x + car.vz * normal.z >= 0);
});

test('turning the car cannot rotate its nose through an obstacle', () => {
  const system = new StaticCollisions();
  system.addBox(0, 0, 0.2, 20);
  const { car, collided } = move(system, { x: -1.7, z: 0, heading: 0 }, { vx: 0, vz: 0 }, 1 / 120, Math.PI / 2);
  assert.equal(collided, true);
  assert.ok(car.x <= -CONFIG.collision.halfLength - 0.2);
  assert.equal(car.heading, Math.PI / 2);
});

test('continued acceleration into a wall stays outside it and reversing releases contact', () => {
  const system = new StaticCollisions();
  system.addBox(0, 0, 4, 0.1);
  const car = new Vehicle();
  Object.assign(car, { x: 0, z: 2.3, heading: 0 });
  for (let i = 0; i < 240; i++) {
    const before = { x: car.x, z: car.z, heading: car.heading };
    car.update(CONFIG.physics.step, { throttle: 1, brake: 0, steer: 0 });
    system.resolve(car, before, CONFIG.physics.step);
    assert.ok(car.z >= CONFIG.collision.halfLength + 0.1 - 1e-9);
    assert.ok(Number.isFinite(car.speed));
  }
  const stoppedAt = car.z;
  for (let i = 0; i < 120; i++) {
    const before = { x: car.x, z: car.z, heading: car.heading };
    car.update(CONFIG.physics.step, { throttle: 0, brake: 1, steer: 0 });
    system.resolve(car, before, CONFIG.physics.step);
  }
  assert.ok(car.z > stoppedAt + 1);
});

test('registration uses parent translation, rotation and scaling, and ignores decorative meshes', () => {
  const scene = new THREE.Scene(), group = new THREE.Group();
  group.position.set(12, 0, -8);
  group.rotation.y = -Math.PI / 4;
  group.scale.setScalar(1.1);
  scene.add(group);
  const material = new THREE.MeshBasicMaterial();
  const physical = box(group, material, [4.6, 0.18, 0.8], [0, 1.25, 0], true);
  box(group, material, [9, 0.1, 9], [0, 6, 0]);
  const system = new StaticCollisions();
  system.registerScene(scene);
  assert.equal(system.obstacles.length, 1);
  const collider = system.obstacles[0];
  assert.equal(collider.x, 12);
  assert.equal(collider.z, -8);
  assert.ok(Math.abs(collider.halfWidth - 2.53) < 1e-10);
  assert.ok(Math.abs(collider.halfLength - 0.44) < 1e-10);
  const worldPoint = new THREE.Vector3().setFromMatrixPosition(physical.matrixWorld);
  assert.equal(collider.x, worldPoint.x);
  assert.ok(Math.abs(collider.axes[0].x - Math.SQRT1_2) < 1e-10);
  assert.ok(Math.abs(collider.axes[0].z - Math.SQRT1_2) < 1e-10);
});

test('real roadside props are solid while the full circuit, grid and overhead arches stay clear', () => {
  // Canvas text has no bearing on mesh transforms; stub only this browser API
  // so the actual procedural world can be checked without a GPU or a DOM.
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  let world;
  try { world = createWorld(new THREE.Scene()); } finally { globalThis.document = originalDocument; }
  assert.ok(world.collisions.obstacles.length > 100);
  const car = new Vehicle();
  Object.assign(car, gridPose);
  assert.equal(world.collisions.resolve(car, gridPose, 0), false);
  for (let i = 0; i < track.points.length; i++) {
    const frame = track.frame(i / track.points.length);
    const pose = { x: frame.position.x, z: frame.position.z, heading: frame.heading };
    Object.assign(car, pose, { vx: 0, vz: 0 });
    assert.equal(world.collisions.resolve(car, pose, 0), false, `blocked course at ${i}`);
  }
  const post = world.collisions.obstacles[0];
  const { collided } = move(world.collisions, { x: post.x, z: post.z + 6, heading: 0 }, { vx: 0, vz: -20 }, 0.3);
  assert.equal(collided, true, 'the actual start arch post should block a car');
});
