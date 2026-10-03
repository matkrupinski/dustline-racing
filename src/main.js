import * as THREE from 'three';
import './style.css';
import { CONFIG } from './game/config.js';
import { Input } from './game/input.js';
import { Vehicle } from './game/vehicle.js';
import { ChaseCamera } from './game/camera.js';
import { createWorld } from './game/world.js';
import { COURSES } from './game/track.js';
import { Race } from './game/race.js';
import { createCar } from './game/car-model.js';
import { HUD } from './game/hud.js';
import { MainMenu } from './game/menu.js';
import { WheelParticles } from './game/wheel-particles.js';
import { GearShiftTracker } from './game/gears.js';
import { ExhaustEffects } from './game/exhaust-effects.js';
import { VehicleAudio } from './game/vehicle-audio.js';
import { CARS, DEFAULT_CAR, DRIVETRAINS } from './game/cars.js';
import { RaceMusic } from './game/race-music.js';
import { musicRhythm } from './game/music-theme.js';

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
  let course = COURSES['dirt-circuit'];
  let world = createWorld(scene, course);
  let carSpec = DEFAULT_CAR;
  let car = createCar(scene, carSpec);
  const particles = new WheelParticles(scene, car);
  const exhaust = new ExhaustEffects(scene, car);
  const gearShifts = new GearShiftTracker();
  const audio = new VehicleAudio();
  const musicPanel = document.querySelector('#music-panel');
  const musicStatus = document.querySelector('#music-status');
  const musicPhase = document.querySelector('#music-phase');
  const music = new RaceMusic({ onStatus: (message) => { musicStatus.textContent = message; } });
  const vehicle = new Vehicle(course.physics, carSpec);
  let storage = null;
  try { storage = window.localStorage; } catch { /* Private browsing can deny access. */ }
  let race = new Race(storage, course, carSpec);
  // Each car/course combination has its own record, including offline sessions.
  const races = new Map([[`${course.id}:${carSpec.id}`, race]]);
  const chaseCamera = new ChaseCamera(camera);
  const hud = new HUD();
  const previous = { ...course.gridPose };
  const pose = { ...course.gridPose };
  let accumulator = 0, lastTime = performance.now();
  let screen = 'menu';
  const raceUI = document.querySelector('#race-ui');

  function reset(focusCanvas = true) {
    vehicle.reset();
    Object.assign(vehicle, course.gridPose);
    race.reset();
    hud.reset();
    world.pylons.reset();
    world.streetlights.reset();
    particles.reset();
    exhaust.reset();
    gearShifts.reset();
    audio.reset();
    music.reset();
    input.clear();
    Object.assign(previous, course.gridPose);
    Object.assign(pose, course.gridPose);
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
    audio.reset();
    chaseCamera.update(pose, 0, true);
  }
  // Start on keydown, even if a short tap begins and ends between render frames.
  const input = new Input(reset, () => {
    void audio.unlock();
    if (race.state === 'ready') { race.start(); music.start(); }
  });
  const menu = new MainMenu((selection) => {
    const selectedCourse = COURSES[selection.track.id];
    const selectedCar = CARS[selection.car.id];
    if (!selectedCourse || !selectedCar) return;
    if (selectedCourse !== course) {
      world.dispose();
      course = selectedCourse;
      world = createWorld(scene, course);
    }
    if (selectedCar !== carSpec) {
      car.dispose();
      carSpec = selectedCar;
      car = createCar(scene, carSpec);
      particles.setCar(car);
      exhaust.setCar(car);
    }
    const raceKey = `${course.id}:${carSpec.id}`;
    race = races.get(raceKey) ?? new Race(storage, course, carSpec);
    races.set(raceKey, race);
    vehicle.setSetup(course.physics, carSpec);
    particles.setCourse(course);
    raceUI.dataset.theme = course.theme;
    document.querySelector('#race-kind').textContent = course.closed ? 'LAP 01 / 01' : 'STAGE 01 / 01';
    musicPanel.hidden = !course.music;
    if (course.music) {
      const title = document.querySelector('#music-title');
      title.textContent = course.music.title; title.href = course.music.url;
    }
    void music.select(course.music);
    document.querySelector('#course-name').textContent = `${course.name.toUpperCase()} / TIME ATTACK`;
    document.querySelector('#car-name').textContent = `${carSpec.name.toUpperCase()} / ${DRIVETRAINS[carSpec.drivetrain].label}`;
    document.title = `Dustline — ${course.name} / ${carSpec.name}`;
    canvas.setAttribute('aria-label', `${course.name}, ${carSpec.name}. Drive using WASD or arrow keys.`);
    screen = 'game';
    menu.hide();
    raceUI.hidden = false;
    raceUI.inert = false;
    canvas.inert = false;
    input.setEnabled(true);
    reset();
    void audio.unlock();
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
  const soundButton = document.querySelector('#toggle-sound');
  soundButton.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    soundButton.setAttribute('aria-pressed', String(audio.muted));
    soundButton.textContent = audio.muted ? 'Dźwięk: wył.' : 'Dźwięk: wł.';
    canvas.focus({ preventScroll: true });
  });
  document.querySelector('#music-play').addEventListener('click', () => {
    if (music.failed) void music.select(course.music);
    if (race.state === 'ready') race.start();
    if (race.state === 'racing') music.start(race.elapsed);
    void audio.unlock(); canvas.focus({ preventScroll: true });
  });
  const musicMute = document.querySelector('#music-mute');
  musicMute.addEventListener('click', () => {
    music.setMuted(!music.muted);
    musicMute.setAttribute('aria-pressed', String(music.muted));
    musicMute.textContent = music.muted ? 'Muzyka: wył.' : 'Muzyka: wł.';
    canvas.focus({ preventScroll: true });
  });
  document.querySelector('#music-volume').addEventListener('input', (event) => music.setVolume(Number(event.target.value)));
  document.querySelector('#music-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    await music.useLocalFile(file);
    // Loading a file does not start an idle race. During a run, resume at the
    // current split time; off-road recovery never resets the soundtrack.
    if (screen === 'game' && race.state === 'racing') music.start(race.elapsed);
    event.target.value = '';
    canvas.focus({ preventScroll: true });
  });
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
    audio.reset();
    music.pause();
    input.clear();
    accumulator = 0;
    lastTime = performance.now();
  });
  window.addEventListener('blur', () => { audio.reset(); music.pause(); });
  // Resume within a new gesture after a browser/OS audio interruption.
  canvas.addEventListener('pointerdown', () => { void audio.unlock(); });
  window.addEventListener('pagehide', () => { audio.reset(); music.pause(); });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    audio.reset();
    music.pause();
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
        vehicle.update(CONFIG.physics.step, controls, course.onTrack(vehicle.x, vehicle.z));
        world.collisions.resolve(vehicle, previous, CONFIG.physics.step);
        world.pylons.update(CONFIG.physics.step, vehicle, previous);
        world.streetlights.update(CONFIG.physics.step, vehicle, previous);
        const shift = gearShifts.update(CONFIG.physics.step, vehicle, true);
        if (shift) { exhaust.trigger(shift); audio.trigger(shift); }
        const recovery = race.update(CONFIG.physics.step, previous, vehicle);
        if (recovery) returnToTrack(recovery);
      } else {
        world.pylons.update(CONFIG.physics.step);
        world.streetlights.update(CONFIG.physics.step);
      }
      accumulator -= CONFIG.physics.step;
    }
    const alpha = accumulator / CONFIG.physics.step;
    for (const key of ['x', 'z', 'heading']) pose[key] = THREE.MathUtils.lerp(previous[key], vehicle[key], alpha);
    car.update(pose, vehicle);
    exhaust.update(dt, vehicle);
    audio.update(vehicle, controls, screen === 'game' && race.state !== 'finished' && document.hasFocus());
    const musicTime = music.update(race, screen === 'game' && race.state === 'racing' && document.hasFocus());
    if (course.music) musicPhase.textContent = `${course.music.bpm} BPM / ${musicRhythm(musicTime, course.music).section.name}`;
    particles.update(dt, pose, vehicle, camera, screen === 'game' && race.state === 'racing');
    chaseCamera.update(pose, dt);
    world.update(pose, race, musicTime);
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
