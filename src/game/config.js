// All distances are meters, velocities m/s, angles radians, and time seconds.
export const CONFIG = {
  physics: {
    step: 1 / 120,
    acceleration: 10.5,
    brake: 22,
    reverseAcceleration: 5,
    maxForwardSpeed: 37,
    maxReverseSpeed: 9,
    rollingDrag: 0.65,
    aerodynamicDrag: 0.0075,
    wheelbase: 2.5,
    steeringAngle: 0.54,
    steeringResponse: 7,
    lateralGrip: 9,
    highSpeedGrip: 2.4,
    offroadDrag: 4.2,
    tractionAcceleration: 14,
  },
  // Frame the car lower on screen and reveal the next bend before turn-in.
  camera: { height: 27, distance: 18, lookAhead: 13, fov: 52, positionResponse: 7, headingResponse: 4 },
  collision: {
    halfWidth: 1.22,
    halfLength: 2.04,
    restitution: 0.06,
    friction: 0.16,
    maxStep: 0.2,
    maxAngleStep: 0.04,
    iterations: 5,
    cellSize: 12,
    skin: 0.002,
  },
  track: { length: 640, width: 13, samples: 640 },
  particles: { dustCapacity: 160, sandCapacity: 480, minSpeed: 1.3 },
  race: { checkpointFractions: [0.16, 0.34, 0.50, 0.64, 0.79, 0.92], offCourseGrace: 1.25 },
  spawn: { x: 0, z: 34, heading: 0 },
};

// Packed snow remains controllable, but demands earlier braking and countersteer.
// Dirt keeps the exact original tuning; changing maps never mutates CONFIG.
export const SURFACE_PHYSICS = {
  dirt: CONFIG.physics,
  snow: {
    ...CONFIG.physics,
    acceleration: 7.2, brake: 10, reverseAcceleration: 3.5,
    maxForwardSpeed: 31, maxReverseSpeed: 7,
    rollingDrag: 0.8, offroadDrag: 8.5,
    tractionAcceleration: 10,
    steeringResponse: 5, yawResponse: 4.5,
    lateralGrip: 4, highSpeedGrip: 1.1,
    driftStart: 6, driftRange: 13,
  },
  neon: {
    ...CONFIG.physics,
    brake: 24, lateralGrip: 10, highSpeedGrip: 2.8,
    rollingDrag: 0.55, tractionAcceleration: 16, offroadDrag: 6.5,
  },
};
