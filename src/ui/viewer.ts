// A closer look at the photos in the binder (after Dino Ripper's card viewer). The chosen photo lifts up and out
// of its pocket and grows to the middle of the screen; the photos before and after it wait at the sides, smaller
// and dimmed, and tapping one brings it to the middle. Leaving is the same in reverse: the photo shrinks back
// into its own pocket.

import { sound } from '../audio';
import type { Photo } from '../storage/db';
import { el, print, stars } from './dom';

export interface ViewerItem {
  photo: Photo;
  url: string;
  /** The dinosaur's name, shown small above the photo. */
  name: string;
}

export interface ViewerHost {
  /** Every photo that can be looked at, in binder order. */
  items: ViewerItem[];
  /** The print in the binder that this photo lives in, turning the binder to its page first if need be. */
  sourceOf(photo: Photo): HTMLElement | null;
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SIDE = 0.36; // how big the photos at the sides are, next to the one in the middle

type Place = 'middle' | 'before' | 'after' | 'gone-before' | 'gone-after';

export function viewPhotos(host: ViewerHost, first: Photo): Promise<void> {
  return new Promise((resolve) => {
    let index = Math.max(0, host.items.findIndex((i) => i.photo.id === first.id));
    let busy = true;
    let source: HTMLElement | null = null;

    const shade = el('div', 'viewer-shade');
    const name = el('div', 'viewer-name');
    const overlay = el('div', '', shade, name);
    overlay.id = 'viewer';
    document.body.append(overlay);

    /** The photos on screen: the one in the middle and its neighbours. */
    const cards = new Map<string, HTMLElement>();

    const card = (item: ViewerItem): HTMLElement => {
      let c = cards.get(item.photo.id);
      if (!c) {
        const ar = item.photo.width / item.photo.height;
        // big: it may overlap the photos at the sides, whose outer halves still show and can be tapped
        const width = Math.min(innerWidth * 0.74, innerHeight * 0.7 * ar);
        c = el('div', 'shot viewed', print(item.url, item.photo.width, item.photo.height), stars(item.photo.stars));
        c.style.setProperty('--w', `${width}px`);
        c.dataset.id = item.photo.id;
        overlay.append(c);
        cards.set(item.photo.id, c);
      }
      return c;
    };

    /** Where a card sits for each place it can be: a transform from the top-left corner of the screen. */
    const spot = (c: HTMLElement, place: Place): string => {
      const w = c.offsetWidth, h = c.offsetHeight;
      const midY = (innerHeight - h) / 2 + innerHeight * 0.025;
      const sideY = (innerHeight - h * SIDE) / 2 + innerHeight * 0.025;
      switch (place) {
        case 'middle': return `translate(${(innerWidth - w) / 2}px, ${midY}px) scale(1)`;
        case 'before': return `translate(${innerWidth * 0.015}px, ${sideY}px) scale(${SIDE})`;
        case 'after': return `translate(${innerWidth * 0.985 - w * SIDE}px, ${sideY}px) scale(${SIDE})`;
        case 'gone-before': return `translate(${-w * SIDE - 40}px, ${sideY}px) scale(${SIDE})`;
        default: return `translate(${innerWidth + 40}px, ${sideY}px) scale(${SIDE})`;
      }
    };

    const put = (c: HTMLElement, place: Place, ms: number) => {
      c.style.transition = ms ? `transform ${ms}ms ${EASE}, filter ${ms}ms ease, opacity ${ms}ms ease` : 'none';
      c.style.transform = spot(c, place);
      c.classList.toggle('beside', place !== 'middle');
      c.style.opacity = place.startsWith('gone') ? '0' : '1';
    };

    /** Lays out the middle photo and its neighbours; anything else on screen slides away and is removed. */
    const arrange = (ms: number, from?: -1 | 1) => {
      const wanted = new Map<string, Place>();
      for (const [offset, place] of [[-1, 'before'], [0, 'middle'], [1, 'after']] as const) {
        const item = host.items[index + offset];
        if (!item) continue;
        const fresh = !cards.has(item.photo.id);
        const c = card(item);
        if (fresh && from) {
          // a new neighbour slides in from off the edge it belongs to
          put(c, from > 0 ? 'gone-after' : 'gone-before', 0);
          void c.offsetWidth;
        }
        wanted.set(item.photo.id, place);
      }
      for (const [id, c] of cards) {
        const place = wanted.get(id);
        if (place) {
          put(c, place, ms);
        } else {
          put(c, from && from > 0 ? 'gone-before' : 'gone-after', ms);
          cards.delete(id);
          setTimeout(() => c.remove(), ms + 30);
        }
      }
      name.textContent = host.items[index].name;
    };

    /** The transform that lays a card exactly over a print in the binder. */
    const over = (c: HTMLElement, target: HTMLElement, lift = 0): string => {
      const r = target.getBoundingClientRect();
      const k = r.width / c.offsetWidth;
      // A page is one dinosaur, so a photo leaves towards the middle of its own page: one in the left-hand
      // column comes out to the right, one in the right-hand column to the left.
      const pocket = target.closest('.pocket');
      const column = pocket?.parentElement ? [...pocket.parentElement.children].indexOf(pocket) % 2 : 0;
      const out = column ? -1 : 1;
      // lifted: up and out of the pocket, a little bigger and tilted
      return `translate(${r.left + out * lift * r.width * 0.3}px, ${r.top - lift * r.height * 0.7}px) rotate(${out * lift * 5}deg) scale(${k * (1 + lift * 0.15)})`;
    };

    const hold = (photo: Photo) => {
      if (source) source.style.visibility = '';
      source = host.sourceOf(photo);
      if (source) source.style.visibility = 'hidden';
    };

    async function open() {
      const item = host.items[index];
      const c = card(item);
      // no stars until it has arrived: set before anything is measured, so they never show on the way
      c.classList.add('lifting');
      const from = host.sourceOf(item.photo);
      c.style.transition = 'none';
      c.style.transform = spot(c, 'middle');
      if (from) {
        source = from;
        const lifted = over(c, from, 1);
        const start = over(c, from);
        from.style.visibility = 'hidden';
        // up and out of its pocket, then across to the middle, growing as it comes
        await c.animate([{ transform: start }, { transform: lifted, offset: 0.32 }, { transform: spot(c, 'middle') }], {
          duration: 560, easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
        }).finished.catch(() => undefined);
      }
      c.classList.remove('lifting');
      arrange(320, 1);
      busy = false;
    }

    async function step(dir: -1 | 1) {
      if (busy || !host.items[index + dir]) return;
      busy = true;
      sound('page');
      index += dir;
      hold(host.items[index].photo);
      arrange(380, dir);
      await new Promise((r) => setTimeout(r, 390));
      busy = false;
    }

    async function close() {
      if (busy) return;
      busy = true;
      removeEventListener('keydown', keys, true);
      overlay.classList.remove('dark');
      const item = host.items[index];
      const c = card(item);
      for (const [id, other] of cards) if (id !== item.photo.id) other.style.opacity = '0';
      const back = host.sourceOf(item.photo);
      if (back) {
        c.classList.add('lifting');
        c.style.transition = 'none';
        // the way it came: over to its pocket, held above it for a moment, then down and in
        await c.animate([{ transform: spot(c, 'middle') }, { transform: over(c, back, 1), offset: 0.68 }, { transform: over(c, back) }], {
          duration: 460, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards',
        }).finished.catch(() => undefined);
        back.style.visibility = '';
      }
      if (source) source.style.visibility = '';
      overlay.remove();
      resolve();
    }

    overlay.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest<HTMLElement>('.viewed');
      const at = hit ? host.items.findIndex((i) => i.photo.id === hit.dataset.id) : -1;
      if (at >= 0 && at !== index) void step(at < index ? -1 : 1);
      else void close();
    });
    const keys = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'ArrowRight') void step(1);
      else if (e.key === 'ArrowLeft') void step(-1);
      else if (e.key === 'Escape') void close();
    };
    addEventListener('keydown', keys, true);

    void overlay.offsetWidth;
    overlay.classList.add('dark');
    void open();
  });
}
