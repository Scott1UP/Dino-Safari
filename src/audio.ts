// Sound: effects, the guide's voice and the ride music. All files are the game's own, loaded up front.
// Nothing here listens: the game never uses the microphone.

import { DINOS } from './data/dinos';

const DINO_IDS = Object.keys(DINOS);
const SFX = [
  'shutter', 'zoom', 'drum', 'throw', 'bounce', 'munch', 'pop', 'star', 'stamp', 'keep', 'bin', 'page', 'tada',
  'jungle', 'river', 'rustle', 'splash', 'stomp', 'rumble', 'flap', 'roar',
  'cart', 'lava', 'geyser', 'chime',
  ...DINO_IDS.map((d) => `call-${d}`),
];
const VOICE = [
  'welcome', 'teach-look', 'teach-photo', 'river', 'ferns', 'teach-fruit', 'teach-drum', 'finale', 'rex', 'ride-end',
  'great', 'wow', 'new', 'choose', 'none', 'complete',
  'l2-welcome', 'l2-first', 'l2-lava', 'l2-drop', 'l2-crystals', 'l2-springs', 'l2-rim', 'l2-finale',
  ...DINO_IDS.map((d) => `name-${d}`),
];
/** How loud each kind of sound is, before the master volume. */
const LEVEL = { sfx: 0.8, voice: 1, music: 0.3, ambience: 0.35 };
const MUTE_KEY = 'dino-safari:muted';
const MUSIC_KEY = 'dino-safari:music-off';

let context: AudioContext | undefined;
let master: GainNode;
const buffers = new Map<string, AudioBuffer>();
let speaking = false;
/** Lines waiting for the one being spoken to finish. */
const waiting: string[] = [];
let musicGain: GainNode | undefined;
let musicTimer = 0;
const loops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();

export let muted = localStorage.getItem(MUTE_KEY) === '1';

export let musicOn = localStorage.getItem(MUSIC_KEY) !== '1';
let musicWanted: number | undefined;

export function setMusicOn(value: boolean) {
  musicOn = value;
  localStorage.setItem(MUSIC_KEY, value ? '0' : '1');
  const level = musicWanted;
  if (!value) {
    music(false);
    musicWanted = level;
  } else if (level !== undefined) {
    music(true, level);
  }
}

export function setMuted(value: boolean) {
  muted = value;
  localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  if (context) master.gain.value = value ? 0 : 1;
}

async function load(kind: string, id: string) {
  try {
    const response = await fetch(`audio/${kind}/${id}.mp3`);
    if (!response.ok) return;
    buffers.set(`${kind}/${id}`, await context!.decodeAudioData(await response.arrayBuffer()));
  } catch {
    // a missing sound is never a reason to stop the game
  }
}

/** Browsers only allow sound after a touch: call this from the first tap. */
export function unlockAudio(): Promise<unknown> {
  if (context) return context.resume();
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(context.destination);
  return Promise.all([...SFX.map((id) => load('sfx', id)), ...VOICE.map((id) => load('voice', id)), load('music', 'ride')]);
}

function start(key: string, volume: number, loop = false, rate = 1, delay = 0) {
  const buffer = buffers.get(key);
  if (!context || !buffer) return undefined;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  source.playbackRate.value = rate;
  const gain = context.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(master);
  source.start(context.currentTime + delay);
  return { source, gain, buffer };
}

/**
 * The button press: a soft, rising "boop", made here rather than from a recording so it is always clean.
 */
function blip(volume: number) {
  if (!context) return;
  const now = context.currentTime;
  const tone = context.createOscillator();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(520, now);
  tone.frequency.exponentialRampToValueAtTime(880, now + 0.07);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22 * volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  tone.connect(gain).connect(master);
  tone.start(now);
  tone.stop(now + 0.18);
}

/** Plays an effect. `volume` 0 to 1 scales it, for sounds that are far away; `delay` is seconds from now. */
export function sound(id: string, volume = 1, delay = 0) {
  if (id === 'tap') return blip(volume);
  start(`sfx/${id}`, LEVEL.sfx * volume, false, 0.96 + Math.random() * 0.08, delay);
}

/**
 * The guide speaks. A line is never cut off: if he is still speaking, the new line waits its turn. Only the two
 * newest waiting lines are kept, so he can never fall far behind what is happening.
 */
export function say(id: string) {
  if (speaking) {
    waiting.push(id);
    if (waiting.length > 2) waiting.shift();
    return;
  }
  const line = start(`voice/${id}`, LEVEL.voice);
  if (!line) return;
  speaking = true;
  line.source.onended = () => {
    speaking = false;
    const next = waiting.shift();
    if (next) say(next);
  };
}

/** Forgets lines that have not started yet (the one being spoken still finishes). */
export function hush() {
  waiting.length = 0;
}

/** Starts or stops a looping background sound, fading it in or out. */
export function ambience(id: string, on: boolean) {
  if (!context) return;
  const playing = loops.get(id);
  if (on && !playing) {
    const started = start(`sfx/${id}`, 0, true);
    if (!started) return;
    started.gain.gain.linearRampToValueAtTime(LEVEL.ambience, context.currentTime + 1.5);
    loops.set(id, started);
  } else if (!on && playing) {
    playing.gain.gain.linearRampToValueAtTime(0, context.currentTime + 1);
    playing.source.stop(context.currentTime + 1.1);
    loops.delete(id);
  }
}

/**
 * The ride music, round and round. The piece is not cut as a perfect loop, so each pass fades out over its
 * last two seconds while the next fades in over them.
 */
export function music(on: boolean, level = 1) {
  musicWanted = on ? level : undefined;
  if (!context) return;
  if (!musicOn) on = false;
  const overlap = 2;
  if (!on) {
    clearTimeout(musicTimer);
    musicGain?.gain.linearRampToValueAtTime(0, context.currentTime + 1);
    musicGain = undefined;
    return;
  }
  if (musicGain) {
    musicGain.gain.linearRampToValueAtTime(level, context.currentTime + 0.8);
    return;
  }
  const bus = context.createGain();
  bus.gain.value = level;
  bus.connect(master);
  musicGain = bus;
  const pass = () => {
    const buffer = buffers.get('music/ride');
    if (!context || !buffer || musicGain !== bus) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    const now = context.currentTime, end = now + buffer.duration;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(LEVEL.music, now + overlap);
    gain.gain.setValueAtTime(LEVEL.music, end - overlap);
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain).connect(bus);
    source.start();
    musicTimer = window.setTimeout(pass, (buffer.duration - overlap) * 1000);
  };
  pass();
}
