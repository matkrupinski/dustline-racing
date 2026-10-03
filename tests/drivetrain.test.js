import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CARS, DEFAULT_CAR, bestKeyFor } from '../src/game/cars.js';
import { COURSES } from '../src/game/track.js';
import { Vehicle } from '../src/game/vehicle.js';
import { Race } from '../src/game/race.js';
import { createCar } from '../src/game/car-model.js';
import { createWorld } from '../src/game/world.js';
import { StaticCollisions } from '../src/game/collisions.js';
import { WheelParticles } from '../src/game/wheel-particles.js';
import { ExhaustEffects } from '../src/game/exhaust-effects.js';

const stratos = CARS['stratos-sprint'], dt = 1 / 120;
const controls = (throttle = 0, steer = 0, brake = 0) => ({ throttle, steer, brake });
function drive(vehicle, seconds, input) {
  for (let i = 0; i < Math.round(seconds / dt); i++) vehicle.update(dt, input);
}
function moving(course, spec, lateral = 0) {
  const car = new Vehicle(course.physics, spec);
  Object.assign(car, { x: 0, z: 0, heading: 0, vx: lateral, vz: -20, forwardSpeed: 20 });
  return car;
}
function worldFor(scene, course) {
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  try { return createWorld(scene, course); } finally { globalThis.document = original; }
}

test('AWD drives both axles, RWD drives only the rear, and snow limits launch traction', () => {
  for (const course of Object.values(COURSES)) {
    const awd = new Vehicle(course.physics), rwd = new Vehicle(course.physics, stratos);
    drive(awd, 1, controls(1)); drive(rwd, 1, controls(1));
    assert.ok(awd.frontDriveForce > 0 && awd.rearDriveForce > 0);
    assert.equal(awd.frontDriveForce, awd.rearDriveForce);
    assert.equal(rwd.frontDriveForce, 0); assert.ok(rwd.rearDriveForce > 0);
    assert.ok(rwd.rearGrip < rwd.frontGrip);
    assert.ok(rwd.wheelSpin > awd.wheelSpin);
    assert.ok(awd.speed > rwd.speed, 'four driven wheels should launch more effectively');
  }
  const snow = new Vehicle(COURSES['winter-pass'].physics, stratos);
  const dirt = new Vehicle(COURSES['dirt-circuit'].physics, stratos);
  drive(snow, 1, controls(1)); drive(dirt, 1, controls(1));
  assert.ok(snow.speed < dirt.speed * 0.8);
});

test('changing only the drivetrain increases power oversteer; lifting and countersteering recover it', () => {
  // Hold geometry/power constant to isolate the driven axle from coupe tuning.
  const rearDrive = { ...DEFAULT_CAR, drivetrain: 'rwd', powerOversteer: stratos.powerOversteer };
  for (const course of Object.values(COURSES)) {
    const awd = moving(course, DEFAULT_CAR), rwd = moving(course, rearDrive);
    drive(awd, 0.8, controls(1, 0.55)); drive(rwd, 0.8, controls(1, 0.55));
    assert.ok(rwd.yawRate > awd.yawRate);
    const powered = moving(course, stratos, -5), lifted = moving(course, stratos, -5);
    drive(powered, 0.25, controls(1)); drive(lifted, 0.25, controls());
    assert.ok(Math.abs(powered.slip) > Math.abs(lifted.slip));
    const counter = moving(course, stratos, -5), uncorrected = moving(course, stratos, -5);
    drive(counter, 0.4, controls(1, -0.6)); drive(uncorrected, 0.4, controls(1));
    assert.ok(counter.yawRate < uncorrected.yawRate, 'countersteer must oppose the tail rotation');
    drive(powered, 3, controls());
    assert.equal(powered.wheelSpin, 0);
    assert.equal(powered.rearGrip, 1); assert.ok(Math.abs(powered.slip) < 0.1);
  }
});

test('RWD remains bounded at rest, in reverse and with simultaneous throttle/brake', () => {
  for (const course of Object.values(COURSES)) {
    const car = new Vehicle(course.physics, stratos);
    drive(car, 1, controls(0, 1)); assert.equal(car.heading, 0);
    drive(car, 10, controls(0, 0, 1));
    assert.ok(car.forwardSpeed < 0 && car.speed <= course.physics.maxReverseSpeed + 1e-9);
    drive(car, 2, controls(1, 0.5, 1));
    assert.ok(Number.isFinite(car.heading) && Number.isFinite(car.speed));
    drive(car, 30, controls(1)); assert.ok(car.speed <= course.physics.maxForwardSpeed);
    car.reset();
    assert.equal(car.spec, stratos); assert.equal(car.physics, course.physics);
    assert.equal(car.speed, 0); assert.equal(car.wheelSpin, 0); assert.equal(car.yawRate, 0);
    assert.equal(car.frontDriveForce, 0); assert.equal(car.rearDriveForce, 0);
  }
});

test('RWD fixed steps stay deterministic across 30 and 144 Hz rendering', () => {
  function simulate(fps) {
    const car = new Vehicle(COURSES['winter-pass'].physics, stratos); let accumulator = 0;
    for (let i = 0; i < fps * 5; i++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-10 >= dt) { car.update(dt, controls(1, 0.35)); accumulator -= dt; }
    }
    return car;
  }
  const a = simulate(30), b = simulate(144);
  for (const key of ['x', 'z', 'heading', 'vx', 'vz']) assert.ok(Math.abs(a[key] - b[key]) < 1e-8);
});

