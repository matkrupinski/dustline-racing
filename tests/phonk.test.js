import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COURSES } from '../src/game/track.js';
import { CARS } from '../src/game/cars.js';
import { Vehicle } from '../src/game/vehicle.js';
import { Race } from '../src/game/race.js';
import { createWorld } from '../src/game/world.js';
import { createCar } from '../src/game/car-model.js';
import { WheelParticles } from '../src/game/wheel-particles.js';
import { StaticCollisions } from '../src/game/collisions.js';
import { PHONK, musicRhythm } from '../src/game/music-theme.js';
import { RaceMusic, createLocalAudioPlayer, createAssetAudioPlayer } from '../src/game/race-music.js';

const course = COURSES['phonk-docks'], dt = 1 / 120;
const streamSong = { ...PHONK, audioUrl: undefined };
function cross(race, gate, seconds = 1) {
  const p = (offset) => ({ x: gate.position.x + gate.forward.x * offset, z: gate.position.z + gate.forward.z * offset });
  return race.update(seconds, p(-1), p(1));
}
function worldFor(scene) {
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  try { return createWorld(scene, course); } finally { globalThis.document = original; }
}
function fakePlayer() {
  const calls = []; let time = 0;
  return { calls, getCurrentTime: () => time, setTime: (seconds) => { time = seconds; },
    setVolume: (value) => calls.push(['volume', value]), mute: () => calls.push(['mute']), unMute: () => calls.push(['unmute']),
    seekTo: (value) => { time = value; calls.push(['seek', value]); },
    playVideo: () => calls.push(['play']), pauseVideo: () => calls.push(['pause']), destroy: () => calls.push(['destroy']) };
}

test('Phonk Docks is a winding 3.6km open stage with distinct start/finish and no wraparound', () => {
  assert.equal(course.closed, false); assert.equal(course.music, PHONK);
  assert.ok(Math.abs(course.length - 3600) < 0.01); assert.equal(PHONK.duration, 145); assert.equal(PHONK.bpm, 160);
  assert.equal(course.checkpoints.length, 6);
  assert.ok(course.startGate.position.distanceTo(course.finishGate.position) > 800);
  assert.ok(course.frame(-1).position.distanceTo(course.frame(0).position) < 1e-9);
  assert.ok(course.frame(2).position.distanceTo(course.frame(1).position) < 1e-9);
  assert.equal(course.project(...[course.points.at(-1).x, course.points.at(-1).z]).progress, 1);
  assert.ok(course.onTrack(course.gridPose.x, course.gridPose.z));
  assert.ok(course.bounds.minZ < -900);
  const far = course.frame(0.5);
  assert.ok(Math.abs(far.position.z) > 240);
  const race = new Race(null, course); race.start(); cross(race, course.startGate);
  assert.equal(race.update(dt, far.position, far.position), undefined);
});

test('stage accepts only its start and ordered checkpoints; recovery keeps song-relative race time', () => {
  const race = new Race(null, course); race.start();
  cross(race, course.finishGate); assert.equal(race.startedLap, false);
  cross(race, course.startGate); assert.ok(race.startedLap);
  cross(race, course.checkpoints[1]); assert.equal(race.splits.length, 0);
  cross(race, course.checkpoints[0]); const elapsed = race.elapsed;
  const recovery = race.recover(), expected = course.frame(course.checkpoints[0].u + 2 / course.length);
  assert.ok(Math.hypot(recovery.x - expected.position.x, recovery.z - expected.position.z) < 1e-9);
  assert.equal(race.elapsed, elapsed); assert.equal(race.splits.length, 1);
  cross(race, course.finishGate); assert.equal(race.state, 'racing');
  course.checkpoints.slice(1).forEach((gate) => cross(race, gate));
  cross(race, course.finishGate); assert.equal(race.state, 'finished');
  const finishedTime = race.elapsed; cross(race, course.finishGate); assert.equal(race.elapsed, finishedTime);
  race.reset(); race.start(); assert.deepEqual(race.recover(), course.gridPose);
});

