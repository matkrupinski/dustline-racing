import test from 'node:test';
import assert from 'node:assert/strict';
import { engineRPM, VehicleAudio } from '../src/game/vehicle-audio.js';
import { MPH_PER_MPS } from '../src/game/gears.js';

const at = (mph) => ({ speed: mph / MPH_PER_MPS, forwardSpeed: mph / MPH_PER_MPS });
const coast = { throttle: 0, brake: 0 }, accelerate = { throttle: 1, brake: 0 };

test('RPM rises within a gear, falls on an upshift, and responds to engine load', () => {
  assert.equal(engineRPM(at(0), coast), 900);
  assert.ok(engineRPM(at(14), accelerate) > engineRPM(at(10), accelerate));
  assert.ok(engineRPM(at(17.1), accelerate) < engineRPM(at(16.9), accelerate));
  assert.ok(engineRPM(at(10), accelerate) > engineRPM(at(10), coast));
  assert.ok(engineRPM(at(33.9), coast) > engineRPM(at(34.1), coast));
});

test('reverse uses brake load, fifth gear stays bounded, and sound never mutates physics', () => {
  const reverse = { speed: 8, forwardSpeed: -8 }, before = { ...reverse };
  assert.ok(engineRPM(reverse, { throttle: 0, brake: 1 }) > engineRPM(reverse, coast));
  assert.equal(engineRPM(reverse, accelerate), engineRPM(reverse, coast));
  assert.deepEqual(reverse, before);
  for (const mph of [68, 80, 100, 500]) {
    assert.ok(engineRPM(at(mph), accelerate) <= 6450);
  }
});

test('no AudioContext is created on load or while muted; unsupported audio is harmless', async () => {
  let calls = 0;
  const audio = new VehicleAudio(() => { calls++; return null; });
  audio.update(at(20), accelerate, true);
  audio.trigger('down'); audio.reset();
  assert.equal(calls, 0);
  audio.setMuted(true);
  assert.equal(await audio.unlock(), false);
  assert.equal(calls, 0);
  audio.setMuted(false);
  assert.equal(await audio.unlock(), false);
  assert.equal(calls, 1);
  audio.dispose();
});

test('denied initialization does not reject the game gesture callback', async () => {
  const audio = new VehicleAudio(() => { throw new Error('Audio unavailable'); });
  assert.equal(await audio.unlock(), false);
  audio.update(at(20), accelerate, true);
  audio.dispose();
});

test('muted/suspended/reverse-like events cannot queue delayed backfires', () => {
  const audio = new VehicleAudio();
  audio.context = { state: 'running' };
  audio.trigger('up');
  assert.equal(audio.pending, 'up');
  audio.reset();
  audio.trigger('R');
  assert.equal(audio.pending, null);
  audio.context.state = 'suspended';
  audio.trigger('down');
  assert.equal(audio.pending, null);
  audio.context.state = 'running';
  audio.setMuted(true); audio.trigger('down');
  assert.equal(audio.pending, null);
});
