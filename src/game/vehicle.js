import { CONFIG } from './config.js';
import { DEFAULT_CAR, DRIVETRAINS } from './cars.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Pure planar physics: no renderer or DOM dependency. Heading 0 points down -Z.
// Velocity is kept in world space, independently of heading, so the rear can slide.
export class Vehicle {
  constructor(physics = CONFIG.physics, spec = DEFAULT_CAR) {
    this.physics = physics; this.spec = spec; this.reset();
  }

  setSetup(physics, spec) { this.physics = physics; this.spec = spec; this.reset(); }

  reset() {
    Object.assign(this, CONFIG.spawn, { vx: 0, vz: 0, steering: 0, yawRate: 0, forwardSpeed: 0, slip: 0,
      wheelSpin: 0, frontDriveForce: 0, rearDriveForce: 0, frontGrip: 1, rearGrip: 1 });
  }

  update(dt, input, onTrack = true) {
    const p = this.physics;
    const spec = this.spec, drive = DRIVETRAINS[spec.drivetrain];
    const fx = Math.sin(this.heading), fz = -Math.cos(this.heading);
    const rx = Math.cos(this.heading), rz = Math.sin(this.heading);
    let forward = this.vx * fx + this.vz * fz;
    let lateral = this.vx * rx + this.vz * rz;
    const speed = Math.hypot(this.vx, this.vz);

    this.steering += (input.steer - this.steering) * (1 - Math.exp(-p.steeringResponse * dt));
    // Progressive steering prevents uncontrollable yaw at high speeds.
    const steerAngle = this.steering * p.steeringAngle * spec.steeringScale / (1 + Math.abs(forward) * 0.048);
    const baseYaw = forward / spec.wheelbase * Math.tan(steerAngle);

    // Torque consumes grip on the driven axle. A 4x4 shares the demand between
    // both axles; RWD must accelerate and resist sliding with its rear tires.
    const accelerating = input.throttle && !input.brake && forward >= -0.5;
    const traction = (p.tractionAcceleration ?? 14) * (onTrack ? 1 : 0.65);
    const request = accelerating ? p.acceleration * spec.engineScale / (1 + speed * spec.powerFalloff) : 0;
    const cornerLoad = clamp(Math.abs(forward * baseYaw) / traction, 0, 0.85);
    const longitudinalReserve = Math.sqrt(1 - cornerLoad * cornerLoad);
    const frontCapacity = traction * (1 - spec.rearWeight), rearCapacity = traction * spec.rearWeight;
    this.frontDriveForce = Math.min(request * drive.frontTorque, frontCapacity * longitudinalReserve);
    this.rearDriveForce = Math.min(request * drive.rearTorque, rearCapacity * longitudinalReserve);
    const frontUse = this.frontDriveForce / frontCapacity, rearUse = this.rearDriveForce / rearCapacity;
    this.frontGrip = Math.sqrt(Math.max(0.08, 1 - frontUse * frontUse));
    this.rearGrip = Math.sqrt(Math.max(0.08, 1 - rearUse * rearUse));
    this.wheelSpin = request ? clamp(1 - (this.frontDriveForce + this.rearDriveForce) / request, 0, 1) : 0;
    const powerSlide = Math.max(0, rearUse - frontUse) * clamp(speed / 8, 0, 1);
    const slipAngle = Math.atan2(lateral, Math.max(Math.abs(forward), 3));
    // Rear grip loss rotates the tail out; releasing gas restores grip, and
    // countersteer can oppose the bounded yaw instead of being overridden.
    const targetYaw = baseYaw - clamp(slipAngle * powerSlide * spec.powerOversteer, -0.65, 0.65) * Math.sign(forward);
    this.yawRate += (targetYaw - this.yawRate) * (1 - Math.exp(-(p.yawResponse ?? 6) * dt));

    if (input.throttle) forward += (forward < -0.5 ? p.brake : input.brake ? p.acceleration
      : this.frontDriveForce + this.rearDriveForce) * dt;
    if (input.brake) {
      // Hold brake to stop, then reverse. Opposing inputs act as brakes.
      forward = forward > 0 ? Math.max(0, forward - p.brake * dt) : forward - p.reverseAcceleration * dt;
    }
    const resistance = p.rollingDrag + p.aerodynamicDrag * spec.dragScale * forward * forward + (onTrack ? 0 : p.offroadDrag);
    forward = Math.sign(forward) * Math.max(0, Math.abs(forward) - resistance * dt);
    forward = clamp(forward, -p.maxReverseSpeed, p.maxForwardSpeed);

    // Tire grip fades into a controllable drift under fast, sustained steering.
    const drift = clamp((speed - (p.driftStart ?? 10)) / (p.driftRange ?? 17), 0, 1) * Math.abs(this.steering);
    // Normalize to the balanced AWD reserve to preserve its established feel.
    const referenceUse = (this.frontDriveForce + this.rearDriveForce) / traction;
    const referenceGrip = Math.sqrt(Math.max(0.08, 1 - referenceUse * referenceUse));
    const axleGrip = (this.frontGrip * (1 - spec.rearWeight) + this.rearGrip * spec.rearWeight) / referenceGrip;
    const grip = (p.lateralGrip + (p.highSpeedGrip - p.lateralGrip) * drift) * (onTrack ? 1 : 0.65) * axleGrip;
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
