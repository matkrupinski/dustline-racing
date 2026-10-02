import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, BEST_KEY, formatTime } from '../src/game/race.js';
import { track, gridPose, checkpoints, finishGate, gateCrossing, onTrack } from '../src/game/track.js';
import { Vehicle } from '../src/game/vehicle.js';

function positionAt(gate, forward, sideways = 0) {
  return {
    x: gate.position.x + gate.forward.x * forward + gate.right.x * sideways,
    z: gate.position.z + gate.forward.z * forward + gate.right.z * sideways,
  };
}
function cross(race, gate, dt = 1) { race.update(dt, positionAt(gate, -1), positionAt(gate, 1)); }
function lap(storage, sectorTime = 4) {
  const race = new Race(storage);
  race.start();
  cross(race, finishGate);
  checkpoints.forEach((gate) => cross(race, gate, sectorTime));
  cross(race, finishGate);
  return race;
}
function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('course is a 640m closed spline with a forward-facing grid before the line', () => {
  assert.ok(Math.abs(track.length - 640) < 0.1);
  assert.ok(track.curve.getPointAt(0).distanceTo(track.curve.getPointAt(1)) < 1e-6);
  assert.ok(onTrack(gridPose.x, gridPose.z));
  assert.ok(Math.abs(gridPose.heading) < 0.02);
  assert.ok((gridPose.z - finishGate.position.z) > 5);
  for (const gate of checkpoints) assert.ok(track.project(gate.position.x, gate.position.z).distance < 0.1);
});

test('timer remains idle until acceleration starts the race; initial line cannot finish', () => {
  const race = new Race();
  cross(race, finishGate);
  assert.equal(race.elapsed, 0);
  assert.equal(race.state, 'ready');
  race.start(); cross(race, finishGate);
  assert.equal(race.state, 'racing');
  assert.equal(race.startedLap, true);
  assert.equal(race.elapsed, 1);
});

test('swept gates reject reverse and off-road crossings and interpolate a fast crossing', () => {
  const gate = checkpoints[0];
  assert.equal(gateCrossing(positionAt(gate, 2), positionAt(gate, -2), gate), null);
  assert.equal(gateCrossing(positionAt(gate, -2, 12), positionAt(gate, 2, 12), gate), null);
  assert.ok(Math.abs(gateCrossing(positionAt(gate, -3), positionAt(gate, 1), gate) - 0.75) < 1e-8);
});

test('checkpoints are sequential, cannot be repeated, and cannot be skipped for a finish', () => {
  const race = new Race(); race.start(); cross(race, finishGate);
  cross(race, checkpoints[1]);
  assert.equal(race.splits.length, 0);
  cross(race, checkpoints[0]); cross(race, checkpoints[0]);
  assert.equal(race.splits.length, 1);
  cross(race, finishGate);
  assert.equal(race.state, 'racing');
  assert.match(race.cue, /MISSED CP 02/);
});

test('finish freezes interpolated timing and exposes cumulative and sector splits', () => {
  const race = lap(null);
  assert.equal(race.state, 'finished');
  assert.equal(race.splits.length, 6);
  assert.equal(race.elapsed, 25.5);
  assert.equal(race.splits[0].cumulative, 3);
  assert.equal(race.splits[1].sector, 4);
  cross(race, finishGate, 10);
  assert.equal(race.elapsed, 25.5);
});

test('short drift excursions keep driving; extended departure returns to the grid without stopping', () => {
  const race = new Race(); race.start();
  const outside = { x: -100, z: -100 };
  race.update(0.5, outside, outside);
  assert.equal(race.state, 'racing');
  race.update(0.1, gridPose, gridPose);
  assert.equal(race.offCourseTime, 0);
  const recovery = race.update(1.3, outside, outside);
  assert.deepEqual(recovery, gridPose);
  assert.equal(race.state, 'racing');
  assert.equal(race.offCourseTime, 0);
  assert.equal(race.elapsed, 1.9);
  assert.equal(race.best, null);
});

test('recovery uses the last cleared checkpoint, preserving splits, timer and next gate', () => {
  const race = new Race(); race.start(); cross(race, finishGate);
  cross(race, checkpoints[0]); cross(race, checkpoints[1]);
  // A later gate crossed out of sequence cannot become the recovery anchor.
  cross(race, checkpoints[4]);
  const splits = structuredClone(race.splits), elapsed = race.elapsed;
  const outside = { x: -100, z: -100 };
  const destination = race.update(1.3, outside, outside);
  const frame = track.frame(checkpoints[1].u + 2 / track.length);
  assert.ok(Math.hypot(destination.x - frame.position.x, destination.z - frame.position.z) < 1e-8);
  assert.equal(destination.heading, frame.heading);
  assert.ok(onTrack(destination.x, destination.z));
  assert.equal(race.state, 'racing');
  assert.equal(race.elapsed, elapsed + 1.3);
  assert.deepEqual(race.splits, splits);
  assert.equal(race.startedLap, true);
  assert.match(race.cue, /POWRÓT DO CP 02/);
  // The caller applies the destination to both simulation endpoints.
  race.update(0.1, destination, destination);
  assert.equal(race.splits.length, 2);
  cross(race, checkpoints[1]);
  assert.equal(race.splits.length, 2);
  cross(race, checkpoints[2]);
  assert.equal(race.splits.length, 3);
});

