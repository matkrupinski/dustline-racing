const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyR']);

export class Input {
  constructor(onReset, onAccelerate = () => {}) {
    this.keys = new Set();
    this.enabled = true;
    this.onKeyDown = (event) => {
      if (!this.enabled) return;
      if (!DRIVE_KEYS.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      this.keys.add(event.code);
      if ((event.code === 'KeyW' || event.code === 'ArrowUp') && !event.repeat) onAccelerate();
      if (event.code === 'KeyR' && !event.repeat) onReset();
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.clear = () => this.keys.clear();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
  }

  sample() {
    const down = (...codes) => codes.some((code) => this.keys.has(code));
    return {
      throttle: Number(down('KeyW', 'ArrowUp')),
      brake: Number(down('KeyS', 'ArrowDown')),
      steer: Number(down('KeyD', 'ArrowRight')) - Number(down('KeyA', 'ArrowLeft')),
    };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clear);
  }
}
