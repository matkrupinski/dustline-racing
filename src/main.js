import * as THREE from 'three';
import './style.css';
import { CONFIG } from './game/config.js';
import { Input } from './game/input.js';
import { Vehicle } from './game/vehicle.js';
import { ChaseCamera } from './game/camera.js';
import { createWorld } from './game/world.js';
import { gridPose, onTrack } from './game/track.js';
import { Race } from './game/race.js';
import { createCar } from './game/car-model.js';
import { HUD } from './game/hud.js';
import { MainMenu } from './game/menu.js';
import { WheelParticles } from './game/wheel-particles.js';
import { GearShiftTracker } from './game/gears.js';
import { ExhaustEffects } from './game/exhaust-effects.js';

const canvas = document.querySelector('#game');
const notice = document.querySelector('#notice');

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 400);
  const world = createWorld(scene);
  const car = createCar(scene);
  const particles = new WheelParticles(scene, car);
  const exhaust = new ExhaustEffects(scene, car);
  const gearShifts = new GearShiftTracker();
  const vehicle = new Vehicle();
  let storage = null;
  try { storage = window.localStorage; } catch { /* Private browsing can deny access. */ }
  const race = new Race(storage);
  const chaseCamera = new ChaseCamera(camera);
  const hud = new HUD();
  const previous = { ...gridPose };
  const pose = { ...gridPose };
  let accumulator = 0, lastTime = performance.now();
  let screen = 'menu';
  const raceUI = document.querySelector('#race-ui');

  function reset(focusCanvas = true) {
    vehicle.reset();
    Object.assign(vehicle, gridPose);
    race.reset();
    hud.reset();
    particles.reset();
    exhaust.reset();
    gearShifts.reset();
    input.clear();
    Object.assign(previous, gridPose);
    Object.assign(pose, gridPose);
    accumulator = 0;
    lastTime = performance.now();
    chaseCamera.update(pose, 0, true);
    if (focusCanvas) canvas.focus({ preventScroll: true });
  }

  function returnToTrack(destination) {
    vehicle.reset();
    Object.assign(vehicle, destination);
    // Clear both interpolation endpoints so the teleport isn't drawn or swept
    // across the world. Held controls and the ongoing race remain active.
    Object.assign(previous, destination);
    Object.assign(pose, destination);
    particles.reset();
    exhaust.reset();
    gearShifts.reset();
    chaseCamera.update(pose, 0, true);
  }
  // Start on keydown, even if a short tap begins and ends between render frames.
  const input = new Input(reset, () => race.start());
  const menu = new MainMenu((selection) => {
    // Only the currently available course/car are offered by the menu. These
    // identifiers are the place to dispatch additional scene factories later.
    if (selection.track.id !== 'dirt-circuit' || selection.car.id !== 'rally-hatch') return;
    screen = 'game';
    menu.hide();
    raceUI.hidden = false;
    raceUI.inert = false;
    canvas.inert = false;
    input.setEnabled(true);
    reset();
  });
  function openMenu() {
    screen = 'menu';
    input.setEnabled(false);
    reset(false);
    raceUI.hidden = true;
    raceUI.inert = true;
    canvas.inert = true;
    menu.show();
  }
  document.querySelector('#reset').addEventListener('click', () => reset());
  document.querySelector('#try-again').addEventListener('click', () => reset());
  document.querySelector('#return-menu').addEventListener('click', openMenu);
  document.querySelector('#results-menu').addEventListener('click', openMenu);
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && screen === 'game') {
      event.preventDefault();
      openMenu();
    }
  });
  document.querySelector('#results').addEventListener('cancel', (event) => {
    event.preventDefault();
    openMenu();
  });
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    input.clear();
    accumulator = 0;
    lastTime = performance.now();
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    notice.textContent = 'Graphics context interrupted. Reload the page to continue driving.';
    notice.hidden = false;
  });
  resize();
  openMenu();

  renderer.setAnimationLoop((time) => {
    // Bound catch-up after a stall. Fixed physics steps make grip and steering
    // consistent at 30, 60, and 144 Hz; interpolation keeps the render smooth.
    const dt = Math.min(Math.max((time - lastTime) / 1000, 0), 0.1);
    lastTime = time;
    if (screen === 'game') accumulator += dt;
    const controls = input.sample();
    if (document.hidden) { accumulator = 0; return; }
    while (accumulator >= CONFIG.physics.step) {
      previous.x = vehicle.x;
      previous.z = vehicle.z;
      previous.heading = vehicle.heading;
      if (race.state === 'racing') {
        vehicle.update(CONFIG.physics.step, controls, onTrack(vehicle.x, vehicle.z));
        world.collisions.resolve(vehicle, previous, CONFIG.physics.step);
        const shift = gearShifts.update(CONFIG.physics.step, vehicle, true);
        if (shift) exhaust.trigger(shift);
        const recovery = race.update(CONFIG.physics.step, previous, vehicle);
        if (recovery) returnToTrack(recovery);
      }
      accumulator -= CONFIG.physics.step;
    }
    const alpha = accumulator / CONFIG.physics.step;
    for (const key of ['x', 'z', 'heading']) pose[key] = THREE.MathUtils.lerp(previous[key], vehicle[key], alpha);
    car.update(pose, vehicle);
    exhaust.update(dt, vehicle);
    particles.update(dt, pose, vehicle, camera, screen === 'game' && race.state === 'racing');
    chaseCamera.update(pose, dt);
    world.update(pose, race);
    hud.update(vehicle, race);
    renderer.render(scene, camera);
  });
}

try {
  start();
} catch (error) {
  console.error(error);
  notice.textContent = 'Unable to start the 3D scene. Please use a browser with WebGL 2 and hardware acceleration enabled.';
  notice.hidden = false;
}
