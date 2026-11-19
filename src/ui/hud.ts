// The ride's controls. Everything can be done two ways: on the scene itself (drag to look, pinch to zoom, a clean
// tap to take a photo) or with the buttons (zoom in, zoom out, the big red shutter). Fruit is dragged out of its
// button and thrown, the drum is tapped, and there is a pause button.

import { $ } from './dom';

const PHOTO_COOLDOWN = 600; // milliseconds
const FRUIT_COOLDOWN = 1000;
const DRUM_COOLDOWN = 3000;
const PHOTO_SHOWN_FOR = 2200;
/** A touch is a clean tap, and so takes a photo, if it moves less than this many pixels and lifts within this long. */
const TAP_SLOP = 10;
const TAP_TIME = 300;
/** One press of a zoom button, and how fast holding it keeps zooming. */
const ZOOM_STEP = 1.3;
const ZOOM_HOLD = 1.06;

export interface HudHandlers {
  /** A drag across the scene, in pixels, with the view's height for scale. */
  look(dx: number, dy: number, viewHeight: number): void;
  /** Zoom by a factor (more than 1 is closer). Returns the zoom now, where 1 is the normal view. */
  zoom(factor: number): number;
  /** Take the photo now. Returns the picture, for the little preview. */
  shutter(): Promise<Blob> | undefined;
  /** Throw a fruit at a point of the view, each axis from -1 to 1 (up and right are positive). */
  throwFruit(x: number, y: number): void;
  drum(): void;
  pause(): void;
  /** A quick look in the binder, with the ride frozen. */
  binder(): void;
}

const frame = $('frame');
const hud = $('hud');
const flash = $('flash');
const lens = $('lens');
const reticle = $('reticle');
const zoomChip = $('zoom');
const photo = $('photo');
const photoImage = photo.querySelector('img')!;
const shutter = $('shutter');
const fruit = $('fruit');
const drum = $('drum');
const ghost = $('ghost');

/** Greys a button out until it can be used again. */
function rest(button: HTMLElement, ms: number) {
  button.classList.add('resting');
  setTimeout(() => button.classList.remove('resting'), ms);
}

let hideZoom = 0;
/** Shows how far the lens is zoomed: the chip, the corners closing in and the dark ring round the view. */
export function showZoom(zoom: number, announce = true) {
  zoomChip.querySelector('b')!.textContent = `${zoom.toFixed(1)}×`;
  reticle.style.setProperty('--tight', String(1 / Math.max(1, zoom) ** 0.35));
  lens.style.setProperty('--zoomed', String(Math.min(1, Math.max(0, (zoom - 1) / 2))));
  if (!announce) return;
  zoomChip.classList.add('on');
  clearTimeout(hideZoom);
  hideZoom = window.setTimeout(() => zoomChip.classList.remove('on'), 1200);
}

export function showHud(on: boolean) {
  hud.hidden = !on;
  document.body.classList.toggle('riding', on);
  if (!on) {
    photo.classList.remove('show');
    zoomChip.classList.remove('on');
    showZoom(1, false);
  }
}

/** Makes a button throb, to show which one the guide is talking about. */
export function pulse(which: 'shutter' | 'fruit' | 'drum') {
  const button = $(which);
  button.classList.remove('pulse');
  void button.offsetWidth;
  button.classList.add('pulse');
}

