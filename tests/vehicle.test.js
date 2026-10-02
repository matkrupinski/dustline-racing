import test from 'node:test';
import assert from 'node:assert/strict';
import { Vehicle } from '../src/game/vehicle.js';
import { CONFIG } from '../src/game/config.js';

const idle = { throttle: 0, brake: 0, steer: 0 };
function drive(vehicle, seconds, controls = idle, onTrack = true) {
  for (let i = 0; i < Math.round(seconds / CONFIG.physics.step); i++) vehicle.update(CONFIG.physics.step, controls, onTrack);
}

test('accelerates forward, respects terminal speed, and coasts down', () => {
  const car = new Vehicle();
  drive(car, 20, { ...idle, throttle: 1 });
  assert.ok(car.speed > 30 && car.speed <= CONFIG.physics.maxForwardSpeed);
  assert.ok(car.z < CONFIG.spawn.z);
  const before = car.speed;
  drive(car, 2);
  assert.ok(car.speed < before);
});

test('braking stops the car before sustained input engages bounded reverse', () => {
  const car = new Vehicle();
  drive(car, 2, { ...idle, throttle: 1 });
  drive(car, 0.25, { ...idle, brake: 1 });
  assert.ok(car.forwardSpeed > 0);
  drive(car, 5, { ...idle, brake: 1 });
  assert.ok(car.forwardSpeed < 0);
  assert.ok(car.speed <= CONFIG.physics.maxReverseSpeed);
});

test('right steering turns right; steering at rest does not spin the vehicle', () => {
  const car = new Vehicle();
  drive(car, 1, { ...idle, steer: 1 });
  assert.equal(car.heading, 0);
  drive(car, 2, { ...idle, throttle: 1, steer: 1 });
  assert.ok(car.x > 0 && car.heading > 0);
});

test('high-speed cornering retains lateral momentum and grip recovers', () => {
  const car = new Vehicle();
  drive(car, 5, { ...idle, throttle: 1 });
  drive(car, 0.8, { ...idle, throttle: 1, steer: 1 });
  assert.ok(Math.abs(car.slip) > 2, 'car should slide relative to its heading');
  drive(car, 2);
  assert.ok(Math.abs(car.slip) < 0.5, 'tires should recover after steering releases');
});

test('grass imposes more resistance than dirt', () => {
  const dirt = new Vehicle(), grass = new Vehicle();
  drive(dirt, 4, { ...idle, throttle: 1 });
  drive(grass, 4, { ...idle, throttle: 1 }, false);
  assert.ok(dirt.speed > grass.speed);
});

test('fixed-step simulation yields the same trajectory at different render rates', () => {
  function simulate(fps) {
    const car = new Vehicle();
    let accumulator = 0;
    for (let frame = 0; frame < fps * 6; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-10 >= CONFIG.physics.step) {
        car.update(CONFIG.physics.step, { throttle: 1, brake: 0, steer: 0.3 });
        accumulator -= CONFIG.physics.step;
      }
    }
    return car;
  }
  const slow = simulate(30), fast = simulate(144);
  assert.ok(Math.abs(slow.x - fast.x) < 1e-8);
  assert.ok(Math.abs(slow.z - fast.z) < 1e-8);
});

test('reset clears velocity, steering, and yaw', () => {
  const car = new Vehicle();
  drive(car, 3, { ...idle, throttle: 1, steer: 1 });
  car.reset();
  assert.equal(car.speed, 0);
  assert.equal(car.steering, 0);
  assert.equal(car.yawRate, 0);
  assert.equal(car.x, CONFIG.spawn.x);
  assert.equal(car.z, CONFIG.spawn.z);
});