test('returning before the first checkpoint rearms the starting line and allows a full finish', () => {
  const race = new Race(); race.start(); cross(race, finishGate);
  const outside = { x: -100, z: -100 };
  assert.deepEqual(race.update(1.3, outside, outside), gridPose);
  assert.equal(race.startedLap, false);
  cross(race, finishGate);
  assert.equal(race.startedLap, true);
  assert.equal(race.state, 'racing');
  checkpoints.forEach((gate) => cross(race, gate));
  cross(race, finishGate);
  assert.equal(race.state, 'finished');
  assert.ok(race.elapsed > 1.3);
});

test('repeated recoveries after the last checkpoint still allow finishing and retain a saved best', () => {
  const storage = memoryStorage(); storage.setItem(BEST_KEY, '10');
  const race = new Race(storage); race.start(); cross(race, finishGate);
  checkpoints.forEach((gate) => cross(race, gate, 4));
  const splits = structuredClone(race.splits), outside = { x: -100, z: -100 };
  const first = race.update(1.3, outside, outside);
  const second = race.update(1.3, outside, outside);
  assert.deepEqual(first, second);
  assert.deepEqual(race.splits, splits);
  assert.equal(race.best, 10);
  cross(race, finishGate);
  assert.equal(race.state, 'finished');
  assert.equal(race.best, 10);
  assert.equal(storage.getItem(BEST_KEY), '10');
});

test('leaving map bounds recovers immediately, while ready and finished races remain unchanged', () => {
  const race = new Race(), outside = { x: 241, z: 0 };
  assert.equal(race.update(0.01, gridPose, outside), undefined);
  assert.equal(race.recover(), null);
  race.start(); cross(race, finishGate); cross(race, checkpoints[0]);
  assert.ok(race.update(0.01, outside, outside));
  assert.equal(race.state, 'racing');
  const finished = lap(null), elapsed = finished.elapsed;
  assert.equal(finished.update(1, outside, outside), undefined);
  assert.equal(finished.recover(), null);
  assert.equal(finished.elapsed, elapsed);
});

test('personal best survives reload, only improves, and reset preserves it', () => {
  const storage = memoryStorage();
  const first = lap(storage);
  assert.equal(first.isPersonalBest, true);
  const slower = lap(storage, 5);
  assert.equal(slower.isPersonalBest, false);
  assert.equal(slower.best, first.elapsed);
  const faster = lap(storage, 3);
  assert.equal(faster.isPersonalBest, true);
  assert.equal(new Race(storage).best, faster.elapsed);
  faster.reset();
  assert.equal(faster.state, 'ready');
  assert.equal(faster.elapsed, 0);
  assert.equal(faster.splits.length, 0);
  assert.equal(faster.startedLap, false);
  assert.equal(faster.best, 19.5);
});

test('blocked or corrupt storage does not break racing', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const finished = lap(blocked);
  assert.equal(finished.state, 'finished');
  assert.equal(finished.storageAvailable, false);
  assert.equal(finished.best, 25.5);
  for (const raw of ['broken json', '-1', 'null', '"20"', '1e999']) {
    const storage = memoryStorage(); storage.setItem(BEST_KEY, raw);
    assert.equal(new Race(storage).best, null);
    assert.equal(lap(storage).state, 'finished');
  }
});

test('timer formats minute rollover and milliseconds', () => {
  assert.equal(formatTime(0), '00:00.000');
  assert.equal(formatTime(59.999), '00:59.999');
  assert.equal(formatTime(60.001), '01:00.001');
});

// Calibration uses the actual unchanged controller, not a distance/speed estimate.
// This driver exists only in tests; no opponent or autopilot ships in the game.
test('moderate driving completes every gate in 25–35 seconds without leaving the dirt', () => {
  for (const cruise of [22, 24, 26, 28]) {
    const car = new Vehicle(); Object.assign(car, gridPose);
    const race = new Race(); race.start();
    let maxDistance = 0;
    for (let i = 0; i < 120 * 40 && race.state === 'racing'; i++) {
      const projection = track.project(car.x, car.z);
      maxDistance = Math.max(maxDistance, projection.distance);
      const target = track.frame(projection.progress + (8 + car.speed * 0.45) / track.length).position;
      const desired = Math.atan2(target.x - car.x, -(target.z - car.z));
      const error = Math.atan2(Math.sin(desired - car.heading), Math.cos(desired - car.heading));
      const steer = Math.max(-1, Math.min(1, error * 2.2 - car.yawRate * 0.22));
      const targetSpeed = cruise - Math.min(7, Math.abs(error) * 6);
      const before = { x: car.x, z: car.z };
      car.update(1 / 120, { throttle: Number(car.speed < targetSpeed), brake: Number(car.speed > targetSpeed + 2), steer }, onTrack(car.x, car.z));
      race.update(1 / 120, before, car);
    }
    assert.equal(race.state, 'finished', `cruise ${cruise}`);
    assert.equal(race.splits.length, 6);
    assert.ok(race.elapsed >= 25 && race.elapsed <= 35, `lap took ${race.elapsed}s`);
    assert.ok(maxDistance < track.width / 2);
  }
});
