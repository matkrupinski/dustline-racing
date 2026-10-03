import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COURSES } from '../src/game/track.js';
import { CONFIG } from '../src/game/config.js';
import { Vehicle } from '../src/game/vehicle.js';
import { Race } from '../src/game/race.js';
import { createWorld } from '../src/game/world.js';
import { createCar } from '../src/game/car-model.js';
import { WheelParticles } from '../src/game/wheel-particles.js';

const snow = COURSES['winter-pass'], dirt = COURSES['dirt-circuit'];
const controls = (throttle = 0, brake = 0, steer = 0) => ({ throttle, brake, steer });
function worldFor(scene, course) {
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  try { return createWorld(scene, course); } finally { globalThis.document = original; }
}
function cross(race, gate, dt = 4) {
  const pose = (offset) => ({ x: gate.position.x + gate.forward.x * offset, z: gate.position.z + gate.forward.z * offset });
  return race.update(dt, pose(-1), pose(1));
}

test('winter has its own closed 560m layout, forward grid and six ordered gates', () => {
  assert.ok(Math.abs(snow.length - 560) < 0.1);
  assert.equal(snow.width, 14);
  assert.ok(snow.curve.getPointAt(0).distanceTo(snow.curve.getPointAt(1)) < 1e-6);
  assert.ok(snow.onTrack(snow.gridPose.x, snow.gridPose.z));
  const gridDirection = new THREE.Vector3(Math.sin(snow.gridPose.heading), 0, -Math.cos(snow.gridPose.heading));
  assert.ok(gridDirection.dot(snow.frame(1 - 6 / snow.length).forward) > 0.999);
  assert.equal(snow.checkpoints.length, 6);
  assert.ok(snow.frame(0.5).position.distanceTo(dirt.frame(0.5).position) > 20);
  snow.checkpoints.forEach((gate) => assert.ok(snow.project(gate.position.x, gate.position.z).distance < 0.1));
});

test('snow accelerates more slowly and braking from the same speed needs more distance', () => {
  const accelerate = (course) => {
    const car = new Vehicle(course.physics);
    for (let i = 0; i < 120; i++) car.update(1 / 120, controls(1));
    return car.speed;
  };
  assert.ok(accelerate(snow) < accelerate(dirt) * 0.8);
  const stopDistance = (course) => {
    const car = new Vehicle(course.physics);
    Object.assign(car, { x: 0, z: 0, heading: 0, vx: 0, vz: -20, forwardSpeed: 20 });
    for (let i = 0; i < 1200 && car.forwardSpeed > 0.1; i++) car.update(1 / 120, controls(0, 1));
    assert.ok(car.forwardSpeed <= 0.1);
    return Math.abs(car.z);
  };
  assert.ok(stopDistance(snow) > stopDistance(dirt) * 1.6);
});

test('snow retains more lateral momentum; deep roadside snow adds resistance', () => {
  const slipAfter = (course) => {
    const car = new Vehicle(course.physics);
    Object.assign(car, { heading: 0, vx: 6, vz: -15 });
    for (let i = 0; i < 30; i++) car.update(1 / 120, controls());
    return Math.abs(car.slip);
  };
  assert.ok(slipAfter(snow) > slipAfter(dirt) * 2);
  const coast = (road) => {
    const car = new Vehicle(snow.physics);
    Object.assign(car, { heading: 0, vx: 0, vz: -20 });
    for (let i = 0; i < 120; i++) car.update(1 / 120, controls(), road);
    return car.speed;
  };
  assert.ok(coast(false) < coast(true) - 5);
  const car = new Vehicle(snow.physics); car.reset();
  assert.equal(car.physics, snow.physics);
  car.physics = dirt.physics; car.reset();
  assert.equal(car.physics, CONFIG.physics);
  assert.equal(CONFIG.physics.brake, 22);
});

test('winter validates checkpoint order and recovers to its own last cleared gate', () => {
  const race = new Race(null, snow); race.start(); cross(race, snow.finishGate);
  cross(race, snow.checkpoints[1]); assert.equal(race.splits.length, 0);
  cross(race, snow.checkpoints[0]); assert.equal(race.splits.length, 1);
  const elapsed = race.elapsed, splits = structuredClone(race.splits);
  const frame = snow.frame(snow.checkpoints[0].u + 2 / snow.length);
  const destination = race.recover();
  assert.ok(Math.hypot(destination.x - frame.position.x, destination.z - frame.position.z) < 1e-8);
  assert.equal(destination.heading, frame.heading);
  assert.equal(race.elapsed, elapsed); assert.deepEqual(race.splits, splits);
  snow.checkpoints.slice(1).forEach((gate) => cross(race, gate));
  cross(race, snow.finishGate); assert.equal(race.state, 'finished');
  race.reset(); race.start(); assert.deepEqual(race.recover(), snow.gridPose);
});

