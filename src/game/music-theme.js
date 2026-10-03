// Published tempo/duration, with an authored driving arrangement. Section
// boundaries describe our road phrases, not an automatic analysis of the audio.
export const PHONK = {
  videoId: 'w-sQRS-Lc9k', title: 'KORDHELL — MURDER IN MY MIND',
  url: 'https://www.youtube.com/watch?v=w-sQRS-Lc9k', bpm: 160, duration: 145,
  // Vite's base also supports project-subdirectory previews. The supplied MP3
  // is a local public asset, so this stage needs no YouTube/network permission.
  audioUrl: `${import.meta.env?.BASE_URL ?? '/'}audio/kordhell-murder-in-my-mind.mp3`,
  sections: [
    { at: 0, name: 'INTRO / ROZPĘD' }, { at: 12, name: 'FLOW / DŁUGIE ŁUKI' },
    { at: 36, name: 'RYTM / SZYKANY' }, { at: 60, name: 'PORT / ZMIANA KIERUNKU' },
    { at: 84, name: 'DRIFT / ZAKRĘTY' }, { at: 108, name: 'FINAŁ / FLOW' },
    { at: 132, name: 'SPRINT DO METY' },
  ],
};

export function musicRhythm(time, music = PHONK) {
  const seconds = Math.max(0, Math.min(music.duration, time));
  const beat = seconds * music.bpm / 60;
  const phase = beat - Math.floor(beat);
  const beatSeconds = phase * 60 / music.bpm;
  // A short flash on each beat, followed by a 15ms falloff. This is separate
  // from the softer neon pulse and uses the same seekable playback clock.
  const strobe = beatSeconds < 0.045 ? 1 : Math.max(0, (0.06 - beatSeconds) / 0.015);
  return { seconds, beat, pulse: Math.exp(-phase * 7), strobe,
    section: music.sections.findLast((section) => section.at <= seconds),
    progress: seconds / music.duration };
}