test('the dock stage has repeated substantial turns and five direction-reversing hairpins', () => {
  let previous = course.frame(0).heading, run = 0, total = 0;
  const turns = [];
  for (let distance = 5; distance <= course.length; distance += 5) {
    const heading = course.frame(distance / course.length).heading;
    const change = Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
    previous = heading; total += Math.abs(change);
    // Ignore tiny inflection noise when grouping consecutive left/right turns.
    if (Math.sign(change) !== Math.sign(run) && Math.abs(change) > 0.003) { turns.push(run); run = 0; }
    run += change;
  }
  turns.push(run);
  assert.ok(total > 12 * Math.PI, 'the stage must not regress to a mostly straight corridor');
  assert.ok(turns.filter((turn) => Math.abs(turn) > Math.PI / 4).length >= 24);
  assert.ok(turns.filter((turn) => Math.abs(turn) > 2.5).length >= 5);
});

test('beat pulse follows 160 BPM and section boundaries stay bounded through song end', () => {
  assert.equal(musicRhythm(0).pulse, 1);
  assert.equal(musicRhythm(60 / 160).beat, 1);
  assert.ok(musicRhythm(0.1875).pulse < 0.04);
  assert.equal(musicRhythm(36).section.name, 'RYTM / SZYKANY');
  assert.equal(musicRhythm(-5).seconds, 0);
  assert.equal(musicRhythm(999).progress, 1);
});

test('window strobe has a short beat-synchronized flash and bounded light sources that follow the player', () => {
  assert.equal(musicRhythm(0).strobe, 1);
  assert.equal(musicRhythm(0.04).strobe, 1);
  assert.ok(musicRhythm(0.05).strobe > 0 && musicRhythm(0.05).strobe < 1);
  assert.equal(musicRhythm(0.07).strobe, 0);
  assert.equal(musicRhythm(60 / PHONK.bpm).strobe, 1);
  const world = worldFor(new THREE.Scene());
  const lights = world.root.children.filter((object) => object.name.startsWith('window-strobe-'));
  assert.equal(lights.length, 4);
  const race = { splits: [], elapsed: 0 };
  world.update(course.gridPose, race, 0);
  assert.ok(lights.some((light) => light.intensity > 0));
  const windows = world.root.getObjectByName('music-reactive-windows');
  assert.ok(windows.material.emissiveIntensity > 4);
  const windowCenters = [];
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < windows.count; i++) {
    windows.getMatrixAt(i, matrix);
    windowCenters.push(new THREE.Vector3().setFromMatrixPosition(matrix));
  }
  for (const light of lights) {
    assert.equal(light.isSpotLight, true);
    assert.ok(windowCenters.some((center) => center.distanceTo(light.position) < 0.061));
    assert.ok(light.target.position.y < light.position.y);
  }
  const shafts = world.root.getObjectByName('window-light-shafts');
  assert.ok(shafts.material.opacity > 0);
  world.update(course.gridPose, race, 0.07);
  assert.ok(lights.every((light) => light.intensity === 0));
  assert.ok(windows.material.emissiveIntensity < 0.2);
  assert.equal(shafts.material.opacity, 0);
  const frame = course.frame(0.6);
  const pose = { x: frame.position.x, z: frame.position.z, heading: frame.heading };
  world.update(pose, race, 60 / PHONK.bpm);
  assert.ok(lights.some((light) => light.intensity > 0));
  for (const light of lights) if (light.intensity > 0) {
    assert.ok(Math.hypot(light.position.x - pose.x, light.position.z - pose.z) < 45);
    assert.equal(light.castShadow, false);
  }
  let disposed = 0;
  for (const light of lights) {
    const dispose = light.dispose.bind(light);
    light.dispose = () => { disposed++; dispose(); };
  }
  world.dispose(); assert.equal(disposed, 4);
});

test('shipping containers retain their solid footprint and have doors, locking bars and batched corrugations', () => {
  const world = worldFor(new THREE.Scene());
  const containers = [];
  world.root.traverse((object) => { if (object.name.startsWith('shipping-container-')) containers.push(object); });
  assert.equal(containers.length, 80);
  for (const container of containers) {
    const body = container.getObjectByName('container-body');
    assert.equal(body.userData.collidable, true);
    assert.equal(body.geometry.parameters.width, 4);
    assert.equal(body.geometry.parameters.depth, 7);
    assert.equal(container.children.filter((child) => child.name === 'container-door').length, 2);
    assert.equal(container.children.filter((child) => child.userData.collidable).length, 1);
  }
  assert.ok(world.root.getObjectByName('container-corrugations').count > 3000);
  world.dispose();
});

