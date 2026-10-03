import * as THREE from 'three';
import { CONFIG } from './config.js';
import { track as defaultTrack } from './track.js';

const random = (min, max) => min + Math.random() * (max - min);
const clamp = (value) => Math.max(0, Math.min(1, value));

function particle() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0, size: 0, color: new THREE.Color() };
}

// Two bounded pools and two draw calls: soft dust points + low-poly sand grains.
// The wheel emitters read the gameplay model's actual transformed tire positions.
export class WheelParticles {
  constructor(scene, car, course = defaultTrack) {
    this.course = course;
    this.car = car;
    this.dust = Array.from({ length: CONFIG.particles.dustCapacity }, particle);
    this.sand = Array.from({ length: CONFIG.particles.sandCapacity }, particle);
    this.dustCursor = 0;
    this.sandCursor = 0;
    this.emission = [0, 0, 0, 0];
    this.matrix = new THREE.Object3D();
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(this.dust.length * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sizes = new THREE.BufferAttribute(new Float32Array(this.dust.length), 1).setUsage(THREE.DynamicDrawUsage);
    this.opacities = new THREE.BufferAttribute(new Float32Array(this.dust.length), 1).setUsage(THREE.DynamicDrawUsage);
    this.colors = new THREE.BufferAttribute(new Float32Array(this.dust.length * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('aSize', this.sizes);
    geometry.setAttribute('aOpacity', this.opacities);
    geometry.setAttribute('aColor', this.colors);
    this.dustMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { pointScale: { value: 1 } }]),
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: `
        uniform float pointScale;
        attribute float aSize;
        attribute float aOpacity;
        attribute vec3 aColor;
        varying float vOpacity;
        varying vec3 vColor;
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(aSize * pointScale / max(-mvPosition.z, 0.1), 1.0, 96.0);
          vOpacity = aOpacity;
          vColor = aColor;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        varying float vOpacity;
        varying vec3 vColor;
        #include <fog_pars_fragment>
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float alpha = (1.0 - smoothstep(0.15, 1.0, radius)) * vOpacity;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(vColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this.cloud = new THREE.Points(geometry, this.dustMaterial);
    this.cloud.frustumCulled = false; // Positions are updated in place every frame.
    this.cloud.renderOrder = 1;
    scene.add(this.cloud);

    this.grains = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 }), this.sand.length);
    this.grains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.grains.setColorAt(0, new THREE.Color());
    this.grains.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.grains.frustumCulled = false;
    this.grains.count = 0;
    scene.add(this.grains);
  }

  emit(position, pose, vehicle, dirt) {
    const asphalt = this.course.theme === 'neon' && dirt;
    const speed = vehicle.speed;
    const travelX = vehicle.vx / speed, travelZ = vehicle.vz / speed;
    const rightX = Math.cos(pose.heading), rightZ = Math.sin(pose.heading);
    const slip = vehicle.vx * rightX + vehicle.vz * rightZ;
    const puff = this.dust[this.dustCursor++ % this.dust.length];
    const sideways = random(-0.8, 0.8) - slip * 0.12;
    Object.assign(puff, {
      x: position.x + random(-0.1, 0.1), y: position.y + 0.04, z: position.z + random(-0.1, 0.1),
      vx: vehicle.vx * 0.08 - travelX * 0.7 + rightX * sideways,
      vy: random(0.45, 0.9),
      vz: vehicle.vz * 0.08 - travelZ * 0.7 + rightZ * sideways,
      age: 0, life: random(0.8, 1.4), size: random(0.4, 0.65),
    });
    puff.color.set(asphalt ? '#abb9cf' : this.course.theme === 'snow' ? '#eef9ff' : dirt ? '#d6bb8b' : '#a18d66');
    this.colors.setXYZ((this.dustCursor - 1) % this.dust.length, puff.color.r, puff.color.g, puff.color.b);
    for (let i = 0; i < (asphalt ? 0 : dirt ? 3 : 2); i++) {
      const grain = this.sand[this.sandCursor++ % this.sand.length];
      const spray = random(-1.6, 1.6) - slip * 0.22;
      const kick = random(1.2, 2.4) + speed * 0.06;
      Object.assign(grain, {
        x: position.x, y: position.y + 0.03, z: position.z,
        vx: vehicle.vx * 0.12 - travelX * kick + rightX * spray,
        vy: random(1.0, 2.3),
        vz: vehicle.vz * 0.12 - travelZ * kick + rightZ * spray,
        age: 0, life: random(0.4, 0.8), size: random(0.025, 0.065),
      });
      grain.color.set(this.course.theme === 'snow'
        ? (Math.random() < 0.5 ? '#ffffff' : '#c3dfef')
        : dirt ? (Math.random() < 0.5 ? '#b89152' : '#dcc096') : '#877553');
    }
  }

  update(dt, pose, vehicle, camera, active) {
    if (dt <= 0) return;
    const speed = vehicle.speed;
    const slip = Math.abs(vehicle.vx * Math.cos(pose.heading) + vehicle.vz * Math.sin(pose.heading));
    if (active && speed > CONFIG.particles.minSpeed) {
      this.car.getWheelContacts().forEach((wheel, index) => {
        const dirt = this.course.onTrack(wheel.contact.x, wheel.contact.z);
        const wheelSpin = wheel.driven ? (vehicle.wheelSpin ?? 0) * 14 : 0;
        const asphaltFactor = this.course.theme === 'neon' && dirt ? Math.min(1, Math.max(0, slip - 1) / 6 + wheelSpin / 14) : 1;
        const rate = (4 + Math.min(speed, 37) * 0.65 + Math.min(slip, 12) * 3.5 + wheelSpin)
          * (wheel.front ? 0.45 : 1) * (dirt ? 1 : 0.35) * asphaltFactor;
        this.emission[index] += rate * dt;
        while (this.emission[index] >= 1) {
          this.emit(wheel.contact, pose, vehicle, dirt);
          this.emission[index]--;
        }
      });
    } else this.emission.fill(0);

    const drag = Math.exp(-1.7 * dt);
    this.dust.forEach((puff, index) => {
      if (!puff.life) return;
      puff.age += dt;
      if (puff.age >= puff.life) { puff.life = 0; this.opacities.setX(index, 0); return; }
      puff.vx *= drag;
      puff.vz *= drag;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.z += puff.vz * dt;
      const progress = puff.age / puff.life;
      this.positions.setXYZ(index, puff.x, puff.y, puff.z);
      this.sizes.setX(index, puff.size * (1 + progress * 3.5));
      this.opacities.setX(index, 0.35 * clamp(puff.age / 0.07) * (1 - progress) ** 1.5);
    });

    let count = 0;
    this.sand.forEach((grain) => {
      if (!grain.life) return;
      grain.age += dt;
      if (grain.age >= grain.life) { grain.life = 0; return; }
      grain.vy -= 9.8 * dt;
      grain.vx *= drag;
      grain.vz *= drag;
      grain.x += grain.vx * dt;
      grain.y += grain.vy * dt;
      grain.z += grain.vz * dt;
      if (grain.y < 0.055) { grain.y = 0.055; grain.vy = Math.abs(grain.vy) * 0.18; }
      const fade = clamp((grain.life - grain.age) / 0.18);
      this.matrix.position.set(grain.x, grain.y, grain.z);
      this.matrix.rotation.set(grain.age * 6, grain.age * 4, grain.age * 5);
      this.matrix.scale.setScalar(grain.size * fade);
      this.matrix.updateMatrix();
      this.grains.setMatrixAt(count, this.matrix.matrix);
      this.grains.setColorAt(count++, grain.color);
    });
    this.grains.count = count;
    this.grains.instanceMatrix.needsUpdate = true;
    this.grains.instanceColor.needsUpdate = true;
    for (const attribute of [this.positions, this.sizes, this.opacities, this.colors]) attribute.needsUpdate = true;
    this.dustMaterial.uniforms.pointScale.value = window.innerHeight * Math.min(window.devicePixelRatio, 2)
      / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }

  setCourse(course) { this.course = course; this.reset(); }

  setCar(car) { this.car = car; this.reset(); }

  reset() {
    this.dust.forEach((puff) => { puff.life = 0; });
    this.sand.forEach((grain) => { grain.life = 0; });
    this.opacities.array.fill(0);
    this.opacities.needsUpdate = true;
    this.grains.count = 0;
    this.emission.fill(0);
    this.dustCursor = 0;
    this.sandCursor = 0;
  }

  dispose() {
    this.cloud.removeFromParent();
    this.grains.removeFromParent();
    this.cloud.geometry.dispose();
    this.dustMaterial.dispose();
    this.grains.geometry.dispose();
    this.grains.material.dispose();
  }
}
