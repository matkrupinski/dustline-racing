import { CONFIG } from './config.js';

function axes(heading) {
  return [{ x: Math.cos(heading), z: Math.sin(heading) }, { x: Math.sin(heading), z: -Math.cos(heading) }];
}

function radiusOn(box, axis) {
  return box.halfWidth * Math.abs(box.axes[0].x * axis.x + box.axes[0].z * axis.z)
    + box.halfLength * Math.abs(box.axes[1].x * axis.x + box.axes[1].z * axis.z);
}

// Separating-axis test for two planar oriented boxes. The contact normal points
// out of the static obstacle, and depth is the shortest separation distance.
export function boxContact(car, obstacle) {
  const dx = car.x - obstacle.x, dz = car.z - obstacle.z;
  let depth = Infinity, normal = null;
  for (const axis of [...car.axes, ...obstacle.axes]) {
    const distance = dx * axis.x + dz * axis.z;
    const overlap = radiusOn(car, axis) + radiusOn(obstacle, axis) - Math.abs(distance);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      const sign = distance >= 0 ? 1 : -1;
      normal = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  return { depth, normal };
}

export class StaticCollisions {
  constructor(options = CONFIG.collision) {
    this.options = options;
    this.obstacles = [];
    this.cells = new Map();
    this.carRadius = Math.hypot(options.halfWidth, options.halfLength);
  }

  addBox(x, z, halfWidth, halfLength, heading = 0) {
    const obstacle = { x, z, halfWidth, halfLength, axes: axes(heading) };
    this.obstacles.push(obstacle);
    const extentX = radiusOn(obstacle, { x: 1, z: 0 });
    const extentZ = radiusOn(obstacle, { x: 0, z: 1 });
    this.visitCells(x - extentX, z - extentZ, x + extentX, z + extentZ, (key) => {
      if (!this.cells.has(key)) this.cells.set(key, new Set());
      this.cells.get(key).add(obstacle);
    });
    return obstacle;
  }

  // Register only explicit solid meshes, after all parent transforms are set.
  // Ground paint, leaves, roofs and overhead signs remain outside the collision
  // layer. Box dimensions come from the actual visible geometry, not estimates.
  registerScene(scene) {
    scene.updateMatrixWorld(true);
    scene.traverse((mesh) => {
      if (!mesh.userData.collidable || mesh.geometry?.type !== 'BoxGeometry') return;
      const { width, depth } = mesh.geometry.parameters;
      const e = mesh.matrixWorld.elements;
      this.addBox(e[12], e[14], width / 2 * Math.hypot(e[0], e[2]), depth / 2 * Math.hypot(e[8], e[10]), Math.atan2(e[2], e[0]));
    });
  }

  visitCells(minX, minZ, maxX, maxZ, visit) {
    const size = this.options.cellSize;
    for (let x = Math.floor(minX / size); x <= Math.floor(maxX / size); x++) {
      for (let z = Math.floor(minZ / size); z <= Math.floor(maxZ / size); z++) visit(`${x},${z}`);
    }
  }

  nearby(x, z) {
    const found = new Set();
    const r = this.carRadius;
    this.visitCells(x - r, z - r, x + r, z + r, (key) => {
      this.cells.get(key)?.forEach((obstacle) => found.add(obstacle));
    });
    return found;
  }

  resolve(vehicle, before, dt) {
    const p = this.options;
    const turn = vehicle.heading - before.heading;
    const steps = Math.max(1, Math.ceil(vehicle.speed * dt / p.maxStep), Math.ceil(Math.abs(turn) / p.maxAngleStep));
    const stepTime = dt / steps;
    // Reintegrate the controller's proposed movement in short intervals so a
    // fast car cannot skip a narrow trunk/post. Subsequent intervals use the
    // corrected velocity, allowing motion along a contacted wall or table.
    vehicle.x = before.x;
    vehicle.z = before.z;
    let collided = false;
    for (let step = 1; step <= steps; step++) {
      vehicle.heading = before.heading + turn * step / steps;
      vehicle.x += vehicle.vx * stepTime;
      vehicle.z += vehicle.vz * stepTime;
      const car = { x: vehicle.x, z: vehicle.z, halfWidth: p.halfWidth, halfLength: p.halfLength, axes: axes(vehicle.heading) };
      for (let pass = 0; pass < p.iterations; pass++) {
        let touching = false;
        for (const obstacle of this.nearby(car.x, car.z)) {
          const contact = boxContact(car, obstacle);
          if (!contact) continue;
          touching = true;
          collided = true;
          const { normal, depth } = contact;
          car.x += normal.x * (depth + p.skin);
          car.z += normal.z * (depth + p.skin);
          const incoming = vehicle.vx * normal.x + vehicle.vz * normal.z;
          if (incoming < 0) {
            const speed = vehicle.speed;
            vehicle.vx -= (1 + p.restitution) * incoming * normal.x;
            vehicle.vz -= (1 + p.restitution) * incoming * normal.z;
            const outgoing = vehicle.vx * normal.x + vehicle.vz * normal.z;
            const friction = p.friction * Math.min(1, -incoming / Math.max(speed, 0.001));
            vehicle.vx -= (vehicle.vx - outgoing * normal.x) * friction;
            vehicle.vz -= (vehicle.vz - outgoing * normal.z) * friction;
            if (incoming < -1) vehicle.yawRate *= 0.65;
          }
        }
        if (!touching) break;
      }
      vehicle.x = car.x;
      vehicle.z = car.z;
    }
    if (collided) {
      vehicle.forwardSpeed = vehicle.vx * Math.sin(vehicle.heading) - vehicle.vz * Math.cos(vehicle.heading);
      vehicle.slip = vehicle.vx * Math.cos(vehicle.heading) + vehicle.vz * Math.sin(vehicle.heading);
    }
    return collided;
  }
}
