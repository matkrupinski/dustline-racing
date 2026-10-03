// Playback is independent of vehicle physics. Prefer the supplied local asset
// or a user-selected file; the visible YouTube player remains a stream fallback.
let apiPromise;
export function loadYouTubeAPI() {
  if (globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = globalThis.onYouTubeIframeAPIReady;
    const timeout = setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timeout); script.remove(); apiPromise = null;
      reject(new Error('YouTube API unavailable'));
    }
    globalThis.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout); previous?.(); resolve(globalThis.YT);
    };
    script.src = 'https://www.youtube.com/iframe_api'; script.onerror = fail;
    document.head.append(script);
  });
  return apiPromise;
}

export async function createYouTubePlayer(song, events) {
  const YT = await loadYouTubeAPI();
  if (events.isCurrent && !events.isCurrent()) throw new Error('Player superseded');
  const container = document.querySelector('#music-player');
  container.dataset.source = 'youtube';
  container.replaceChildren();
  const mount = document.createElement('div'); container.append(mount);
  return new Promise((resolve, reject) => {
    let ready = false;
    const timeout = setTimeout(() => { player.destroy(); reject(new Error('Player timed out')); }, 15000);
    const player = new YT.Player(mount, {
      width: 356, height: 200, videoId: song.videoId,
      playerVars: { origin: location.origin, playsinline: 1, controls: 1, autoplay: 0, disablekb: 1 },
      events: {
        onReady: () => {
          clearTimeout(timeout); ready = true;
          const iframe = player.getIframe();
          iframe.title = song.title; iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          resolve(player);
        },
        onStateChange: (event) => events.onStateChange(event.data),
        onAutoplayBlocked: () => events.onAutoplayBlocked(),
        onError: (event) => {
          clearTimeout(timeout); events.onError(event.data);
          if (!ready) { player.destroy(); reject(new Error(`YouTube ${event.data}`)); }
        },
      },
    });
  });
}

// A user-selected file stays on this device. Object URLs are session-only and
// revoked when the player is replaced; no upload or YouTube download occurs.
export function createLocalAudioPlayer(file, events, {
  createAudio = () => document.createElement('audio'),
  createURL = (value) => URL.createObjectURL(value),
  revokeURL = (value) => URL.revokeObjectURL(value),
  mount = (audio, name) => {
    const container = document.querySelector('#music-player');
    container.dataset.source = 'local';
    const label = document.createElement('span');
    label.className = 'local-song-name'; label.textContent = name;
    audio.controls = true;
    container.replaceChildren(label, audio);
  },
} = {}) {
  const audio = createAudio(), url = file.src ?? createURL(file);
  const ownsURL = !file.src;
  let destroyed = false, pendingTime = 0;
  const listeners = {
    loadedmetadata: () => { audio.currentTime = Math.min(pendingTime, Math.max(0, audio.duration - 0.1)); },
    playing: () => events.onStateChange(1),
    pause: () => { if (!destroyed && !audio.ended) events.onStateChange(2); },
    ended: () => events.onStateChange(0),
    waiting: () => events.onStateChange(3),
    error: () => events.onError('plik'),
  };
  for (const [name, listener] of Object.entries(listeners)) audio.addEventListener(name, listener);
  audio.preload = 'auto'; audio.src = url; mount(audio, file.name);
  return {
    getCurrentTime: () => audio.currentTime || 0,
    getDuration: () => Number.isFinite(audio.duration) ? audio.duration : 0,
    isMuted: () => audio.muted,
    setVolume: (value) => { audio.volume = value / 100; },
    mute: () => { audio.muted = true; }, unMute: () => { audio.muted = false; },
    seekTo: (value) => {
      pendingTime = Math.max(0, value);
      if (audio.readyState >= 1) audio.currentTime = Math.min(pendingTime, Math.max(0, audio.duration - 0.1));
    },
    playVideo: () => {
      void audio.play().catch((error) => {
        if (destroyed) return;
        if (error.name === 'NotAllowedError') events.onAutoplayBlocked();
        else if (error.name !== 'AbortError') events.onError('plik');
      });
    },
    pauseVideo: () => audio.pause(),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const [name, listener] of Object.entries(listeners)) audio.removeEventListener(name, listener);
      audio.pause(); audio.removeAttribute('src'); audio.load(); audio.remove();
      if (ownsURL) revokeURL(url);
    },
  };
}

export function createAssetAudioPlayer(song, events, options) {
  return createLocalAudioPlayer({ name: song.title, src: song.audioUrl }, events, options);
}

export class RaceMusic {
  constructor({ createPlayer = createYouTubePlayer, createLocalPlayer = createLocalAudioPlayer,
    createAssetPlayer = createAssetAudioPlayer, onStatus = () => {} } = {}) {
    this.createPlayer = createPlayer; this.onStatus = onStatus;
    this.createLocalPlayer = createLocalPlayer; this.localFiles = new Map();
    this.createAssetPlayer = createAssetPlayer;
    this.song = null; this.player = null; this.generation = 0;
    this.volume = 40; this.muted = false; this.ready = false;
    this.resetFlags();
  }

  resetFlags() {
    this.wanted = false; this.playing = false; this.blocked = false;
    this.manualPause = false; this.ended = false; this.elapsed = 0; this.lastSync = -Infinity;
  }

