import { checkpoints } from './track.js';
import { formatTime } from './race.js';
import { displayedGear, MPH_PER_MPS } from './gears.js';

export class HUD {
  constructor() {
    this.speed = document.querySelector('#speed');
    this.gear = document.querySelector('#gear');
    this.revs = document.querySelector('#revs');
    this.timer = document.querySelector('#timer');
    this.progress = document.querySelector('#checkpoint-progress');
    this.cue = document.querySelector('#race-cue');
    this.results = document.querySelector('#results');
    this.dots = Array.from({ length: 7 }, () => {
      const dot = document.createElement('span');
      dot.className = 'rev';
      this.revs.append(dot);
      return dot;
    });
  }

  reset() {
    this.results.close();
    this.showingResults = false;
  }

  update(vehicle, race) {
    const mph = vehicle.speed * MPH_PER_MPS;
    const gear = displayedGear(vehicle);
    const reverse = gear === 'R';
    const revs = mph < 0.5 ? 0 : Math.min(7, 1 + Math.floor((mph % 17) / 17 * 7));
    // Speed display is metric; preserve the existing gearbox/rev thresholds.
    this.speed.textContent = Math.round(vehicle.speed * 3.6);
    this.gear.textContent = reverse ? 'R' : gear;
    this.gear.setAttribute('aria-label', reverse ? 'Reverse gear' : `Gear ${gear}`);
    this.revs.setAttribute('aria-label', `${revs} of 7 rev indicators`);
    this.dots.forEach((dot, index) => dot.classList.toggle('active', index < revs));
    this.timer.textContent = formatTime(race.elapsed);
    this.progress.textContent = `CP ${String(race.splits.length).padStart(2, '0')} / ${String(checkpoints.length).padStart(2, '0')}`;
    const message = race.elapsed < race.cueUntil && race.state !== 'finished' ? race.cue : '';
    if (this.cue.textContent !== message) this.cue.textContent = message;
    this.cue.hidden = !message;
    if (race.state === 'finished' && !this.showingResults) this.showResults(race);
  }

  showResults(race) {
    this.showingResults = true;
    document.querySelector('#result-title').textContent = race.isPersonalBest ? 'NEW PERSONAL BEST' : 'CIRCUIT COMPLETE';
    document.querySelector('#final-time').textContent = formatTime(race.elapsed);
    document.querySelector('#personal-best').textContent = formatTime(race.best);
    document.querySelector('#storage-note').textContent = race.storageAvailable ? 'Personal best saved on this device.' : 'Storage unavailable — best kept for this session.';
    const body = document.querySelector('#split-rows');
    body.replaceChildren();
    const rows = [...race.splits, {
      name: 'FINISH', cumulative: race.elapsed,
      sector: race.elapsed - race.splits.at(-1).cumulative,
    }];
    rows.forEach((split) => {
      const row = document.createElement('tr');
      [split.name, formatTime(split.sector), formatTime(split.cumulative)].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
    this.results.showModal();
    // Start at the result heading on short screens; the button remains reachable
    // by Tab or scrolling without jumping past the final time on dialog open.
    document.querySelector('#result-title').focus();
    this.results.scrollTop = 0;
  }
}