test('the shared coupe model is lower, has rear driven contacts and releases its own resources', () => {
  const scene = new THREE.Scene(), hatch = createCar(scene), coupe = createCar(scene, stratos);
  const hatchBounds = new THREE.Box3().setFromObject(hatch.root), coupeBounds = new THREE.Box3().setFromObject(coupe.root);
  assert.ok(coupeBounds.max.y < hatchBounds.max.y - 0.2);
  assert.ok(coupeBounds.max.x <= stratos.collision.halfWidth);
  assert.ok(Math.max(-coupeBounds.min.z, coupeBounds.max.z) <= stratos.collision.halfLength + 0.06);
  assert.equal(coupe.root.userData.carId, stratos.id);
  coupe.update({ x: 10, z: -20, heading: Math.PI / 2 }, { speed: 20, steering: 0 });
  const contacts = coupe.getWheelContacts();
  assert.equal(contacts.length, 4);
  contacts.forEach((wheel) => assert.equal(wheel.driven, !wheel.front));
  const front = contacts.find((wheel) => wheel.front), rear = contacts.find((wheel) => !wheel.front);
  assert.ok(Math.abs(front.contact.distanceTo(rear.contact) - stratos.wheelbase) < 1e-8);
  const position = new THREE.Vector3(), direction = new THREE.Vector3();
  coupe.getExhaustTransform(position, direction);
  assert.ok(direction.x < -0.999 && position.x < 10 - 1.9);
  let disposed = 0;
  coupe.root.traverse((object) => object.geometry?.addEventListener('dispose', () => disposed++));
  coupe.dispose(); assert.ok(disposed > 10); assert.equal(coupe.root.parent, null);
  assert.equal(hatch.root.parent, scene); hatch.dispose();
});

test('collision broad phase and contacts use the selected car dimensions', () => {
  const system = new StaticCollisions(); system.addBox(0, 0, 0.05, 0.05);
  for (const spec of Object.values(CARS)) {
    const vehicle = new Vehicle(COURSES['dirt-circuit'].physics, spec);
    const before = { x: 0, z: 8, heading: 0 };
    Object.assign(vehicle, before, { vx: 0, vz: -35 }); vehicle.z -= 35 * 0.4;
    assert.ok(system.resolve(vehicle, before, 0.4));
    assert.ok(vehicle.z >= spec.collision.halfLength + 0.05);
    assert.ok(vehicle.speed < 3);
  }
});

test('car changes rebind and clear wheel trails and tailpipe effects', () => {
  const scene = new THREE.Scene(), hatch = createCar(scene), coupe = createCar(scene, stratos);
  const particles = new WheelParticles(scene, hatch), exhaust = new ExhaustEffects(scene, hatch);
  const vehicle = moving(COURSES['dirt-circuit'], stratos);
  particles.emit(new THREE.Vector3(), vehicle, vehicle, true); exhaust.trigger('down');
  particles.setCar(coupe); exhaust.setCar(coupe);
  assert.equal(particles.car, coupe); assert.equal(exhaust.car, coupe);
  assert.ok(particles.dust.every((puff) => puff.life === 0));
  assert.equal(exhaust.pending, null);
  particles.dispose(); exhaust.dispose(); hatch.dispose(); coupe.dispose();
});

test('six car/course record categories remain separate and preserve existing hatch records', () => {
  const data = new Map(), storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const keys = new Set(); let seconds = 25;
  for (const course of Object.values(COURSES)) for (const car of Object.values(CARS)) {
    const race = new Race(storage, course, car);
    assert.equal(race.best, null); race.start(); race.elapsed = seconds++; race.finish();
    const best = race.elapsed;
    assert.equal(new Race(storage, course, car).best, best); keys.add(race.recordKey);
    race.reset(); assert.equal(race.best, best);
  }
  assert.equal(keys.size, 6); assert.equal(data.size, 6);
  for (const course of Object.values(COURSES)) assert.equal(bestKeyFor(course), course.bestKey);
});

test('both cars complete ordered laps on both original circuits with real collisions and no recovery', () => {
  for (const course of Object.values(COURSES).filter((course) => course.closed)) {
    const world = worldFor(new THREE.Scene(), course);
    for (const spec of Object.values(CARS)) {
      const car = new Vehicle(course.physics, spec); Object.assign(car, course.gridPose);
      const race = new Race(null, course, spec); race.start(); let maxDistance = 0;
      for (let i = 0; i < 120 * 40 && race.state === 'racing'; i++) {
        const projection = course.project(car.x, car.z); maxDistance = Math.max(maxDistance, projection.distance);
        const target = course.frame(projection.progress + (8 + car.speed * 0.45) / course.length).position;
        const desired = Math.atan2(target.x - car.x, -(target.z - car.z));
        const error = Math.atan2(Math.sin(desired - car.heading), Math.cos(desired - car.heading));
        const steer = Math.max(-1, Math.min(1, error * 2.2 - car.yawRate * 0.22));
        const targetSpeed = (course.theme === 'snow' ? 22 : 26) - Math.min(7, Math.abs(error) * 6);
        const before = { x: car.x, z: car.z, heading: car.heading };
        car.update(dt, controls(Number(car.speed < targetSpeed), steer, Number(car.speed > targetSpeed + 2)), course.onTrack(car.x, car.z));
        assert.equal(world.collisions.resolve(car, before, dt), false);
        assert.equal(race.update(dt, before, car), undefined);
      }
      assert.equal(race.state, 'finished'); assert.equal(race.splits.length, 6);
      assert.ok(race.elapsed >= 25 && race.elapsed <= 35, `${course.id}/${spec.id}: ${race.elapsed}s`);
      assert.ok(maxDistance < course.width / 2);
    }
    world.dispose();
  }
});