  async select(song, { force = false } = {}) {
    if (!force && song === this.song && !this.failed && (this.player || this.loading)) return;
    const generation = ++this.generation;
    this.reset(); this.player?.destroy(); this.player = null;
    this.song = song; this.ready = false; this.loading = Boolean(song); this.failed = false;
    if (!song) return;
    const file = this.localFiles.get(song.videoId);
    const local = Boolean(file || song.audioUrl);
    this.onStatus(local ? `Wczytywanie: ${file?.name ?? song.title}` : 'Ładowanie utworu z YouTube…');
    try {
      const events = {
        isCurrent: () => generation === this.generation,
        onStateChange: (state) => { if (generation === this.generation) this.onStateChange(state); },
        onAutoplayBlocked: () => {
          if (generation !== this.generation) return;
          this.blocked = true; this.playing = false;
          this.onStatus('Kliknij „Odtwórz”, aby włączyć muzykę.');
        },
        onError: (code) => {
          if (generation !== this.generation) return;
          this.failed = true; this.playing = false;
          this.onStatus(local ? 'Nie można odtworzyć pliku. Wybierz MP3, WAV lub OGG.' : `YouTube blokuje utwór (${code}). Wybierz lokalny plik przyciskiem poniżej.`);
        },
      };
      const player = await (file ? this.createLocalPlayer(file, events)
        : song.audioUrl ? this.createAssetPlayer(song, events) : this.createPlayer(song, events));
      if (generation !== this.generation) { player.destroy(); return; }
      this.player = player; this.ready = true; this.loading = false;
      player.setVolume(this.volume);
      if (this.muted) player.mute(); else player.unMute();
      if (!this.failed) this.onStatus(local ? 'Lokalny utwór · start razem z etapem (W / ↑).' : 'Muzyka wystartuje razem z etapem (W / ↑).');
      if (this.wanted) this.start(this.elapsed);
    } catch {
      if (generation !== this.generation) return;
      this.loading = false; this.failed = true;
      this.onStatus(local ? 'Nie można wczytać pliku. Wybierz inny plik.' : 'Nie udało się wczytać YouTube. Ponów lub wybierz lokalny plik.');
    }
  }

  async useLocalFile(file) {
    if (!this.song || !file) return;
    this.localFiles.set(this.song.videoId, file);
    await this.select(this.song, { force: true });
  }

  onStateChange(state) {
    if (state === 1) {
      this.playing = true; this.blocked = false; this.manualPause = false;
      this.onStatus(`Muzyka gra · ${this.song.bpm} BPM`);
    } else if (state === 2) {
      this.playing = false;
      if (this.wanted) { this.manualPause = true; this.onStatus('Muzyka wstrzymana · kliknij „Odtwórz”.'); }
    } else if (state === 0) {
      this.ended = true; this.playing = false;
      this.onStatus('Utwór zakończony · jedź dalej do mety.');
    } else if (state === 3) {
      this.playing = false; this.onStatus('Buforowanie muzyki…');
    }
  }

  start(seconds = 0) {
    if (!this.song) return;
    this.wanted = true; this.blocked = false; this.manualPause = false; this.ended = false;
    this.elapsed = seconds;
    if (!this.ready || this.failed) return;
    this.player.seekTo(Math.min(seconds, this.song.duration - 0.1), true);
    this.player.playVideo();
  }

  pause() {
    const wasActive = this.wanted || this.playing;
    this.wanted = false;
    if (wasActive && this.ready) this.player.pauseVideo();
    this.playing = false;
    if (wasActive && this.song) this.onStatus('Muzyka wstrzymana · kliknij „Odtwórz”.');
  }

  reset() {
    this.pause();
    if (this.ready && this.player) this.player.seekTo(0, false);
    this.resetFlags();
    if (this.song && this.ready) this.onStatus('Muzyka wystartuje razem z etapem (W / ↑).');
  }

  update(race, active, now = performance.now() / 1000) {
    if (!this.song) return race.elapsed;
    this.elapsed = race.elapsed;
    if (!active) { this.pause(); return this.ready ? this.player.getCurrentTime() : race.elapsed; }
    if (!this.wanted && !this.manualPause && !this.blocked && !this.ended && !this.failed) this.start(race.elapsed);
    // A paused/buffering player still owns the visual beat clock. Returning
    // race time here would make the scenery pulse while the song is stopped.
    if (!this.ready || !this.playing) return this.ready ? this.player.getCurrentTime() : race.elapsed;
    const time = this.player.getCurrentTime();
    // Only correct substantial drift (hidden-tab pause, buffering or seeking).
    // Frequent seeks would make the soundtrack stutter.
    if (now - this.lastSync >= 2) {
      this.lastSync = now;
      if (race.elapsed < this.song.duration && Math.abs(time - race.elapsed) > 1.25) this.player.seekTo(race.elapsed, true);
    }
    return time;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(100, volume));
    if (this.ready) this.player.setVolume(this.volume);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ready) { if (muted) this.player.mute(); else this.player.unMute(); }
  }

  dispose() {
    ++this.generation; this.pause(); this.player?.destroy(); this.player = null; this.song = null;
    this.ready = false; this.loading = false;
    this.localFiles.clear();
  }
}
