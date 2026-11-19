// Dino Safari: ride the track, photograph the dinosaurs, then choose which photos go in the binder.

import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { BookOpen, Camera, Pause, Play, Settings, ZoomIn, ZoomOut, createIcons } from 'lucide';
import * as THREE from 'three';
import './style.css';
import { ambience, music, say, sound, unlockAudio } from './audio';
import { capture } from './capture/capture';
import { score } from './capture/scoring';
import { castOf } from './data/dinos';
import { level, props, useLevel, type LevelDef } from './data/level';
import { LEVELS } from './data/levels';
import { Ambient } from './engine/ambient';
import { Actor, type Stage } from './engine/behaviours';
import { Cutout, disposeArt, loadArt } from './engine/cutouts';
import { Interactions } from './engine/interactions';
import { Ride } from './engine/rail';
import { buildWorld, createRenderer, type World } from './engine/scene';
import { keepStorage, loadBinder, resetBinder, type Photo } from './storage/db';
import { openBinder } from './ui/binder';
import { $, wait } from './ui/dom';
import { pulse, setupHud, showHud } from './ui/hud';
import { pickLevel } from './ui/levels';
import { openMenu, type Graphics } from './ui/menu';
import { runReview, type RidePhoto } from './ui/review';

/** Scenery further away than this is lost in the haze, so it is not drawn. On low graphics it is cut off sooner. */
const SCENERY_REACH = { high: 190, medium: 190, low: 140 };
const GRAPHICS_KEY = 'dino-safari:graphics';
const FPS_KEY = 'dino-safari:fps-viewer';
const RIDES_KEY = 'dino-safari:rides';
const LEVEL_KEY = 'dino-safari:level';
const SLOW_KEY = 'dino-safari:slow-ride';

type Mode = 'title' | 'ride' | 'paused' | 'away';
let mode: Mode = 'title';

createIcons({ icons: { BookOpen, Camera, Pause, Play, Settings, ZoomIn, ZoomOut } });

const frame = $('frame');
const fade = $('fade');
const title = $('title');
const loading = $('loading');
const fpsCounter = $('fps');
fpsCounter.hidden = localStorage.getItem(FPS_KEY) !== '1';

// --- the level being played: its world, cast, scenery and background life. All of it is rebuilt when the
// level changes; the renderer is made once.
const renderer = createRenderer($<HTMLCanvasElement>('view'));
let world: World;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let actors: Actor[] = [];
let scenery: { cutout: Cutout; sway: number; phase: number; rate: number; detail: number; on: boolean }[] = [];
let ambient: Ambient;
let interactions: Interactions;
let ride: Ride;
let slowRide = localStorage.getItem(SLOW_KEY) === '1';

async function enterLevel(def: LevelDef) {
  // let go of the level being left
  if (world) {
    world.dispose();
    disposeArt();
  }
  useLevel(def);
  localStorage.setItem(LEVEL_KEY, def.id);
  world = await buildWorld(renderer);
  ({ scene, camera } = world);
  stage.camera = camera;
  actors = await Promise.all(def.spawns.map((spawn, i) => Actor.create(scene, spawn, i + 1)));
  scenery = await Promise.all(
    props().map(async (p, i) => {
      const cutout = new Cutout(await loadArt(p.sprite), p.height, p.mirror);
      cutout.group.position.set(...p.position);
      cutout.fixed = !!p.fixed;
      if (p.hang) {
        // a stalactite: the same picture, upside down, hanging from the roof
        cutout.squashY = -1;
        cutout.pose();
      }
      scene.add(cutout.group);
      // each plant sways a little, out of step with its neighbours
      return { cutout, sway: p.sway, phase: i * 1.7, rate: 0.7 + (i % 5) * 0.12, detail: p.detail, on: true };
    }),
  );
  ambient = await Ambient.create(scene);
  interactions = await Interactions.create(scene, actors);
  ride = new Ride();
  ride.slow = slowRide;
  ride.parked = true;
  setGraphics(graphics);
}