test('real stage geometry has no closing road, supports six passable checkpoints and releases resources', () => {
  const scene = new THREE.Scene(), car = createCar(scene), world = worldFor(scene);
  const road = world.root.children.find((mesh) => mesh.material?.vertexColors);
  assert.equal(road.geometry.index.count, (course.points.length - 1) * 18);
  const vehicle = new Vehicle(course.physics);
  for (let i = 0; i < course.points.length; i += 4) {
    const frame = course.frame(i / (course.points.length - 1));
    Object.assign(vehicle, { x: frame.position.x, z: frame.position.z, heading: frame.heading, vx: 0, vz: 0 });
    assert.equal(world.collisions.resolve(vehicle, vehicle, 0), false);
  }
  assert.equal(world.pylons.bodies.length, 12);
  let disposed = false;
  world.root.children.find((object) => object.isInstancedMesh && object.material.emissiveIntensity).material.addEventListener('dispose', () => { disposed = true; });
  world.update(course.gridPose, { elapsed: 20, splits: [] }, 20);
  world.dispose(); assert.ok(disposed); assert.equal(world.pylons.bodies.length, 0);
  assert.equal(car.root.parent, scene); car.dispose();
});

test('asphalt emits tire smoke without sand; roadside keeps the dirt effect', () => {
  const scene = new THREE.Scene(), car = createCar(scene), particles = new WheelParticles(scene, car, course);
  const vehicle = new Vehicle(course.physics); Object.assign(vehicle, { vx: 0, vz: -20, heading: 0 });
  particles.emit(new THREE.Vector3(), vehicle, vehicle, true);
  assert.ok(particles.dust.some((puff) => puff.life > 0));
  assert.ok(particles.sand.every((grain) => grain.life === 0));
  particles.emit(new THREE.Vector3(), vehicle, vehicle, false);
  assert.ok(particles.sand.some((grain) => grain.life > 0)); particles.dispose(); car.dispose();
});

test('real lamps fall from swept hits in either direction, absorb momentum and reset', () => {
  const world = worldFor(new THREE.Scene());
  assert.equal(world.streetlights.bodies.length, 240);
  for (const body of [world.streetlights.bodies[0], world.streetlights.bodies[15], world.streetlights.bodies[50]]) {
    const position = body.spawn;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(body.orientation);
    const heading = Math.atan2(forward.x, -forward.z);
    const isolated = new StaticCollisions(); isolated.registerScene(body.mesh);
    assert.equal(isolated.obstacles.length, 0);
    for (const spec of Object.values(CARS)) for (const direction of [1, -1]) {
      world.streetlights.reset();
      const vehicle = new Vehicle(course.physics, spec);
      const before = { x: position.x - forward.x * 8 * direction, z: position.z - forward.z * 8 * direction, heading };
      Object.assign(vehicle, { x: position.x + forward.x * 4 * direction,
        z: position.z + forward.z * 4 * direction, heading,
        vx: forward.x * 37 * direction, vz: forward.z * 37 * direction });
      world.streetlights.update(dt, vehicle, before);
      assert.equal(body.hit, true);
      assert.ok(vehicle.speed > 20 && vehicle.speed < 37);
      for (let i = 0; i < 960; i++) world.streetlights.update(dt);
      assert.ok(body.tilt > 1.5);
      assert.ok(new THREE.Box3().setFromObject(body.mesh).min.y >= 0.03);
      const speed = vehicle.speed;
      world.streetlights.update(dt, vehicle, before);
      assert.equal(vehicle.speed, speed, 'fallen lamp does not apply the impact again');
    }
    world.streetlights.reset();
    assert.equal(body.hit, false);
    assert.equal(body.tilt, 0);
    assert.ok(body.mesh.position.distanceTo(position) < 1e-9);
    const vehicle = new Vehicle(course.physics);
    Object.assign(vehicle, { x: position.x + forward.z * 3, z: position.z - forward.x * 3, heading, vx: forward.x * 20, vz: forward.z * 20 });
    world.streetlights.update(dt, vehicle, vehicle);
    assert.equal(body.hit, false, 'nearby driving beneath the elevated arm misses the base');
  }
  world.dispose(); assert.equal(world.streetlights.bodies.length, 0);
});

