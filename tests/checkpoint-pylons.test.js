import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CheckpointPylons } from '../src/game/checkpoint-pylons.js';
import { Vehicle } from '../src/game/vehicle.js';
import { CARS } from '../src/game/cars.js';
import { COURSES, gateCrossing } from '../src/game/track.js';
import { Race } from '../src/game/race.js';
import { createWorld } from '../src/game/world.js';

const dt = 1 / 120;
const pose = (vehicle) => ({ x: vehicle.x, z: vehicle.z, heading: vehicle.heading });
function worldFor(course) {
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  try { return createWorld(new THREE.Scene(), course); } finally { globalThis.document = original; }
}
function pylon(snow = false, heading = 0) {
  const system = new CheckpointPylons({ snow }), mesh = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, 0.12)); pole.position.y = 2.1; mesh.add(pole);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.8, 0.12)); panel.position.y = 2.7; mesh.add(panel);
  mesh.rotation.y = -heading;
  return { system, body: system.add(mesh, heading) };
}
function pass(system, vehicle, seconds) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const before = pose(vehicle);
    vehicle.x += vehicle.vx * dt; vehicle.z += vehicle.vz * dt;
    const snapshot = { ...vehicle };
    system.update(dt, vehicle, before);
    assert.deepEqual({ ...vehicle }, snapshot, 'movable marker must never change vehicle state');
  }
}

test('high-speed swept impacts knock the pylon forwards without blocking either car', () => {
  for (const spec of Object.values(CARS)) {
    const { system, body } = pylon(), vehicle = new Vehicle(undefined, spec);
    Object.assign(vehicle, { x: 0, z: 8, heading: 0, vx: 0, vz: -37 });
    const before = pose(vehicle); vehicle.z -= 37 * 0.45;
    const snapshot = { ...vehicle }; system.update(dt, vehicle, before);
    assert.ok(body.hit); assert.deepEqual({ ...vehicle }, snapshot);
    for (let i = 0; i < 240; i++) system.update(dt);
    assert.ok(body.mesh.position.z < -1); assert.ok(body.tilt > 1.4);
    assert.equal(vehicle.vz, -37);
  }
});

test('reverse and angled glancing hits fall along actual motion; nearby misses stay upright', () => {
  const reverse = pylon(), car = new Vehicle();
  Object.assign(car, { x: 0, z: -5, heading: 0, vx: 0, vz: 9 });
  pass(reverse.system, car, 1); assert.ok(reverse.body.hit); assert.ok(reverse.body.mesh.position.z > 0);
  const glancing = pylon(false, Math.PI / 4);
  Object.assign(car, { x: -5, z: -0.8, heading: Math.PI / 2, vx: 20, vz: 0 });
  pass(glancing.system, car, 0.6); assert.ok(glancing.body.hit); assert.ok(glancing.body.mesh.position.x > 0);
  const miss = pylon();
  Object.assign(car, { x: 3, z: 5, heading: 0, vx: 0, vz: -20 });
  pass(miss.system, car, 0.5); assert.equal(miss.body.hit, false); assert.equal(miss.body.tilt, 0);
});

test('fallen markers settle above ground and slide further on snow', () => {
  const dirt = pylon(), snow = pylon(true), vehicle = new Vehicle();
  Object.assign(vehicle, { x: 0, z: 0, heading: 0, vx: 0, vz: -20 });
  for (const { system, body } of [dirt, snow]) {
    system.update(dt, vehicle, { x: 0, z: 3, heading: 0 });
    for (let i = 0; i < 1200; i++) {
      system.update(dt);
      assert.ok(new THREE.Box3().setFromObject(body.mesh).min.y >= 0, 'pylon must not fall through ground');
    }
    assert.equal(body.active, false); assert.equal(body.vx, 0); assert.equal(body.vz, 0);
    assert.equal(body.tilt, Math.PI / 2);
  }
  assert.ok(Math.abs(snow.body.mesh.position.z) > Math.abs(dirt.body.mesh.position.z) * 1.5);
});

test('restart restores upright pylons and permits another impact; stationary cars do not trigger them', () => {
  const { system, body } = pylon(false, 0.6), vehicle = new Vehicle();
  Object.assign(vehicle, { x: 0, z: 0, heading: 0, vx: 0, vz: 0 });
  system.update(dt, vehicle); assert.equal(body.hit, false);
  vehicle.vz = -15; system.update(dt, vehicle);
  for (let i = 0; i < 100; i++) system.update(dt);
  system.reset();
  assert.deepEqual(body.mesh.position, body.spawn); assert.ok(body.mesh.quaternion.equals(body.orientation));
  assert.equal(body.active, false); assert.equal(body.hit, false);
  assert.equal(body.tilt, 0); assert.equal(body.lift, 0); assert.equal(body.angularVelocity, 0);
  assert.equal(body.vz, 0); system.update(dt, vehicle); assert.ok(body.hit);
});

test('every real checkpoint pylon is passable and independent of fixed gate validation on all maps', () => {
  for (const course of Object.values(COURSES)) {
    const world = worldFor(course);
    assert.equal(world.pylons.bodies.length, course.checkpoints.length * 2);
    for (const body of world.pylons.bodies) {
      body.mesh.traverse((mesh) => assert.ok(!mesh.userData.collidable));
      for (const spec of Object.values(CARS)) {
        const vehicle = new Vehicle(course.physics, spec);
        Object.assign(vehicle, { x: body.spawn.x, z: body.spawn.z, heading: body.heading });
        assert.equal(world.collisions.resolve(vehicle, pose(vehicle), 0), false);
      }
    }
    for (const spec of Object.values(CARS)) {
      world.pylons.reset();
      const gate = course.checkpoints[0], body = world.pylons.bodies[1];
      const savedGate = { position: gate.position.clone(), heading: gate.heading, halfWidth: gate.halfWidth };
      const vehicle = new Vehicle(course.physics, spec), race = new Race(null, course, spec);
      race.start(); race.startedLap = true;
      Object.assign(vehicle, { x: body.spawn.x - gate.forward.x * 5, z: body.spawn.z - gate.forward.z * 5,
        heading: gate.heading, vx: gate.forward.x * 20, vz: gate.forward.z * 20 });
      let crossing = false;
      for (let i = 0; i < 90; i++) {
        const before = pose(vehicle);
        vehicle.update(dt, { throttle: 1, brake: 0, steer: 0 }, course.onTrack(vehicle.x, vehicle.z));
        assert.equal(world.collisions.resolve(vehicle, before, dt), false);
        const speed = vehicle.speed; world.pylons.update(dt, vehicle, before);
        assert.equal(vehicle.speed, speed);
        crossing ||= gateCrossing(before, vehicle, gate) !== null;
        assert.equal(race.update(dt, before, vehicle), undefined);
      }
      assert.ok(body.hit); assert.ok(crossing); assert.equal(race.splits.length, 1);
      assert.deepEqual(gate.position, savedGate.position);
      assert.equal(gate.heading, savedGate.heading); assert.equal(gate.halfWidth, savedGate.halfWidth);
    }
    world.dispose(); assert.equal(world.pylons.bodies.length, 0);
  }
});
