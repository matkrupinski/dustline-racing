import * as THREE from 'three';
import { CheckpointPylons } from './checkpoint-pylons.js';

// Reuse swept contact and gravity from the movable markers, with a heavier
// impact response. Lamps are outside the fixed collision grid once movable.
export class FallingStreetlights extends CheckpointPylons {
  constructor() { super(); this.bounds = new THREE.Box3(); }

  strike(body, vehicle) {
    super.strike(body, vehicle);
    body.vx *= 0.35; body.vz *= 0.35; body.vy = 0;
    body.angularVelocity = Math.min(3.5, 0.7 + vehicle.speed * 0.08);
    // A lamp absorbs some momentum without pinning the car to its old base.
    vehicle.vx *= 0.72; vehicle.vz *= 0.72;
    vehicle.forwardSpeed = vehicle.vx * Math.sin(vehicle.heading) - vehicle.vz * Math.cos(vehicle.heading);
    vehicle.slip = vehicle.vx * Math.cos(vehicle.heading) + vehicle.vz * Math.sin(vehicle.heading);
  }

  update(dt, vehicle = null, before = vehicle) {
    super.update(dt, vehicle, before);
    for (const body of this.bodies) if (body.hit) {
      // The sideways lamp arm also needs ground support after it falls.
      body.mesh.updateMatrixWorld(true);
      this.bounds.setFromObject(body.mesh);
      body.mesh.position.y += 0.035 + body.lift - this.bounds.min.y;
    }
  }
}