export function setupHud(on: HudHandlers) {
  // --- looking and zooming. One finger drags the view; two fingers pinch to zoom (and still drag).
  const fingers = new Map<number, { x: number; y: number }>();
  const spread = () => {
    const [a, b] = [...fingers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const middle = () => {
    let x = 0, y = 0;
    for (const f of fingers.values()) {
      x += f.x;
      y += f.y;
    }
    return { x: x / fingers.size, y: y / fingers.size };
  };
  // whether the touch in progress could still be a clean tap
  let tap: { x: number; y: number; at: number } | undefined;
  frame.addEventListener('pointerdown', (e) => {
    if (hud.hidden || fingers.size >= 2) return;
    tap = fingers.size ? undefined : { x: e.clientX, y: e.clientY, at: performance.now() };
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    frame.setPointerCapture(e.pointerId);
  });
  frame.addEventListener('pointermove', (e) => {
    const finger = fingers.get(e.pointerId);
    if (!finger) return;
    const before = middle();
    const apart = fingers.size === 2 ? spread() : 0;
    finger.x = e.clientX;
    finger.y = e.clientY;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) tap = undefined;
    if (tap) return; // not a drag yet: a tap never moves the view
    const after = middle();
    on.look(after.x - before.x, after.y - before.y, frame.clientHeight);
    if (apart > 0) showZoom(on.zoom(spread() / apart));
  });
  frame.addEventListener('pointerup', (e) => {
    if (!fingers.delete(e.pointerId)) return;
    // a clean tap on the scene takes a photo, the same as the red button
    if (tap && performance.now() - tap.at <= TAP_TIME) void snap();
    tap = undefined;
  });
  frame.addEventListener('pointercancel', (e) => {
    fingers.delete(e.pointerId);
    tap = undefined;
  });
  // a mouse wheel or trackpad pinch zooms too, for playing on a computer
  frame.addEventListener('wheel', (e) => {
    if (hud.hidden) return;
    e.preventDefault();
    showZoom(on.zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025))));
  }, { passive: false });

  // --- the shutter. The photo is taken inside the handler; the flash and preview come after, so they are never in it.
  let lastPhotoAt = -Infinity;
  let hidePhoto = 0;
  async function snap() {
    const now = performance.now();
    if (now - lastPhotoAt < PHOTO_COOLDOWN) return;
    lastPhotoAt = now;
    const taken = on.shutter();
    if (!taken) return;
    flash.classList.remove('go');
    reticle.classList.remove('snap');
    void flash.offsetWidth;
    flash.classList.add('go');
    reticle.classList.add('snap');
    rest(shutter, PHOTO_COOLDOWN);
    const blob = await taken;
    URL.revokeObjectURL(photoImage.src);
    photoImage.src = URL.createObjectURL(blob);
    photo.classList.add('show');
    clearTimeout(hidePhoto);
    hidePhoto = window.setTimeout(() => photo.classList.remove('show'), PHOTO_SHOWN_FOR);
  }
  shutter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    void snap();
  });

  // --- zoom buttons, beside the shutter: one press is a step, holding keeps going
  for (const [id, step, hold] of [['zoom-in', ZOOM_STEP, ZOOM_HOLD], ['zoom-out', 1 / ZOOM_STEP, 1 / ZOOM_HOLD]] as const) {
    const b = $(id);
    let repeat = 0;
    const stop = () => clearInterval(repeat);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      showZoom(on.zoom(step));
      stop();
      repeat = window.setInterval(() => showZoom(on.zoom(hold)), 60);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(type, stop);
  }

  // --- fruit: drag it out of its button and let go over the scene. There is no "throwing mode" to remember.
  let lastFruitAt = -Infinity;
  let carrying: number | undefined;
  const carry = (e: PointerEvent) => {
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
  };
  fruit.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (carrying !== undefined || performance.now() - lastFruitAt < FRUIT_COOLDOWN) return;
    carrying = e.pointerId;
    fruit.setPointerCapture(e.pointerId);
    fruit.classList.add('down');
    ghost.hidden = false;
    carry(e);
  });
  fruit.addEventListener('pointermove', (e) => e.pointerId === carrying && carry(e));
  const drop = (e: PointerEvent, thrown: boolean) => {
    if (e.pointerId !== carrying) return;
    carrying = undefined;
    ghost.hidden = true;
    fruit.classList.remove('down');
    if (!thrown) return;
    lastFruitAt = performance.now();
    rest(fruit, FRUIT_COOLDOWN);
    const box = frame.getBoundingClientRect();
    const button = fruit.getBoundingClientRect();
    const onButton = e.clientX >= button.left && e.clientX <= button.right && e.clientY >= button.top && e.clientY <= button.bottom;
    // let go still on the button: a plain tap. Nothing goes wrong; the fruit is tossed a little way ahead.
    const x = onButton ? 0 : Math.min(1, Math.max(-1, ((e.clientX - box.left) / box.width) * 2 - 1));
    const y = onButton ? -0.45 : Math.min(1, Math.max(-1, 1 - ((e.clientY - box.top) / box.height) * 2));
    on.throwFruit(x, y);
  };
  fruit.addEventListener('pointerup', (e) => drop(e, true));
  fruit.addEventListener('pointercancel', (e) => drop(e, false));

  // --- drum
  let lastDrumAt = -Infinity;
  drum.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (performance.now() - lastDrumAt < DRUM_COOLDOWN) return;
    lastDrumAt = performance.now();
    rest(drum, DRUM_COOLDOWN);
    on.drum();
  });

  $('pause').addEventListener('click', on.pause);
  $('peek-binder').addEventListener('click', on.binder);
}
