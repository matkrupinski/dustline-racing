import { CONFIG } from './config.js';

// Arcade car definitions, shared by selection, physics, geometry and collisions.
// These are playable interpretations, not measured factory specifications.
export const DRIVETRAINS = {
  awd: { label: '4×4', frontTorque: 0.5, rearTorque: 0.5 },
  rwd: { label: 'RWD', frontTorque: 0, rearTorque: 1 },
};

export const CARS = {
  'rally-hatch': {
    id: 'rally-hatch', name: 'Rally Hatch', model: 'hatch', drivetrain: 'awd',
    detail: 'Rajdowy hatchback · napęd na cztery koła',
    hint: '4×4 · lepsza trakcja · stabilne wyjścia z zakrętów',
    wheelbase: 2.5, rearWeight: 0.5, engineScale: 1, powerFalloff: 0,
    steeringScale: 1, dragScale: 1, powerOversteer: 0,
    collision: { halfWidth: CONFIG.collision.halfWidth, halfLength: CONFIG.collision.halfLength },
  },
  'stratos-sprint': {
    id: 'stratos-sprint', name: 'Stratos Sprint', model: 'stratos', drivetrain: 'rwd',
    detail: 'Klinowe coupé inspirowane Lancią Stratos',
    hint: 'Tył / RWD · drift gazem · wymaga kontry',
    wheelbase: 2.2, rearWeight: 0.6, engineScale: 1.5, powerFalloff: 0.025,
    steeringScale: 1.04, dragScale: 0.75, powerOversteer: 1.3,
    collision: { halfWidth: 1.18, halfLength: 1.98 },
  },
};

export const DEFAULT_CAR = CARS['rally-hatch'];
export function bestKeyFor(course, car = DEFAULT_CAR) {
  // Existing hatch records survive; the RWD car competes in its own category.
  return car.id === DEFAULT_CAR.id ? course.bestKey : course.bestKey.replace(':best', `:${car.id}:best`);
}
