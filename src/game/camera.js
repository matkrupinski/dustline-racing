import * as THREE from 'three';
import { CONFIG } from './config.js';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.heading = 0;
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.focus = new THREE.Vector3();
  }

  update(pose, dt, snap = false) {
    const c = CONFIG.camera;
    // Shortest angular path also works after multiple laps.
    const angle = Math.atan2(Math.sin(pose.heading - this.heading), Math.cos(pose.heading - this.heading));
    this.heading += angle * (snap ? 1 : 1 - Math.exp(-c.headingResponse * dt));
    const forwardX = Math.sin(this.heading), forwardZ = -Math.cos(this.heading);
    this.desired.set(pose.x - forwardX * c.distance, c.height, pose.z - forwardZ * c.distance);
    this.target.set(pose.x + forwardX * c.lookAhead, 0.5, pose.z + forwardZ * c.lookAhead);
    const blend = snap ? 1 : 1 - Math.exp(-c.positionResponse * dt);
    this.camera.position.lerp(this.desired, blend);
    this.focus.lerp(this.target, blend);
    this.camera.lookAt(this.focus);
  }
}
