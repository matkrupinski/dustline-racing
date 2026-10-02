import * as THREE from 'three';
import { createCar } from './car-model.js';

// Render the gameplay model directly, so geometry, colors and future model
// changes are shared with the selection card. This is a static preview: no loop.
export class CarPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-5, 5, 2.8, -2.8, 0.1, 40);
    this.camera.position.set(6, 6, 8);
    this.camera.lookAt(0, 0.8, 0);

    const car = createCar(this.scene);
    car.update({ x: 0, z: 0, heading: 0 }, { steering: 0, speed: 0 });
    // Match the warm gameplay light and preserve the card's CSS background.
    this.scene.add(new THREE.HemisphereLight('#fff0d5', '#465346', 1.7));
    const sun = new THREE.DirectionalLight('#ffe0b3', 2.3);
    sun.position.set(-3.5, 4.5, -2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 20 });
    sun.shadow.normalBias = 0.04;
    sun.shadow.bias = -0.0001;
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.2 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(canvas);
    this.render();
  }

  render() {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || !height) return; // Cards inside a hidden menu have no size.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.left = -2.8 * width / height;
    this.camera.right = 2.8 * width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.observer.disconnect();
    const geometries = new Set(), materials = new Set();
    this.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.renderer.dispose();
  }
}
