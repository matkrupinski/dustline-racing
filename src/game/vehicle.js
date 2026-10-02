import { CONFIG } from './config.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Pure planar physics: no renderer or DOM dependency. Heading 0 points down -Z.
// Velocity is kept in world space, independently of heading, so the rear can slide.
export class Vehicle {
  constructor() { this.reset(); }

  reset() {
    Object.assign(this, CONFIG.spawn, { vx: 0, vz: 0, steering: 0, yawRate: 0, forwardSpeed: 0, slip: 0 });
  }

  update(dt, input, onTrack = true) {
    const p = CONFIG.physics;
    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
    const rx = Math.cos(this.heading), rz = Math.sin(this.heading);
    let forward = this.vx * fx + this.vz * fz;
    let lateral = this.vx * rx + this.vz * rz;
    const speed = Math.hypot(this.vx, this.vz);

    this.steering += (input.steer - this.steering) * (1 - Math.exp(-p.steeringResponse * dt));
    // Progressive steering prevents uncontrollable yaw at high speeds.
    const steerAngle = this.steering * p.steeringAngle / (1 + Math.abs(forward) * 0.048);
    const targetYaw = forward / p.wheelbase * Math.tan(steerAngle);
    this.yawRate += (targetYaw - this.yawRate) * (1 - Math.exp(-6 * dt));

    if (input.throttle) forward += (forward < -0.5 ? p.brake : p.acceleration) * dt;
    if (input.brake) {
      // Hold brake to stop, then reverse. Opposing inputs act as brakes.
      forward = forward > 0 ? Math.max(0, forward - p.brake * dt) : forward - p.reverseAcceleration * dt;
    }
    const resistance = p.rollingDrag + p.aerodynamicDrag * forward * forward + (onTrack ? 0 : p.offroadDrag);
    forward = Math.sign(forward) * Math.max(0, Math.abs(forward) - resistance * dt);
    forward = clamp(forward, -p.maxReverseSpeed, p.maxForwardSpeed);

    // Tire grip fades into a controllable drift under fast, sustained steering.
    const drift = clamp((speed - 10) / 17, 0, 1) * Math.abs(this.steering);
    const grip = (p.lateralGrip + (p.highSpeedGrip - p.lateralGrip) * drift) * (onTrack ? 1 : 0.65);
    lateral *= Math.exp(-grip * dt);
    this.vx = fx * forward + rx * lateral;
    this.vz = fz * forward + rz * lateral;
    this.heading += this.yawRate * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.forwardSpeed = this.vx * Math.sin(this.heading) - this.vz * Math.cos(this.heading);
    this.slip = lateral;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
}
