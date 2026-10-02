import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GearShiftTracker, displayedGear, MPH_PER_MPS } from '../src/game/gears.js';
import { ExhaustEffects } from '../src/game/exhaust-effects.js';
import { createCar } from '../src/game/car-model.js';

const vehicleAt = (mph) => ({ speed: mph / MPH_PER_MPS, forwardSpeed: mph / MPH_PER_MPS, vx: 0, vz: -mph / MPH_PER_MPS, steering: 0 });

test('visual gears retain the existing HUD boundaries and reverse indication', () => {
  for (const [mph, expected] of [[0, 1], [16.9, 1], [17.1, 2], [34.1, 3], [51.1, 4], [68.1, 5], [90, 5]]) {
    assert.equal(displayedGear(vehicleAt(mph)), expected);
  }
  assert.equal(displayedGear({ speed: 8, forwardSpeed: -8 }), 'R');
});

test('accelerating and braking across a boundary emit one directional shift', () => {
  const tracker = new GearShiftTracker();
  assert.equal(tracker.update(0.01, vehicleAt(33), true), null);
  assert.equal(tracker.update(0.01, vehicleAt(35), true), 'up');
  assert.equal(tracker.update(0.25, vehicleAt(35), true), null);
  assert.equal(tracker.update(0.01, vehicleAt(33), true), 'down');
  assert.equal(tracker.update(0.25, vehicleAt(33), true), null);
});

test('gear boundary jitter cannot produce a rapid flashing loop', () => {
  const tracker = new GearShiftTracker();
  tracker.update(0.01, vehicleAt(16.9), true);
  assert.equal(tracker.update(0.01, vehicleAt(17.1), true), 'up');
  assert.equal(tracker.update(0.01, vehicleAt(16.9), true), null);
  assert.equal(tracker.update(0.01, vehicleAt(17.1), true), null);
  assert.equal(tracker.update(0.2, vehicleAt(16.9), true), 'down');
});

test('inactive racing, reverse transitions, and reset do not backfire', () => {
  const tracker = new GearShiftTracker();
  tracker.update(0.2, vehicleAt(16), false);
  assert.equal(tracker.update(0.2, vehicleAt(18), false), null);
  assert.equal(tracker.update(0.2, vehicleAt(18), true), null);
  assert.equal(tracker.update(0.2, { speed: 8, forwardSpeed: -8 }, true), null);
  assert.equal(tracker.update(0.2, vehicleAt(18), true), null);
  tracker.reset();
  assert.equal(tracker.update(0.2, vehicleAt(50), true), null);
});

test('tailpipe position and outward direction follow the real model at different headings', () => {
  const car = createCar(new THREE.Scene());
  const position = new THREE.Vector3(), direction = new THREE.Vector3();
  car.update({ x: 10, z: 20, heading: 0 }, vehicleAt(35));
  car.getExhaustTransform(position, direction);
  assert.ok(position.z > 22 && position.x < 10);
  assert.ok(direction.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-9);
  car.update({ x: 10, z: 20, heading: Math.PI / 2 }, vehicleAt(35));
  car.getExhaustTransform(position, direction);
  assert.ok(position.x < 8 && position.z < 20);
  assert.ok(direction.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-9);
});

test('downshifts are stronger, sparks are bounded, and the burst expires', () => {
  const scene = new THREE.Scene(), car = createCar(scene), effect = new ExhaustEffects(scene, car);
  const vehicle = vehicleAt(35);
  car.update({ x: 0, z: 0, heading: 0 }, vehicle);
  effect.trigger('up'); effect.update(0.01, vehicle);
  const upDuration = effect.duration, upLength = effect.flame.scale.z;
  assert.equal(effect.flame.visible, true);
  assert.equal(effect.grains.count, 6);
  effect.reset();
  effect.trigger('down'); effect.update(0.01, vehicle);
  assert.ok(effect.duration > upDuration);
  assert.ok(effect.flame.scale.z > upLength);
  assert.equal(effect.grains.count, 9);
  for (let i = 0; i < 10; i++) { effect.trigger('down'); effect.update(0.01, vehicle); }
  assert.ok(effect.grains.count <= 24);
  effect.update(0.5, vehicle);
  assert.equal(effect.flame.visible, false);
  assert.equal(effect.grains.count, 0);
  assert.equal(effect.light.intensity, 0);
  effect.dispose();
  assert.equal(effect.flame.parent, null);
});

test('reset clears queued bursts and all live sparks without changing the vehicle', () => {
  const scene = new THREE.Scene(), car = createCar(scene), effect = new ExhaustEffects(scene, car);
  const vehicle = vehicleAt(35), before = { ...vehicle };
  car.update({ x: 0, z: 0, heading: 0 }, vehicle);
  effect.trigger('down'); effect.update(0.01, vehicle);
  effect.trigger('up'); effect.reset(); effect.update(0.01, vehicle);
  assert.equal(effect.flame.visible, false);
  assert.equal(effect.grains.count, 0);
  assert.equal(effect.pending, null);
  assert.deepEqual(vehicle, before);
});