test('each beat selects different real windows and seek restores the same seeded selection', () => {
  const world = worldFor(new THREE.Scene());
  const windows = world.root.getObjectByName('music-reactive-windows');
  const matrix = new THREE.Matrix4(), original = [];
  world.update(course.gridPose, { splits: [] }, 0);
  for (let i = 0; i < windows.count; i++) { windows.getMatrixAt(i, matrix); original.push([...matrix.elements]); }
  world.update(course.gridPose, { splits: [] }, 60 / PHONK.bpm);
  for (let i = 0; i < windows.count; i++) { windows.getMatrixAt(i, matrix); assert.notDeepEqual([...matrix.elements], original[i]); }
  world.update(course.gridPose, { splits: [] }, 0);
  for (let i = 0; i < windows.count; i++) { windows.getMatrixAt(i, matrix); assert.deepEqual([...matrix.elements], original[i]); }
  assert.equal(world.root.getObjectByName('building-windows').count, 1920);
  world.dispose();
});

test('background windows and rooftop bars pulse from playback time and reset without changing collisions', () => {
  const world = worldFor(new THREE.Scene());
  const windows = world.root.getObjectByName('music-reactive-windows');
  const bars = world.root.getObjectByName('music-reactive-roof-bars-0');
  assert.ok(windows.count > 100 && bars.count > 20);
  const obstacles = JSON.stringify(world.collisions.obstacles);
  const race = { elapsed: 42, splits: [] };
  const matrix = new THREE.Matrix4();
  world.update(course.gridPose, race, 0);
  const peak = windows.material.emissiveIntensity;
  bars.getMatrixAt(0, matrix); const peakMatrix = matrix.clone();
  world.update(course.gridPose, race, 0.1875);
  assert.ok(windows.material.emissiveIntensity < peak * 0.5);
  bars.getMatrixAt(0, matrix); assert.ok(matrix.elements[5] < peakMatrix.elements[5]);
  const pausedMatrix = matrix.clone(), pausedBrightness = windows.material.emissiveIntensity;
  race.elapsed = 90; world.update(course.gridPose, race, 0.1875);
  bars.getMatrixAt(0, matrix); assert.deepEqual(matrix.elements, pausedMatrix.elements);
  assert.equal(windows.material.emissiveIntensity, pausedBrightness);
  world.update(course.gridPose, race, 0);
  bars.getMatrixAt(0, matrix); assert.deepEqual(matrix.elements, peakMatrix.elements);
  assert.equal(windows.material.emissiveIntensity, peak);
  assert.equal(JSON.stringify(world.collisions.obstacles), obstacles);
  let disposed = false; windows.material.addEventListener('dispose', () => { disposed = true; });
  world.dispose(); assert.ok(disposed);
});

test('both actual controllers finish every stage gate close to the full song duration with collisions enabled', (t) => {
  const world = worldFor(new THREE.Scene());
  for (const spec of Object.values(CARS)) {
    const vehicle = new Vehicle(course.physics, spec); Object.assign(vehicle, course.gridPose);
    const race = new Race(null, course, spec); race.start(); let maxSlip = 0;
    for (let i = 0; i < 120 * 160 && race.state === 'racing'; i++) {
      const p = course.project(vehicle.x, vehicle.z);
      const target = course.frame(p.progress + (8 + vehicle.speed * 0.45) / course.length).position;
      const desired = Math.atan2(target.x - vehicle.x, -(target.z - vehicle.z));
      const error = Math.atan2(Math.sin(desired - vehicle.heading), Math.cos(desired - vehicle.heading));
      const speed = 26 - Math.min(7, Math.abs(error) * 6);
      const before = { x: vehicle.x, z: vehicle.z, heading: vehicle.heading };
      vehicle.update(dt, { throttle: Number(vehicle.speed < speed), brake: Number(vehicle.speed > speed + 2),
        steer: Math.max(-1, Math.min(1, error * 2.2 - vehicle.yawRate * 0.22)) }, course.onTrack(vehicle.x, vehicle.z));
      maxSlip = Math.max(maxSlip, Math.abs(vehicle.slip));
      assert.equal(world.collisions.resolve(vehicle, before, dt), false);
      world.pylons.update(dt, vehicle, before);
      assert.equal(race.update(dt, before, vehicle), undefined);
    }
    assert.equal(race.state, 'finished'); assert.equal(race.splits.length, 6);
    assert.ok(Math.abs(race.elapsed - PHONK.duration) < 8, `${spec.id}: ${race.elapsed}s`);
    assert.ok(maxSlip > 3, 'chicane should allow actual lateral drift');
    t.diagnostic(`${spec.name}: ${race.elapsed.toFixed(2)} seconds`);
  }
  world.dispose();
});

