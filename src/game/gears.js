// Shared visual gearbox: these speed-based gears do not change engine torque.
export const MPH_PER_MPS = 2.236936;

export function displayedGear(vehicle) {
  return vehicle.forwardSpeed < -0.3 ? 'R' : Math.min(5, 1 + Math.floor(vehicle.speed * MPH_PER_MPS / 17));
}

// Observe at the physics rate so short shifts cannot disappear between frames.
export class GearShiftTracker {
  constructor() { this.reset(); }

  reset() { this.gear = null; this.cooldown = 0; }

  update(dt, vehicle, active) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const next = displayedGear(vehicle), previous = this.gear;
    this.gear = next;
    if (!active || previous === null || next === previous || previous === 'R' || next === 'R'
      || vehicle.speed < 4 || this.cooldown > 0) return null;
    // Avoid repeated flashes when speed hovers around a gear boundary.
    this.cooldown = 0.18;
    return next > previous ? 'up' : 'down';
  }
}
