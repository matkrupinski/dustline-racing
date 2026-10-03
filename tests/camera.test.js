import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONFIG } from '../src/game/config.js';
import { ChaseCamera } from '../src/game/camera.js';
import { COURSES } from '../src/game/track.js';

test('chase view keeps the car below center and shows at least 65 meters ahead', () => {
  for (const aspect of [16 / 9, 4 / 3]) {
    const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, 0.1, 400);
    const chase = new ChaseCamera(camera);
    for (const heading of [0, Math.PI / 2, Math.PI, 7 * Math.PI]) {
      const pose = { x: 450, z: -800, heading };
      chase.update(pose, 0, true); camera.updateMatrixWorld();
      const car = new THREE.Vector3(pose.x, 0, pose.z).project(camera);
      const road = new THREE.Vector3(pose.x + Math.sin(heading) * 65, 0, pose.z - Math.cos(heading) * 65).project(camera);
      assert.ok(Math.abs(car.x) < 0.01 && car.y < -0.3 && car.y > -0.8);
      assert.ok(Math.abs(road.x) < 1 && road.y > -1 && road.y < 1 && road.z < 1);
    }
  }
});

test('smoothed chase camera retains the car in frame through the new hairpins', () => {
  const track = COURSES['phonk-docks'];
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 16 / 9, 0.1, 400);
  const chase = new ChaseCamera(camera);
  chase.update(track.gridPose, 0, true);
  for (let distance = 0; distance < track.length; distance += 26 / 60) {
    const frame = track.frame(distance / track.length);
    chase.update({ x: frame.position.x, z: frame.position.z, heading: frame.heading }, 1 / 60);
    camera.updateMatrixWorld();
    const projected = frame.position.clone().project(camera);
    assert.ok(Math.abs(projected.x) < 0.8 && projected.y > -0.85 && projected.y < 0);
  }
});
