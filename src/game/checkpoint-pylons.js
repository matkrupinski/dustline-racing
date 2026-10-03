import * as THREE from 'three';
import { CONFIG } from './config.js';
import { boxContact } from './collisions.js';

const axes = (heading) => [{ x: Math.cos(heading), z: Math.sin(heading) }, { x: Math.sin(heading), z: -Math.cos(heading) }];

// Lightweight, one-way prop physics: the car transfers an impulse to a marker,
// but the marker never changes the car's pose, velocity or steering. Fallen
// markers remain passable until a full restart restores them.
export class CheckpointPylons {
  constructor({ snow = false } = {}) {
    this.bodies = [];
    this.slideDrag = snow ? 1.4 : 3.2;
    this.rotation = new THREE.Quaternion();
  }

  add(mesh, heading, halfWidth = 0.35, halfLength = 0.06, height = 4.2) {
    const body = {
      mesh, heading, halfWidth, halfLength, height, axes: axes(heading),
      spawn: mesh.position.clone(), orientation: mesh.quaternion.clone(),
      tipAxis: new THREE.Vector3(), vx: 0, vz: 0, vy: 0,
      lift: 0, tilt: 0, angularVelocity: 0, hit: false, active: false,
    };
    this.bodies.push(body);
    return body;
  }

  sweptHit(body, vehicle, before) {
    const bounds = vehicle.spec?.collision ?? CONFIG.collision;
    const dx = vehicle.x - before.x, dz = vehicle.z - before.z;
    const turn = vehicle.heading - before.heading;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / CONFIG.collision.maxStep),
      Math.ceil(Math.abs(turn) / CONFIG.collision.maxAngleStep));
    const obstacle = { x: body.mesh.position.x, z: body.mesh.position.z,
      halfWidth: body.halfWidth, halfLength: body.halfLength, axes: body.axes };
    for (let i = 0; i <= steps; i++) {
      const fraction = i / steps;
      if (boxContact({ x: before.x + dx * fraction, z: before.z + dz * fraction,
        ...bounds, axes: axes(before.heading + turn * fraction) }, obstacle)) return true;
    }
    return false;
  }

  strike(body, vehicle) {
    const speed = vehicle.speed;
    const dx = vehicle.vx / speed, dz = vehicle.vz / speed;
    const kick = Math.min(12, Math.max(0.5, speed * 0.35));
    body.hit = true; body.active = true;
    body.vx = dx * kick; body.vz = dz * kick;
    body.vy = Math.min(1.2, speed * 0.12);
    body.tilt = 0.03;
    body.angularVelocity = Math.min(6, 1 + speed * 0.25);
    body.tipAxis.set(dz, 0, -dx);
    // Footprint projected along the fall direction keeps the mesh above ground.
    body.floorRadius = body.halfWidth * Math.abs(dx * body.axes[0].x + dz * body.axes[0].z)
      + body.halfLength * Math.abs(dx * body.axes[1].x + dz * body.axes[1].z);
  }

  update(dt, vehicle = null, before = vehicle) {
    if (dt <= 0) return;
    for (const body of this.bodies) {
      if (!body.hit && vehicle?.speed > 0.05 && this.sweptHit(body, vehicle, before)) this.strike(body, vehicle);
      if (!body.active) continue;
      body.vy -= 9.8 * dt;
      body.lift += body.vy * dt;
      if (body.lift < 0) {
        body.lift = 0;
        body.vy = Math.abs(body.vy) > 0.2 ? -body.vy * 0.2 : 0;
      }
      const drag = Math.exp(-(body.lift > 0 ? 0.8 : this.slideDrag) * dt);
      body.vx *= drag; body.vz *= drag;
      body.mesh.position.x += body.vx * dt; body.mesh.position.z += body.vz * dt;
      const flat = Math.PI / 2;
      if (body.tilt >= flat && Math.abs(body.angularVelocity) < 0.15) body.angularVelocity = 0;
      else {
        body.angularVelocity += 9.8 / (body.height / 2) * Math.sin(body.tilt) * dt;
        body.angularVelocity *= Math.exp(-1.5 * dt);
        body.tilt += body.angularVelocity * dt;
        if (body.tilt > flat) { body.tilt = flat; body.angularVelocity *= -0.15; }
      }
      body.mesh.position.y = body.spawn.y + 0.035 + body.floorRadius * Math.sin(body.tilt) + body.lift;
      this.rotation.setFromAxisAngle(body.tipAxis, body.tilt);
      body.mesh.quaternion.copy(body.orientation).premultiply(this.rotation);
      if (body.tilt >= flat && body.angularVelocity === 0 && body.lift === 0 && body.vy === 0 && Math.hypot(body.vx, body.vz) < 0.03) {
        body.vx = 0; body.vz = 0; body.active = false;
      }
    }
  }

  reset() {
    for (const body of this.bodies) {
      body.mesh.position.copy(body.spawn); body.mesh.quaternion.copy(body.orientation);
      Object.assign(body, { vx: 0, vz: 0, vy: 0, lift: 0, tilt: 0, angularVelocity: 0, hit: false, active: false });
    }
  }

  clear() { this.bodies.length = 0; }
}
