import * as THREE from 'three';
import { box } from './world.js';

export function createCar(scene) {
  const material = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
  const yellow = material('#e2b849'), white = material('#e6dfc8'), dark = material('#1b2939');
  const rubber = material('#222825'), red = material('#b73c30'), glass = material('#263b4c');
  const root = new THREE.Group(), body = new THREE.Group();
  root.scale.x = 1.15;
  root.add(body);
  scene.add(root);
  box(body, dark, [1.82, 0.3, 4.0], [0, 0.55, 0]);
  box(body, yellow, [1.78, 0.55, 3.88], [0, 0.86, 0]);
  box(body, white, [1.68, 0.12, 1.15], [0, 1.16, -1.22]);
  box(body, glass, [1.52, 0.64, 1.96], [0, 1.4, 0.04]);
  box(body, white, [1.56, 0.13, 1.38], [0, 1.77, 0.05]);
  // Pillars, a dark rear hatch, and a small spoiler make orientation readable.
  for (const x of [-0.77, 0.77]) {
    for (const z of [-0.73, 0.8]) box(body, white, [0.09, 0.65, 0.12], [x, 1.43, z]);
    box(body, yellow, [0.08, 0.16, 1.9], [x * 1.2, 1.21, 0.05]);
    box(body, red, [0.37, 0.13, 0.06], [x * 0.85, 0.89, 1.98]);
    box(body, white, [0.4, 0.18, 0.06], [x * 0.85, 0.94, -1.97]);
  }
  box(body, dark, [1.5, 0.5, 0.13], [0, 1.25, 1.15]);
  box(body, dark, [1.85, 0.1, 0.3], [0, 1.35, 1.65]);
  // The same tailpipe appears in the menu and anchors the gameplay backfire.
  const exhaust = new THREE.Group();
  exhaust.position.set(-0.62, 0.46, 2.08);
  body.add(exhaust);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.3, 8), material('#717776'));
  pipe.rotation.x = Math.PI / 2;
  pipe.position.z = -0.12;
  exhaust.add(pipe);
  const opening = new THREE.Mesh(new THREE.CircleGeometry(0.078, 8), dark);
  opening.position.z = 0.032;
  exhaust.add(opening);
  const wheels = [];
  for (const x of [-0.91, 0.91]) for (const z of [-1.2, 1.24]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.49, z);
    root.add(pivot);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.28, 10), rubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    wheels.push({ pivot, front: z < 0, contact: new THREE.Vector3() });
  }
  return {
    getExhaustTransform(position, direction) {
      root.updateWorldMatrix(true, true);
      position.set(0, 0, 0.04).applyMatrix4(exhaust.matrixWorld);
      direction.set(0, 0, 1).transformDirection(exhaust.matrixWorld);
    },
    getWheelContacts() {
      root.updateWorldMatrix(true, false);
      wheels.forEach((wheel) => {
        wheel.contact.set(wheel.pivot.position.x, 0.05, wheel.pivot.position.z).applyMatrix4(root.matrixWorld);
      });
      return wheels;
    },
    update(pose, vehicle) {
      root.position.set(pose.x, 0, pose.z);
      // Three.js positive Y rotation points -Z left; physics positive heading points right.
      root.rotation.y = -pose.heading;
      body.rotation.z = vehicle.steering * Math.min(vehicle.speed / 500, 0.045);
      wheels.forEach(({ pivot, front }) => { if (front) pivot.rotation.y = -vehicle.steering * 0.4; });
    },
  };
}
