import * as THREE from 'three';
import { box } from './world.js';
import { DEFAULT_CAR, DRIVETRAINS } from './cars.js';

export function createCar(scene, spec = DEFAULT_CAR) {
  const material = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
  const yellow = material('#e2b849'), white = material('#e6dfc8'), dark = material('#1b2939');
  const rubber = material('#222825'), red = material('#b73c30'), glass = material('#263b4c');
  const root = new THREE.Group(), body = new THREE.Group();
  root.scale.x = spec.model === 'hatch' ? 1.15 : 1;
  root.userData.carId = spec.id;
  root.add(body);
  scene.add(root);
  if (spec.model === 'hatch') {
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
  } else {
    // Short, wide wedge, wraparound glass and rear louvers: a rally coupe
    // inspired by the Stratos, built from the same flat-shaded primitives.
    const green = material('#277b50'), ivory = material('#eee8ce');
    wedge(body, ivory, 1.04, 0.96, -1.92, 1.88, 0.43, 0.65, 1.03);
    box(body, dark, [2.08, 0.13, 3.72], [0, 0.43, 0]);
    wedge(body, glass, 0.92, 0.72, -0.78, 0.76, 0.93, 1.36, 1.36, -0.38, 0.42);
    box(body, ivory, [1.48, 0.08, 0.82], [0, 1.39, 0.02]);
    box(body, green, [0.55, 0.085, 0.83], [0, 1.394, 0.02]);
    const stripe = box(body, green, [0.6, 0.022, 1.16], [0, 0.775, -1.36]);
    stripe.rotation.x = -Math.atan2(0.12, 1.16);
    for (const x of [-1.045, 1.045]) {
      box(body, green, [0.035, 0.18, 2.9], [x, 0.7, 0.1]);
      box(body, red, [0.038, 0.045, 2.9], [x, 0.81, 0.1]);
      box(body, ivory, [0.35, 0.05, 0.48], [x * 0.68, 0.73, -1.45]);
      box(body, red, [0.4, 0.13, 0.045], [x * 0.7, 0.74, 1.9]);
      box(body, dark, [0.08, 0.3, 0.1], [x * 0.73, 1.05, 1.64]);
    }
    box(body, green, [2.12, 0.11, 0.35], [0, 1.21, 1.65]);
    for (let z = 0.82; z < 1.5; z += 0.14) box(body, dark, [1.35, 0.035, 0.075], [0, 1.04, z]);
    for (const x of [-0.32, 0.32]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 10), white);
      lamp.rotation.x = Math.PI / 2; lamp.position.set(x, 0.59, -1.96); body.add(lamp);
    }
  }
  // The same tailpipe appears in the menu and anchors the gameplay backfire.
  const exhaust = new THREE.Group();
  exhaust.position.set(spec.model === 'hatch' ? -0.62 : -0.28, 0.46, spec.model === 'hatch' ? 2.08 : 1.96);
  body.add(exhaust);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.3, 8), material('#717776'));
  pipe.rotation.x = Math.PI / 2;
  pipe.position.z = -0.12;
  exhaust.add(pipe);
  const opening = new THREE.Mesh(new THREE.CircleGeometry(0.078, 8), dark);
  opening.position.z = 0.032;
  exhaust.add(opening);
  const wheels = [];
  const coupe = spec.model === 'stratos';
  for (const x of coupe ? [-1, 1] : [-0.91, 0.91]) for (const z of coupe ? [-1.1, 1.1] : [-1.2, 1.24]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, coupe ? 0.43 : 0.49, z);
    root.add(pivot);
    const radius = coupe ? 0.38 : 0.43;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.28, 10), rubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    if (coupe) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.29, 8), yellow);
      hub.rotation.z = Math.PI / 2; pivot.add(hub);
    }
    const front = z < 0;
    wheels.push({ pivot, front, driven: DRIVETRAINS[spec.drivetrain][front ? 'frontTorque' : 'rearTorque'] > 0, contact: new THREE.Vector3() });
  }
  return {
    root, spec,
    dispose() {
      root.removeFromParent();
      const geometries = new Set(), materials = new Set();
      root.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
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

// Eight corners form a tapered body; independent top heights create the wedge.
function wedge(parent, material, lowerWidth, upperWidth, front, rear, bottom, frontTop, rearTop, topFront = front, topRear = rear) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -lowerWidth, bottom, front, lowerWidth, bottom, front, lowerWidth, bottom, rear, -lowerWidth, bottom, rear,
    -upperWidth, frontTop, topFront, upperWidth, frontTop, topFront, upperWidth, rearTop, topRear, -upperWidth, rearTop, topRear,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 7, 6, 4, 6, 5, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}