/**
 * Graphics. High is everything. Medium leaves out the middle-ground plants and rocks. Low also thins the
 * scattered scenery by half, drops the things out in the haze and the small background life, stops drawing
 * scenery sooner, and draws at the screen's plain resolution with a smaller shadow map.
 */
let graphics = (localStorage.getItem(GRAPHICS_KEY) as Graphics | null) ?? 'high';
function setGraphics(value: Graphics) {
  graphics = value;
  localStorage.setItem(GRAPHICS_KEY, value);
  const most = value === 'high' ? 2 : value === 'medium' ? 1 : 0;
  for (const item of scenery) {
    item.on = item.detail <= most;
    if (!item.on) item.cutout.group.visible = false;
  }
  ambient.low = value === 'low';
  world.setLowGraphics(value === 'low');
  resize();
}

const stage: Stage = {
  camera: undefined as unknown as THREE.Camera, // set as each level is entered
  // sounds from further away are quieter
  sound: (id, at) => sound(id, at ? THREE.MathUtils.clamp(1 - at.distanceTo(stage.camera.position) / 55, 0.15, 1) : 1),
};

// --- the binder, and addresses for showing its photos
const binder = await loadBinder().catch(() => new Map<string, Photo>());
keepStorage();
const urls = new Map<string, string>();
const urlOf = (photo: Photo) => {
  let url = urls.get(photo.id);
  if (!url) urls.set(photo.id, (url = URL.createObjectURL(photo.image)));
  return url;
};

/** Stops the sounds of the place. */
function quiet() {
  for (const l of LEVELS) {
    ambience(l.ambience, false);
    if (l.channel) ambience(l.channel.sound, false);
  }
}

/** How many of a level's photos are in its binder, and how many rides it has had. */
const foundIn = (def: LevelDef) => [...binder.keys()].filter((k) => k.startsWith(`${def.id}:`)).length;
const ridesKey = (def: LevelDef) => `${RIDES_KEY}:${def.id}`;

// --- one ride
let ridePhotos: RidePhoto[] = [];
let nextCue = 0;

function startRide() {
  for (const p of ridePhotos) {
    // photos that did not go in the binder are let go
    if (![...binder.values()].some((kept) => kept.id === p.id)) {
      URL.revokeObjectURL(p.url);
      urls.delete(p.id);
    }
  }
  ridePhotos = [];
  nextCue = 0;
  ride.restart();
  ride.parked = false;
  for (const a of actors) a.reset();
  interactions.reset();
  title.hidden = true;
  showHud(true);
  music(true, 1);
  ambience(level.ambience, true);
  fade.classList.remove('on');
  mode = 'ride';
}

/** Shows the title screen. Coming from the binder, its logo is left out: the one on the binder's cover flies in to be it. */
function toTitle(fromBinder = false) {
  title.classList.toggle('no-intro', fromBinder);
  title.classList.toggle('logo-away', fromBinder);
  showHud(false);
  quiet();
  music(true, 0.6);
  ride.restart();
  ride.parked = true;
  for (const a of actors) a.reset();
  interactions.reset();
  title.hidden = false;
  fade.classList.remove('on');
  mode = 'title';
}

const book = (def: LevelDef) => ({
  levelId: def.id,
  levelName: def.name,
  card: def.card,
  theme: def.theme,
  cast: castOf(def.cast),
  photos: binder,
  urlOf,
  rides: Number(localStorage.getItem(ridesKey(def)) ?? 0),
  async reset() {
    await resetBinder(def.id);
    for (const key of [...binder.keys()]) if (key.startsWith(`${def.id}:`)) binder.delete(key);
    localStorage.removeItem(ridesKey(def));
  },
});

/** Loads a level if it is not the one already loaded, behind the loading screen. */
async function goTo(def: LevelDef) {
  if (def === level) return;
  loading.classList.remove('done');
  mode = 'away';
  await enterLevel(def);
  loading.classList.add('done');
}

