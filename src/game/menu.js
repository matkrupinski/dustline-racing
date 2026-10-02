import { track, checkpoints } from './track.js';
import { CarPreview } from './car-preview.js';

// Selection data lives separately from the race UI. Add choices here as new
// tracks and car models become available, then connect their factories in main.
export const MENU_OPTIONS = {
  tracks: [{ id: 'dirt-circuit', name: 'Dirt Circuit', detail: `${Math.round(track.length)} m · ${checkpoints.length} checkpointów · 1 okrążenie` }],
  cars: [{ id: 'rally-hatch', name: 'Rally Hatch', detail: 'Szutrowy hatchback · gotowy do driftu' }],
};

export class MainMenu {
  constructor(onStart) {
    this.element = document.querySelector('#main-menu');
    this.form = document.querySelector('#race-selection');
    this.startButton = document.querySelector('#start-race');
    this.carPreviews = [];
    this.renderChoices('track', MENU_OPTIONS.tracks, '#track-options');
    this.renderChoices('car', MENU_OPTIONS.cars, '#car-options');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(this.form);
      const selectedTrack = MENU_OPTIONS.tracks.find((option) => option.id === data.get('track'));
      const selectedCar = MENU_OPTIONS.cars.find((option) => option.id === data.get('car'));
      if (selectedTrack && selectedCar) onStart({ track: selectedTrack, car: selectedCar });
    });
  }

  renderChoices(kind, options, selector) {
    const container = document.querySelector(selector);
    options.forEach((option, index) => {
      const card = document.createElement('label');
      card.className = 'selection-card';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = kind;
      radio.value = option.id;
      radio.checked = index === 0;
      radio.required = true;
      const visual = document.querySelector(`#${kind}-preview`).content.cloneNode(true);
      const content = document.createElement('span');
      content.className = 'selection-copy';
      const name = document.createElement('strong');
      name.textContent = option.name;
      const detail = document.createElement('span');
      detail.textContent = option.detail;
      const selected = document.createElement('span');
      selected.className = 'selected-label';
      selected.textContent = '✓ WYBRANO';
      content.append(name, detail);
      card.append(radio, visual, content, selected);
      container.append(card);
      if (kind === 'car') this.carPreviews.push(new CarPreview(card.querySelector('.car-model-preview')));
    });
    if (kind === 'track') {
      // The thumbnail follows the actual circuit rather than an invented map.
      const points = track.points;
      const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x));
      const minZ = Math.min(...points.map((point) => point.z)), maxZ = Math.max(...points.map((point) => point.z));
      const scale = Math.min(180 / (maxX - minX), 108 / (maxZ - minZ));
      const toSvg = (point) => `${110 + (point.x - (minX + maxX) / 2) * scale},${70 + (point.z - (minZ + maxZ) / 2) * scale}`;
      container.querySelector('.course-outline').setAttribute('points', points.map(toSvg).join(' ') + ' ' + toSvg(points[0]));
      const start = track.frame(0).position;
      const [cx, cy] = toSvg(start).split(',');
      const marker = container.querySelector('.course-start');
      marker.setAttribute('cx', cx);
      marker.setAttribute('cy', cy);
    }
  }

  show() {
    this.element.hidden = false;
    this.carPreviews.forEach((preview) => preview.render());
    this.startButton.focus({ preventScroll: true });
  }

  hide() { this.element.hidden = true; }
}