test('music loads only for a music stage, starts by gesture, respects mute and resets without changing the race', async () => {
  const player = fakePlayer(); let loads = 0, events;
  const music = new RaceMusic({ createPlayer: async (song, handlers) => { loads++; events = handlers; return player; } });
  await music.select(null); assert.equal(loads, 0);
  await music.select(streamSong); assert.equal(loads, 1); assert.ok(!player.calls.some(([type]) => type === 'play'));
  music.start(); events.onStateChange(1);
  assert.ok(music.playing); music.setVolume(130); assert.equal(music.volume, 100);
  music.setMuted(true); assert.ok(player.calls.some(([type]) => type === 'mute'));
  const race = new Race(null, course); race.start(); race.elapsed = 30;
  const snapshot = { ...race }; music.update(race, true, 0); assert.deepEqual({ ...race }, snapshot);
  assert.ok(player.calls.some(([type, value]) => type === 'seek' && value === 30));
  const seeks = player.calls.filter(([type]) => type === 'seek').length;
  player.setTime(1); music.update(race, true, 0.5);
  assert.equal(player.calls.filter(([type]) => type === 'seek').length, seeks);
  music.pause(); assert.equal(music.wanted, false);
  music.reset(); assert.equal(music.elapsed, 0); assert.equal(player.getCurrentTime(), 0); assert.ok(music.muted);
  await music.select(null); assert.ok(player.calls.some(([type]) => type === 'destroy')); assert.equal(music.player, null);
});

test('autoplay denial, native pause and song end cannot cause repeated play requests', async () => {
  const player = fakePlayer(); let events;
  const music = new RaceMusic({ createPlayer: async (song, handlers) => { events = handlers; return player; } });
  await music.select(streamSong); music.start(); events.onAutoplayBlocked();
  const race = { elapsed: 12 };
  const plays = () => player.calls.filter(([type]) => type === 'play').length;
  const count = plays();
  for (let i = 0; i < 60; i++) music.update(race, true, i / 60);
  assert.equal(plays(), count);
  music.start(12); events.onStateChange(1); events.onStateChange(2);
  music.update(race, true, 2); assert.equal(plays(), count + 1);
  music.start(12); events.onStateChange(0); music.update(race, true, 3);
  assert.equal(plays(), count + 2);
});

test('paused music freezes the visual beat clock even while race time advances', async () => {
  const player = fakePlayer(); let events;
  const music = new RaceMusic({ createPlayer: async (song, handlers) => { events = handlers; return player; } });
  await music.select(streamSong); music.start(12); events.onStateChange(1); events.onStateChange(2);
  assert.equal(music.update({ elapsed: 30 }, true, 0), 12);
  assert.equal(music.update({ elapsed: 60 }, true, 1), 12);
  assert.equal(music.update({ elapsed: 60 }, false, 2), 12);
  music.reset(); assert.equal(music.update({ elapsed: 0 }, false, 3), 0);
  music.dispose();
});

test('failed players can retry and late callbacks from a previous course cannot resume hidden music', async () => {
  let resolve, staleEvents; const stalePlayer = fakePlayer();
  const music = new RaceMusic({ createPlayer: (song, handlers) => {
    staleEvents = handlers; return new Promise((done) => { resolve = done; });
  } });
  const loading = music.select(streamSong); music.start(); await music.select(null);
  resolve(stalePlayer); await loading; staleEvents.onStateChange(1);
  assert.equal(music.player, null); assert.equal(music.playing, false);
  assert.ok(stalePlayer.calls.some(([type]) => type === 'destroy'));
  let loads = 0;
  music.createPlayer = async () => { loads++; if (loads === 1) throw new Error('offline'); return fakePlayer(); };
  await music.select(streamSong); assert.ok(music.failed);
  await music.select(streamSong); assert.equal(loads, 2); assert.ok(music.ready);
  music.dispose();
});

