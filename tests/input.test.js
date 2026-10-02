import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/game/input.js';

test('a short accelerate tap starts immediately, while reverse and modifier shortcuts do not', () => {
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  let starts = 0, resets = 0;
  const input = new Input(() => resets++, () => starts++);
  function key(type, code, extra = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, ...extra });
    window.dispatchEvent(event);
  }
  try {
    key('keydown', 'KeyS');
    assert.equal(starts, 0);
    key('keyup', 'KeyS');
    key('keydown', 'KeyW', { metaKey: true });
    assert.equal(starts, 0);
    key('keydown', 'KeyW'); key('keyup', 'KeyW');
    assert.equal(starts, 1);
    assert.equal(input.sample().throttle, 0);
    key('keydown', 'ArrowUp');
    assert.equal(starts, 2);
    assert.equal(input.sample().throttle, 1);
    window.dispatchEvent(new Event('blur'));
    assert.equal(input.sample().throttle, 0);
    key('keydown', 'KeyR');
    assert.equal(resets, 1);
    // Menu navigation must never start a race or leave driving keys held.
    input.setEnabled(false);
    key('keydown', 'KeyW');
    key('keydown', 'KeyR');
    assert.equal(starts, 2);
    assert.equal(resets, 1);
    assert.deepEqual(input.sample(), { throttle: 0, brake: 0, steer: 0 });
    input.setEnabled(true);
    key('keydown', 'ArrowUp');
    assert.equal(starts, 3);
    assert.equal(input.sample().throttle, 1);
  } finally {
    input.dispose();
    globalThis.window = originalWindow;
  }
});