async function showBinder(def: LevelDef, fresh: string[] = []) {
  // opened from the title screen, the title's logo flies across to become the logo on the binder's cover
  const logoFrom = mode === 'title' ? title.querySelector('.logo')?.getBoundingClientRect() : undefined;
  mode = 'away';
  title.hidden = true;
  let home = false;
  const next = await openBinder({
    ...book(def),
    logoFrom,
    leaving(to) {
      if (to !== 'home') return undefined;
      // the title screen comes up behind the closing binder, waiting for its logo
      home = true;
      toTitle(true);
      return title.querySelector<HTMLElement>('.logo') ?? undefined;
    },
  }, fresh);
  if (next === 'ride') {
    await goTo(def);
    startRide();
  } else if (!home) {
    toTitle();
  }
}

/** A quick look in the binder during a ride: everything stands still until it is closed. */
async function peekBinder() {
  if (mode !== 'ride') return;
  mode = 'paused';
  sound('tap');
  await openBinder({ ...book(level), peek: true });
  mode = 'ride';
}

async function endRide() {
  mode = 'away';
  showHud(false);
  localStorage.setItem(ridesKey(level), String(Number(localStorage.getItem(ridesKey(level)) ?? 0) + 1));
  say('ride-end');
  sound('tada');
  fade.classList.add('on');
  quiet();
  music(true, 0.6);
  await wait(3600); // long enough for the guide to finish saying the ride is over
  const changed = await runReview(level.id, castOf(level.cast), ridePhotos, binder, urlOf);
  await showBinder(level, changed);
}

async function pause() {
  const riding = mode === 'ride';
  if (riding) mode = 'paused';
  sound('tap');
  const choice = await openMenu(riding, {
    slowRide: () => slowRide,
    setSlowRide(on) {
      slowRide = ride.slow = on;
      localStorage.setItem(SLOW_KEY, on ? '1' : '0');
    },
    graphics: () => graphics,
    setGraphics,
    fpsViewer: () => !fpsCounter.hidden,
    setFpsViewer(on) {
      fpsCounter.hidden = !on;
      localStorage.setItem(FPS_KEY, on ? '1' : '0');
    },
  });
  if (!riding) return;
  if (choice === 'home') toTitle();
  else mode = 'ride';
}

// --- controls
let lastZoomSound = 0;
setupHud({
  look(dx, dy, viewHeight) {
    // the view turns the way the finger goes (swipe up to look up, right to look right), by as much as the
    // finger crosses of the screen, however far the lens is zoomed
    const step = THREE.MathUtils.degToRad(camera.fov) / viewHeight;
    ride.turn(dx * step, -dy * step);
  },
  zoom(factor) {
    const before = ride.zoom;
    ride.zoomBy(factor);
    const now = performance.now();
    if (Math.abs(ride.zoom - before) > 0.004 && now - lastZoomSound > 450) {
      lastZoomSound = now;
      sound('zoom', 0.5);
    }
    return ride.zoom;
  },
  shutter() {
    if (mode !== 'ride') return undefined;
    // taken here and now, from the scene exactly as it was last drawn
    const sitters = actors.filter((a) => a.visible).map((a) => ({
      code: a.puppet.code, dino: a.info.id, pose: a.pose, card: a.puppet.card, coverage: a.puppet.coverage,
    }));
    const shot = capture(renderer, scene, camera, sitters);
    sound('shutter');
    const takenAt = Date.now();
    void shot.image.then((image) => {
      const id = `${takenAt}-${Math.random().toString(36).slice(2, 8)}`;
      const photo: Photo = {
        id, takenAt, levelId: level.id, image, width: shot.width, height: shot.height,
        subject: shot.subject, others: shot.others, ...score(shot.subject, shot.others),
      };
      ridePhotos.push({ ...photo, url: urlOf(photo) });
    });
    return shot.image;
  },
  throwFruit: (x, y) => mode === 'ride' && interactions.throwFruit(x, y, stage),
  drum: () => mode === 'ride' && interactions.bangDrum(stage),
  pause: () => void pause(),
  binder: () => void peekBinder(),
});

/** With more than one level, asks which; with one, that is the answer. */
const choose = (heading: string) => (LEVELS.length > 1 ? pickLevel(heading, LEVELS, foundIn) : Promise.resolve(LEVELS[0]));