test('dirt and winter records stay separate, keeping the existing dirt storage key', () => {
  const data = new Map([[dirt.bestKey, '21']]);
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const race = new Race(storage, snow); assert.equal(race.best, null);
  race.start(); cross(race, snow.finishGate);
  snow.checkpoints.forEach((gate) => cross(race, gate)); cross(race, snow.finishGate);
  assert.equal(race.state, 'finished');
  assert.equal(data.get(dirt.bestKey), '21');
  assert.equal(new Race(storage, snow).best, race.elapsed);
  assert.equal(new Race(storage, dirt).best, 21);
  assert.equal(dirt.bestKey, 'dustline:spline-circuit-v1:best');
});

test('the winter road is clear, props collide, and switching worlds releases only course resources', () => {
  const scene = new THREE.Scene(), car = createCar(scene), world = worldFor(scene, snow);
  assert.ok(world.collisions.obstacles.length > 100);
  const vehicle = new Vehicle(snow.physics);
  for (let i = 0; i < snow.points.length; i++) {
    const frame = snow.frame(i / snow.points.length);
    const pose = { x: frame.position.x, z: frame.position.z, heading: frame.heading };
    Object.assign(vehicle, pose, { vx: 0, vz: 0 });
    assert.equal(world.collisions.resolve(vehicle, pose, 0), false, `blocked winter road at ${i}`);
  }
  const post = world.collisions.obstacles[0], before = { x: post.x, z: post.z + 6, heading: 0 };
  Object.assign(vehicle, before, { vx: 0, vz: -20 });
  assert.equal(world.collisions.resolve(vehicle, before, 0.3), true);
  const remaining = scene.children.filter((child) => child !== world.root);
  let geometryDisposed = false;
  world.root.children.find((child) => child.geometry).geometry.addEventListener('dispose', () => { geometryDisposed = true; });
  world.dispose();
  assert.equal(world.root.parent, null); assert.equal(world.collisions.obstacles.length, 0);
  assert.deepEqual(scene.children, remaining); assert.ok(geometryDisposed);
  car.update(snow.gridPose, vehicle);
  assert.ok(scene.children.length > 0); // The gameplay car survived world disposal.
  const next = worldFor(scene, dirt); assert.equal(next.root.name, 'dirt-circuit'); next.dispose();
});

test('winter emits white snow instead of sand and clears particles on map switching', () => {
  const scene = new THREE.Scene(), car = createCar(scene), particles = new WheelParticles(scene, car, snow);
  const vehicle = new Vehicle(snow.physics);
  Object.assign(vehicle, { vx: 0, vz: -15, heading: 0 });
  particles.emit(new THREE.Vector3(), vehicle, vehicle, true);
  assert.ok(particles.dust[0].color.b > particles.dust[0].color.r);
  assert.ok(particles.sand[0].color.b >= particles.sand[0].color.r);
  particles.setCourse(dirt);
  assert.ok(particles.dust.every((puff) => puff.life === 0));
  assert.ok(particles.sand.every((grain) => grain.life === 0));
  assert.equal(particles.course, dirt); particles.dispose();
});

test('careful winter driving completes all gates in about 30 seconds with real snow physics and collisions', () => {
  const world = worldFor(new THREE.Scene(), snow);
  for (const cruise of [20, 22, 24]) {
    const car = new Vehicle(snow.physics); Object.assign(car, snow.gridPose);
    const race = new Race(null, snow); race.start(); let maxDistance = 0;
    for (let i = 0; i < 120 * 40 && race.state === 'racing'; i++) {
      const projection = snow.project(car.x, car.z);
      maxDistance = Math.max(maxDistance, projection.distance);
      const target = snow.frame(projection.progress + (8 + car.speed * 0.45) / snow.length).position;
      const desired = Math.atan2(target.x - car.x, -(target.z - car.z));
      const error = Math.atan2(Math.sin(desired - car.heading), Math.cos(desired - car.heading));
      const steer = Math.max(-1, Math.min(1, error * 2.2 - car.yawRate * 0.22));
      const targetSpeed = cruise - Math.min(7, Math.abs(error) * 6), before = { x: car.x, z: car.z, heading: car.heading };
      car.update(1 / 120, controls(Number(car.speed < targetSpeed), Number(car.speed > targetSpeed + 2), steer), snow.onTrack(car.x, car.z));
      assert.equal(world.collisions.resolve(car, before, 1 / 120), false);
      assert.equal(race.update(1 / 120, before, car), undefined);
    }
    assert.equal(race.state, 'finished'); assert.equal(race.splits.length, 6);
    assert.ok(race.elapsed >= 25 && race.elapsed <= 35, `${race.elapsed}s`);
    assert.ok(maxDistance < snow.width / 2);
  }
  world.dispose();
});
