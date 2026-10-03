import { COURSES } from './track.js';
import { CarPreview } from './car-preview.js';
import { CARS } from './cars.js';

// Selection data lives separately from the race UI. Add choices here as new
// tracks and car models become available, then connect their factories in main.
export const MENU_OPTIONS = {
  tracks: Object.values(COURSES).map((course) => ({
    id: course.id, name: course.name, course,
    detail: `${Math.round(course.length)} m · ${course.checkpoints.length} checkpointów · ${course.closed ? '1 okrążenie' : 'etap ~2:25'}`,
    surface: course.music ? 'Noc · asfalt · Kordhell · 160 BPM' : course.theme === 'snow' ? 'Śnieg · niska przyczepność · hamuj wcześniej' : 'Szuter · klasyczny drift',
  })),
  cars: Object.values(CARS).map((spec) => ({ id: spec.id, name: spec.name, detail: spec.detail, surface: spec.hint, spec })),
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
      if (option.surface) {
        const surface = document.createElement('span');
        surface.className = 'surface-hint'; surface.textContent = option.surface;
        content.append(surface);
      }
      card.append(radio, visual, content, selected);
      container.append(card);
      if (kind === 'track') {
        card.classList.toggle('snow-card', option.course.theme === 'snow');
        card.classList.toggle('neon-card', option.course.theme === 'neon');
        card.querySelector('.art-caption').textContent = `${option.name.toUpperCase()} / 0${index + 1}`;
        drawCoursePreview(card, option.course);
      }
      if (kind === 'car') {
        card.querySelector('.art-caption').textContent = `${option.name.toUpperCase()} / 0${index + 1}`;
        this.carPreviews.push(new CarPreview(card.querySelector('.car-model-preview'), option.spec));
      }
    });
  }

  show() {
    this.element.hidden = false;
    this.carPreviews.forEach((preview) => preview.render());
    this.startButton.focus({ preventScroll: true });
  }

  hide() { this.element.hidden = true; }
}

// Each thumbnail is generated from its own playable spline.
function drawCoursePreview(card, course) {
  const points = course.points;
  const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z)), maxZ = Math.max(...points.map((point) => point.z));
  const scale = Math.min(180 / (maxX - minX), 108 / (maxZ - minZ));
  const toSvg = (point) => `${110 + (point.x - (minX + maxX) / 2) * scale},${70 + (point.z - (minZ + maxZ) / 2) * scale}`;
  card.querySelector('.course-outline').setAttribute('points', points.map(toSvg).join(' ') + (course.closed ? ' ' + toSvg(points[0]) : ''));
  const [cx, cy] = toSvg(course.frame(0).position).split(',');
  const marker = card.querySelector('.course-start');
  marker.setAttribute('cx', cx); marker.setAttribute('cy', cy);
}