test('local audio handles metadata, seek, mute, autoplay failure and releases its object URL once', async () => {
  const listeners = new Map(), states = [], failures = [], revoked = [];
  const audio = {
    currentTime: 0, duration: 145, readyState: 0, muted: false,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    play: async () => { const error = new Error('gesture'); error.name = 'NotAllowedError'; throw error; },
    pause() {}, load() {}, removeAttribute() {}, remove() {},
  };
  let blocks = 0;
  const player = createLocalAudioPlayer({ name: 'test.wav' }, {
    onStateChange: (state) => states.push(state), onError: (code) => failures.push(code), onAutoplayBlocked: () => blocks++,
  }, { createAudio: () => audio, createURL: () => 'blob:test', revokeURL: (url) => revoked.push(url), mount() {} });
  player.seekTo(42); assert.equal(audio.currentTime, 0);
  audio.readyState = 1; listeners.get('loadedmetadata')(); assert.equal(audio.currentTime, 42);
  player.seekTo(999); assert.equal(audio.currentTime, 144.9);
  player.setVolume(35); assert.equal(audio.volume, 0.35);
  player.mute(); assert.ok(player.isMuted()); player.unMute(); assert.ok(!player.isMuted());
  player.playVideo(); await Promise.resolve(); await Promise.resolve(); assert.equal(blocks, 1);
  listeners.get('playing')(); listeners.get('waiting')(); listeners.get('ended')(); listeners.get('error')();
  assert.deepEqual(states, [1, 3, 0]); assert.deepEqual(failures, ['plik']);
  player.destroy(); player.destroy(); assert.equal(listeners.size, 0); assert.deepEqual(revoked, ['blob:test']);
});

test('a local song replaces a blocked embed, survives menu selection and preserves race time', async () => {
  let embeds = 0, files = 0, events;
  const music = new RaceMusic({ createPlayer: async () => { embeds++; throw new Error('150'); },
    createLocalPlayer: async (file, handlers) => { files++; events = handlers; assert.equal(file.name, 'Kordhell.mp3'); return fakePlayer(); } });
  await music.select(streamSong); assert.ok(music.failed);
  await music.useLocalFile({ name: 'Kordhell.mp3' }); assert.ok(music.ready); assert.ok(!music.failed);
  music.start(37); events.onStateChange(1);
  assert.equal(music.player.getCurrentTime(), 37);
  const race = { elapsed: 37 }; music.update(race, true, 0); assert.equal(race.elapsed, 37);
  await music.select(null); assert.equal(music.player, null);
  await music.select(streamSong); assert.equal(embeds, 1); assert.equal(files, 2);
  music.reset(); assert.equal(music.player.getCurrentTime(), 0);
  music.dispose(); assert.equal(music.localFiles.size, 0);
});

test('the supplied asset loads automatically without YouTube and a chosen file can override it', async () => {
  let assets = 0, files = 0;
  const music = new RaceMusic({
    createPlayer: () => { throw new Error('YouTube must not load'); },
    createAssetPlayer: async (song) => { assets++; assert.ok(song.audioUrl.endsWith('/audio/kordhell-murder-in-my-mind.mp3')); return fakePlayer(); },
    createLocalPlayer: async () => { files++; return fakePlayer(); },
  });
  await music.select(PHONK); assert.ok(music.ready); assert.equal(assets, 1);
  music.start(23); assert.equal(music.player.getCurrentTime(), 23);
  music.reset(); assert.equal(music.player.getCurrentTime(), 0);
  await music.select(null); await music.select(PHONK); assert.equal(assets, 2);
  await music.useLocalFile({ name: 'alternative.mp3' }); assert.equal(files, 1); assert.equal(assets, 2);
  music.dispose();
});

test('asset audio uses its stable URL and never allocates or revokes a blob URL', () => {
  let src, removed = false;
  const audio = { currentTime: 0, duration: 145, readyState: 1,
    addEventListener() {}, removeEventListener() {}, pause() {}, load() {}, remove() { removed = true; },
    removeAttribute() {}, set src(value) { src = value; },
  };
  const player = createAssetAudioPlayer(PHONK, {}, {
    createAudio: () => audio, mount() {},
    createURL() { throw new Error('Unexpected object URL'); }, revokeURL() { throw new Error('Unexpected revocation'); },
  });
  assert.equal(src, PHONK.audioUrl); player.seekTo(18); assert.equal(audio.currentTime, 18);
  player.destroy(); assert.ok(removed);
});
