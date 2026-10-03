import { CONFIG } from './config.js';
import { track as defaultTrack, gateCrossing } from './track.js';
import { DEFAULT_CAR, bestKeyFor } from './cars.js';

// Version the key when the course or rules change: old records aren't comparable.
export const BEST_KEY = defaultTrack.bestKey;
export function formatTime(seconds) {
  const ms = Math.max(0, Math.floor(seconds * 1000 + 1e-7));
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export class Race {
  constructor(storage = null, course = defaultTrack, car = DEFAULT_CAR) {
    this.course = course;
    this.car = car;
    this.recordKey = bestKeyFor(course, car);
    this.storage = storage;
    this.best = null;
    this.storageAvailable = Boolean(storage);
    try {
      const saved = JSON.parse(storage?.getItem(this.recordKey) ?? 'null');
      if (Number.isFinite(saved) && saved > 0) this.best = saved;
    } catch { this.storageAvailable = false; }
    this.reset();
  }

  reset() {
    this.state = 'ready';
    this.elapsed = 0;
    this.splits = [];
    this.startedLap = false;
    this.offCourseTime = 0;
    this.isPersonalBest = false;
    this.cue = 'PRESS W / ↑ TO START';
    this.cueUntil = Infinity;
  }

  start() {
    if (this.state !== 'ready') return;
    this.state = 'racing';
    this.cue = 'GO';
    this.cueUntil = 1.2;
  }

  flash(message) { this.cue = message; this.cueUntil = this.elapsed + 1.8; }

  recover() {
    if (this.state !== 'racing') return null;
    this.offCourseTime = 0;
    const last = this.course.checkpoints[this.splits.length - 1];
    // Start before the initial line until at least one checkpoint is cleared.
    // Keep time/splits intact; teleportation must never award another gate.
    if (!last) {
      this.startedLap = false;
      this.flash('POWRÓT NA START');
      return { ...this.course.gridPose };
    }
    // Place the car just beyond the cleared gate, centered and facing forwards.
    const frame = this.course.frame(last.u + 2 / this.course.length);
    this.flash(`POWRÓT DO ${last.name}`);
    return { x: frame.position.x, z: frame.position.z, heading: frame.heading };
  }

  update(dt, before, after) {
    if (this.state !== 'racing') return;
    const track = this.course, { checkpoints, finishGate } = track;
    const stepStart = this.elapsed;
    this.elapsed += dt;
    const projection = track.project(after.x, after.z);
    // Allow brief drift excursions; a longer departure returns to the last
    // cleared gate. Returning backwards preserves ordered checkpoint validation.
    this.offCourseTime = projection.distance > track.width / 2 + 3 ? this.offCourseTime + dt : 0;
    const bounds = track.bounds;
    if (this.offCourseTime > CONFIG.race.offCourseGrace || after.x < bounds.minX || after.x > bounds.maxX
      || after.z < bounds.minZ || after.z > bounds.maxZ) return this.recover();

    const lineCrossing = gateCrossing(before, after, finishGate);
    if (!this.startedLap) {
      if (gateCrossing(before, after, track.startGate) !== null) this.startedLap = true;
      return;
    }

    // Only the next gate can award credit; repeated, reverse, and out-of-order
    // crossings have no effect. Gate u guards against the loop's other branches.
    const next = checkpoints[this.splits.length];
    if (next && Math.abs(projection.progress - next.u) < 0.025) {
      const crossing = gateCrossing(before, after, next);
      if (crossing !== null) {
        const cumulative = stepStart + dt * crossing;
        const previous = this.splits.at(-1)?.cumulative ?? 0;
        this.splits.push({ name: next.name, cumulative, sector: cumulative - previous });
        this.flash(`${next.name} / ${formatTime(cumulative)}`);
      }
    }

    if (lineCrossing !== null) {
      if (this.splits.length === checkpoints.length) {
        this.elapsed = stepStart + dt * lineCrossing;
        this.finish();
      } else {
        this.flash(`MISSED ${checkpoints[this.splits.length].name} — FOLLOW THE BLUE GATE`);
      }
    }
  }

  finish() {
    this.state = 'finished';
    this.isPersonalBest = this.best === null || this.elapsed < this.best;
    if (!this.isPersonalBest) return;
    this.best = this.elapsed;
    try {
      if (this.storage) this.storage.setItem(this.recordKey, JSON.stringify(this.best));
      this.storageAvailable = Boolean(this.storage);
    } catch { this.storageAvailable = false; }
  }
}