$('play').addEventListener('click', async () => {
  const sounds = unlockAudio();
  const def = await choose('Pick a ride');
  if (!def) return;
  loading.classList.remove('done');
  await sounds;
  await goTo(def);
  loading.classList.add('done');
  sound('tap');
  music(true, 1, true); // the ride begins with the music at its beginning
  startRide();
});
$('open-binder').addEventListener('click', async () => {
  void unlockAudio();
  const def = await choose('Which binder?');
  if (def) void showBinder(def);
});
$('settings').addEventListener('click', () => {
  void unlockAudio().then(() => void pause());
});

// --- the browser's own pinch-to-zoom would wreck the game, so it is switched off everywhere; pinching the scene
// zooms the camera instead (see the HUD). Safari sends gesture events, and a trackpad pinch arrives as ctrl+wheel.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
document.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

// --- the view fills the screen, whatever its shape
function resize() {
  if (!camera) return; // the first level is still loading
  renderer.setSize(frame.clientWidth, frame.clientHeight, false);
  camera.aspect = frame.clientWidth / Math.max(1, frame.clientHeight);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(frame);

// --- the loop
let last = performance.now();
let frames = 0;
let countedFrom = last;

function tick(nowMs: number) {
  requestAnimationFrame(tick);
  // the first frame's timestamp can be a moment before the clock reading above, so never step backwards
  const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
  last = nowMs;
  const now = nowMs / 1000;
  if (mode === 'away' || mode === 'paused') return; // a screen covers the view, or everything is frozen

  ride.update(dt, camera, mode === 'ride' ? actors : []);
  if (mode === 'ride') {
    const s = ride.s;
    while (nextCue < level.cues.length && s >= level.cues[nextCue].s) {
      const cue = level.cues[nextCue++];
      if (cue.say) say(cue.say);
      if (cue.sound) sound(cue.sound);
      if (cue.pulse) pulse(cue.pulse);
    }
    const ch = level.channel;
    if (ch) ambience(ch.sound, s > ch.from - 12 && s < ch.to + 10);
    for (const a of actors) a.update(now, dt, s, stage);
    interactions.update(dt, stage);
    if (ride.finished) void endRide();
  } else {
    // the title: parked at the gate, with the jungle alive behind the logo
    for (const a of actors) a.update(now, dt, -1, stage);
  }

  const reach = SCENERY_REACH[graphics] ** 2;
  for (const { cutout, sway, phase, rate, on } of scenery) {
    if (!on) continue;
    const p = cutout.group.position;
    cutout.group.visible = (p.x - camera.position.x) ** 2 + (p.z - camera.position.z) ** 2 < reach;
    if (!cutout.group.visible) continue;
    cutout.faceCamera(camera);
    if (sway) cutout.card.rotation.z = Math.sin(now * rate + phase) * sway;
  }
  for (const a of actors) a.puppet.faceCamera(camera);
  ambient.update(now, camera);
  world.update(now);
  renderer.render(scene, camera);

  // frames drawn each second, shown on the ride when the FPS viewer is switched on
  frames++;
  if (nowMs - countedFrom >= 500) {
    if (!fpsCounter.hidden) fpsCounter.textContent = `${Math.round((frames * 1000) / (nowMs - countedFrom))} fps`;
    frames = 0;
    countedFrom = nowMs;
  }
}
// --- start on the level played last time
// (rides counted before there was more than one level belong to the first)
const oldRides = localStorage.getItem(RIDES_KEY);
if (oldRides && !localStorage.getItem(ridesKey(LEVELS[0]))) localStorage.setItem(ridesKey(LEVELS[0]), oldRides);
await enterLevel(LEVELS.find((l) => l.id === localStorage.getItem(LEVEL_KEY)) ?? LEVELS[0]);
requestAnimationFrame(tick);

title.hidden = false;
loading.classList.add('done');

// --- the ride music plays on the title screen too. A browser may hold all sound back until the first touch,
// so every touch asks again; the music starts by itself the moment it is allowed.
music(true, 0.6);
const wake = () => void unlockAudio();
wake();
for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(type, wake, { capture: true });
