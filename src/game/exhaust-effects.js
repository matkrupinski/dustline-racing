import * as THREE from 'three';

const random = (min, max) => min + Math.random() * (max - min);
const axis = new THREE.Vector3(0, 0, 1);

// A short attached flame and a bounded pool of flying sparks. No textures,
// sound, physics impulses or engine torque changes are involved.
export class ExhaustEffects {
  constructor(scene, car) {
    this.car = car;
    this.position = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.matrix = new THREE.Object3D();
    this.pending = null;
    this.age = 0;
    this.duration = 0;
    this.cursor = 0;
    this.sparks = Array.from({ length: 24 }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, age: 0, size: 0 }));
    this.flame = new THREE.Group();
    const makeFlame = (radius, length, color) => {
      const geometry = new THREE.ConeGeometry(radius, length, 7, 1);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, 0, length / 2);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      mesh.renderOrder = 2;
      this.flame.add(mesh);
      return mesh;
    };
    this.outer = makeFlame(0.2, 1, '#ff6a12');
    this.inner = makeFlame(0.095, 0.68, '#fff0ae');
    this.light = new THREE.PointLight('#ff9b37', 0, 3, 2);
    this.light.position.z = 0.3;
    this.flame.add(this.light);
    this.flame.visible = false;
    scene.add(this.flame);
    this.grains = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: '#ffc76a', toneMapped: false }), this.sparks.length);
    this.grains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.grains.frustumCulled = false;
    this.grains.count = 0;
    scene.add(this.grains);
  }

  trigger(direction) {
    // Queue until the interpolated car model has its current transform.
    if (direction === 'up' || direction === 'down') this.pending = direction;
  }

  update(dt, vehicle) {
    this.car.getExhaustTransform(this.position, this.direction);
    this.age += dt;
    if (this.pending) {
      const downshift = this.pending === 'down';
      this.pending = null;
      this.age = 0;
      this.duration = downshift ? 0.23 : 0.15;
      this.strength = downshift ? 1.35 : 0.95;
      for (let i = 0; i < (downshift ? 9 : 6); i++) {
        const spark = this.sparks[this.cursor++ % this.sparks.length];
        spark.position.copy(this.position);
        spark.velocity.copy(this.direction).multiplyScalar(random(4, 8));
        spark.velocity.x += vehicle.vx * 0.7 + random(-0.7, 0.7);
        spark.velocity.y += random(0.5, 1.8);
        spark.velocity.z += vehicle.vz * 0.7 + random(-0.7, 0.7);
        spark.age = 0;
        spark.life = random(0.16, 0.32);
        spark.size = random(0.025, 0.055);
      }
    }
    const fade = this.duration ? Math.max(0, 1 - this.age / this.duration) : 0;
    this.flame.visible = fade > 0;
    this.flame.position.copy(this.position);
    this.flame.quaternion.setFromUnitVectors(axis, this.direction);
    // Fast flicker and a collapsing tail make each burst read as a backfire.
    const flicker = 0.85 + Math.sin(this.age * 160) * 0.15;
    const length = (this.strength ?? 1) * (0.35 + fade * 0.65) * flicker;
    this.flame.scale.set(0.65 + fade * 0.35, 0.65 + fade * 0.35, length);
    this.outer.material.opacity = fade * 0.85;
    this.inner.material.opacity = fade;
    this.light.intensity = fade * 3;
    let count = 0;
    this.sparks.forEach((spark) => {
      if (!spark.life) return;
      spark.age += dt;
      if (spark.age >= spark.life) { spark.life = 0; return; }
      spark.velocity.y -= 3 * dt;
      spark.position.addScaledVector(spark.velocity, dt);
      this.matrix.position.copy(spark.position);
      this.matrix.scale.setScalar(spark.size * (1 - spark.age / spark.life));
      this.matrix.updateMatrix();
      this.grains.setMatrixAt(count++, this.matrix.matrix);
    });
    this.grains.count = count;
    this.grains.instanceMatrix.needsUpdate = true;
  }

  reset() {
    this.pending = null;
    this.age = this.duration = this.cursor = 0;
    this.flame.visible = false;
    this.light.intensity = 0;
    this.sparks.forEach((spark) => { spark.life = 0; });
    this.grains.count = 0;
  }

  dispose() {
    this.flame.removeFromParent();
    this.grains.removeFromParent();
    for (const mesh of [this.outer, this.inner, this.grains]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.light.dispose();
  }
}
