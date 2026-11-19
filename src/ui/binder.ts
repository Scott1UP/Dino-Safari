// The level's binder: a real book (after Dino Ripper's). A front cover with the game's logo and the level's name;
// inside the cover, a page of stats; then a page of four photo pockets for each dinosaur. Pages turn with the
// arrows, with a swipe, or with the arrow keys. A filled pocket holds his own photo; an empty one shows the pose
// still to find as a pale shape, with a small picture of what brings it out.

import { Camera, ChevronLeft, ChevronRight, House, Play, Star } from 'lucide';
import { say, sound } from '../audio';
import { POSES, poseSprite, type DinoInfo, type PoseId } from '../data/dinos';
import type { Theme } from '../data/level';
import { slotKey, type Photo } from '../storage/db';
import { $, button, el, icon, print, stars, wait } from './dom';
import { viewPhotos } from './viewer';

/** How long the reset button has to be held, in milliseconds. */
const RESET_HOLD = 2500;
/** A page is this much taller than it is wide. */
const SHAPE = 1.12;

export interface BinderBook {
  levelId: string;
  levelName: string;
  /** A picture of the level, and its colours: every level's binder looks like its own place. */
  card: string;
  theme: Theme;
  /** The level's dinosaurs, one to a page, in page order. */
  cast: DinoInfo[];
  /** Slot key -> the photo kept there. */
  photos: Map<string, Photo>;
  urlOf(photo: Photo): string;
  /** Rides taken so far. */
  rides: number;
  /** Empties the binder for good. */
  reset(): Promise<void>;
  /** A quick look in the middle of a ride: the only way out is back to the ride. */
  peek?: boolean;
  /** Where the title screen's logo was: it flies from there to become the logo on the cover. */
  logoFrom?: DOMRect;
  /**
   * Called as the binder starts to close. Going home, it may hand back the title screen's logo: the logo on
   * the binder's cover then flies across to become it, instead of dropping away with the binder.
   */
  leaving?(to: 'home' | 'ride'): HTMLElement | undefined;
}

const root = $('binder');

/** What brings each pose out, as a picture in the corner of its empty pocket. */
function hint(pose: PoseId): HTMLElement | undefined {
  if (pose === 'standing') return undefined;
  if (pose === 'special') return el('span', 'hint', icon(Star));
  const img = el('img', 'hint');
  img.src = pose === 'eating' ? 'art/ui/fruit.webp' : 'art/ui/drum.webp';
  img.alt = '';
  return img;
}

/**
 * Opens the binder at its cover, which swings open. `fresh` are slots just filled: they get a gold edge and the
 * binder turns to the first of them. Resolves with what he pressed: home, or ride again.
 */
export function openBinder(bk: BinderBook, fresh: string[] = []): Promise<'home' | 'ride'> {
  return new Promise((resolve) => {
    const DINO_LIST = bk.cast;
    const PAGES = DINO_LIST.length;
    // side 0 is the inside of the front cover, sides 1..PAGES hold photos; the last side must be a right-hand one
    const LAST_SIDE = PAGES % 2 ? PAGES : PAGES + 1;
    const LAST_SPREAD = (LAST_SIDE - 1) / 2;
    const TOTAL = PAGES * POSES.length;
    /** How many of this level's slots are filled. */
    const owned = () => DINO_LIST.reduce((n, d) => n + found(d), 0);
    /** The spread on show: -1 is the closed front cover. */
    let spread = -1;
    let busy = true;
    let open = true;

    const key = (dino: DinoInfo, pose: PoseId) => slotKey(bk.levelId, dino.id, pose);
    const found = (dino: DinoInfo) => POSES.filter((p) => bk.photos.has(key(dino, p))).length;
    const pips = (dino: DinoInfo) => el('div', 'pips', ...POSES.map((p) => el('i', bk.photos.has(key(dino, p)) ? 'on' : '')));

    const photoPage = (dino: DinoInfo): HTMLElement => {
      const count = found(dino);
      // a dinosaur he has never photographed has no name yet
      const name = el('button', '', count ? dino.name : '? ? ?');
      name.type = 'button';
      if (count) name.addEventListener('click', () => {
        say(`name-${dino.id}`);
        sound(`call-${dino.id}`, 0.6);
      });
      const grid = el('div', 'grid');
      for (const [i, pose] of POSES.entries()) {
        const k = key(dino, pose);
        const photo = bk.photos.get(k);
        const pocket = el('div', 'pocket');
        if (photo) {
          if (fresh.includes(k)) pocket.classList.add('new');
          const picture = print(bk.urlOf(photo), photo.width, photo.height);
          picture.dataset.id = photo.id;
          const card = el('div', 'shot', picture, stars(photo.stars));
          card.style.setProperty('--tilt', `${[-1.5, 1.2, 1, -1.3][i]}deg`);
          pocket.append(card);
          pocket.addEventListener('click', () => {
            if (busy || swiped || viewing) return;
            sound('tap');
            viewing = true;
            void viewPhotos(viewer, photo).then(() => (viewing = false));
          });
        } else {
          pocket.classList.add('missing');
          const shape = el('img', 'shape');
          shape.src = poseSprite(dino.id, pose);
          shape.alt = '';
          shape.draggable = false;
          pocket.append(shape);
          const badge = hint(pose);
          if (badge) pocket.append(badge);
        }
        grid.append(pocket);
      }
      return el('div', 'side sheet', el('header', '', name, pips(dino)), grid);
    };

    const infoPage = (): HTMLElement => {
      const have = owned();
      const starCount = DINO_LIST.reduce((sum, d) => sum + POSES.reduce((n, p) => n + (bk.photos.get(key(d, p))?.stars ?? 0), 0), 0);
      const complete = have === TOTAL;
      // which level this is: its picture, with its name across it
      const banner = el('div', 'info-level', el('b', '', bk.levelName));
      banner.style.backgroundImage = `url('${bk.card}')`;
      const count = el('div', 'info-count');
      count.innerHTML = `<b>${have}</b> of ${TOTAL} photos`;
      const bar = el('div', 'info-bar', el('i'));
      (bar.firstElementChild as HTMLElement).style.width = `${(have / TOTAL) * 100}%`;
      const chip = (className: string, node: Node, text: string) => el('span', className, node, text);
      const chips = el('div', 'info-chips',
        chip('gold', icon(Star), `${starCount} of ${TOTAL * 3}`),
        chip('', icon(Camera), `${bk.rides} ${bk.rides === 1 ? 'ride' : 'rides'}`),
      );
      const list = el('ul', '', ...DINO_LIST.map((d) => el('li', '', el('span', '', found(d) ? d.name : '? ? ?'), pips(d))));
      const reset = el('button', 'reset', el('i'), el('span', '', 'Hold to reset collection'));
      reset.type = 'button';
      reset.style.setProperty('--hold', `${RESET_HOLD}ms`);
      holdToReset(reset);
      return el('div', `side inside info${complete ? ' complete' : ''}`,
        banner, ...(complete ? [el('div', 'info-done', '★ Collection complete! ★')] : []), count, bar, chips, list, reset);
    };

    /**
     * The reset button only acts if it is held down for RESET_HOLD without letting go, while a red bar fills
     * across it. A tap, or a hold given up early, does nothing.
     */
    const holdToReset = (b: HTMLElement) => {
      let timer = 0;
      const cancel = () => {
        clearTimeout(timer);
        b.classList.remove('holding');
      };
      b.addEventListener('pointerdown', (e) => {
        if (busy) return;
        b.setPointerCapture(e.pointerId);
        b.classList.add('holding');
        sound('tap');
        timer = window.setTimeout(async () => {
          await bk.reset();
          fresh = [];
          sound('bin');
          // show the emptied binder straight away
          setPage(left, 2 * spread);
          setPage(right, 2 * spread + 1);
        }, RESET_HOLD);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, cancel);
      // a long press on a tablet would otherwise bring up the browser's own menu
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    /**
     * Looking through the photos one at a time. As the view moves from photo to photo the binder quietly turns
     * to that photo's page behind it, so each one goes back into its own pocket.
     */
    let viewing = false;
    const viewer = {
      get items() {
        return DINO_LIST.flatMap((d) => POSES.flatMap((p) => {
          const photo = bk.photos.get(key(d, p));
          return photo ? [{ photo, url: bk.urlOf(photo), name: d.name }] : [];
        }));
      },
      sourceOf(photo: Photo) {
        const page = DINO_LIST.findIndex((d) => d.id === photo.subject?.dino) + 1;
        const wanted = Math.floor(page / 2);
        if (page > 0 && wanted !== spread) {
          spread = wanted;
          setPage(left, 2 * spread);
          setPage(right, 2 * spread + 1);
          updateNav();
        }
        return book.querySelector<HTMLElement>(`.page .print[data-id="${photo.id}"]`);
      },
    };

    const cover = (): HTMLElement => {
      const logo = el('img');
      logo.src = 'art/ui/logo.webp';
      logo.alt = 'Dino Safari';
      logo.draggable = false;
      const name = el('div', 'cover-name', el('small', '', 'Photo binder'), bk.levelName);
      return el('div', 'side cover', logo, name);
    };

    const side = (i: number): HTMLElement | null => {
      if (i === -1) return cover();
      if (i === 0) return infoPage();
      if (i >= 1 && i <= PAGES) return photoPage(DINO_LIST[i - 1]);
      if (i === LAST_SIDE) return el('div', 'side inside');
      return null;
    };

    const setPage = (page: HTMLElement, i: number) => {
      const content = side(i);
      page.replaceChildren(...(content ? [content] : []));
    };

    // --- the book
    const book = el('div', 'book closed');
    const left = el('div', 'page left');
    const right = el('div', 'page right');
    book.append(left, right);
    const prev = button('btn-square book-nav book-prev', ChevronLeft, '', () => void turn(-1));
    prev.setAttribute('aria-label', 'Previous page');
    const next = button('btn-square book-nav book-next', ChevronRight, '', () => void turn(1));
    next.setAttribute('aria-label', 'Next page');
    const actions = bk.peek
      ? el('div', 'book-actions', button('btn-go', Play, 'Back to the ride', () => void close('ride')))
      : el('div', 'book-actions',
          button('btn-alt', House, 'Home', () => void close('home')),
          button('btn-go', Play, 'Ride again', () => void close('ride')));
    const tip = el('div', 'book-tip', 'Tap a picture to take a closer look');
    root.classList.remove('leaving');
    // the level's own look: its picture, washed with its colour, behind the book; its colours on the pages
    root.style.setProperty('--wash', bk.theme.wash);
    root.style.setProperty('--sheet', bk.theme.sheet);
    root.style.setProperty('--paper', bk.theme.paper);
    root.style.setProperty('--card', `url('${bk.card}')`);
    root.replaceChildren(el('div', 'binder-shade'), tip, book, prev, next, actions);

    const updateNav = () => {
      prev.hidden = spread <= 0;
      next.hidden = spread < 0 || spread >= LAST_SPREAD;
    };

    const size = () => {
      const ph = Math.min(innerHeight * 0.74, innerWidth * 0.41 * SHAPE);
      // set on the whole overlay, so the page-turn buttons can sit against the binder's edges
      root.style.setProperty('--ph', `${ph}px`);
      root.style.setProperty('--pw', `${ph / SHAPE}px`);
    };

    /** Turns one leaf: forwards (dir 1) lifts the right-hand page over to the left, backwards the reverse. */
    async function turn(dir: 1 | -1, duration = 650) {
      const target = spread + dir;
      if (busy || target < 0 || target > LAST_SPREAD) return;
      busy = true;
      sound('page');
      const leaf = el('div', `leaf ${dir > 0 ? 'from-right' : 'from-left'}`, el('div', 'leaf-face leaf-front'), el('div', 'leaf-face leaf-back'));
      const front = side(dir > 0 ? 2 * spread + 1 : 2 * spread);
      const back = side(dir > 0 ? 2 * spread + 2 : 2 * spread - 1);
      if (front) leaf.children[0].append(front);
      if (back) leaf.children[1].append(back);
      book.append(leaf);
      if (dir > 0) setPage(right, 2 * spread + 3);
      else setPage(left, 2 * spread - 2);

      await leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${-180 * dir}deg)` }], {
        duration, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards',
      }).finished;

      if (dir > 0) setPage(left, 2 * spread + 2);
      else setPage(right, 2 * spread - 1);
      leaf.remove();
      spread = target;
      updateNav();
      busy = false;
    }

    // --- swipe to turn: a sideways flick anywhere on the book
    let downX = 0, downY = 0;
    let swiped = false;
    /** Whether the touch in progress began on the pages themselves, and so could be a swipe. */
    let swiping = false;
    book.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      swiped = false;
      // a press on the reset button is a press, however long it is held
      swiping = !(e.target as Element).closest('.reset');
    });
    book.addEventListener('pointerup', (e) => {
      if (!swiping) return;
      swiping = false;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      swiped = true;
      void turn(dx < 0 ? 1 : -1);
    });
    const keys = (e: KeyboardEvent) => {
      if (viewing) return;
      if (e.key === 'ArrowRight') void turn(1);
      else if (e.key === 'ArrowLeft') void turn(-1);
      else if (e.key === 'Escape') void close(bk.peek ? 'ride' : 'home');
    };
    addEventListener('keydown', keys);
    addEventListener('resize', size);

    /**
     * Leaving is opening in reverse, and brisker: the cover swings shut, then the closed binder drops away.
     */
    async function close(what: 'home' | 'ride') {
      if (!open || busy || viewing) return;
      open = false;
      busy = true;
      sound('tap');
      const titleLogo = bk.leaving?.(what);
      removeEventListener('keydown', keys);
      removeEventListener('resize', size);
      root.classList.add('leaving');
      if (spread >= 0) {
        // the left-hand page swings over to the right, and its other side is the front cover
        sound('page');
        const leaf = el('div', 'leaf from-left', el('div', 'leaf-face leaf-front'), el('div', 'leaf-face leaf-back'));
        const front = side(2 * spread);
        if (front) leaf.children[0].append(front);
        leaf.children[1].append(cover());
        book.append(leaf);
        setPage(left, -2);
        book.style.transitionDuration = '0.4s';
        book.classList.add('closed');
        await leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], {
          duration: 400, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards',
        }).finished;
        setPage(right, -1);
        leaf.remove();
      }
      const drop = book.animate([{ translate: '0 0', rotate: '0deg' }, { translate: '0 130vh', rotate: '9deg' }], {
        duration: 340, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)', fill: 'forwards',
      }).finished;
      const coverLogo = book.querySelector<HTMLElement>('.page.right .cover img');
      if (titleLogo && coverLogo) {
        // Going home, the logo does not drop away with the binder: it leaves the cover, shrinks a touch, then
        // pops forward to become the title screen's logo.
        const from = coverLogo.getBoundingClientRect(), to = titleLogo.getBoundingClientRect();
        const flying = el('img', 'logo-fly');
        flying.src = 'art/ui/logo.webp';
        flying.alt = '';
        flying.style.cssText = `left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px`;
        const k = from.width / to.width;
        const at = (scale: number) =>
          `translate(${from.left + (from.width * (1 - scale)) / 2 - to.left}px, ${from.top + (from.height * (1 - scale)) / 2 - to.top}px) scale(${k * scale})`;
        coverLogo.style.visibility = 'hidden';
        root.append(flying);
        await flying.animate([{ transform: at(1) }, { transform: at(0.86) }], { duration: 170, easing: 'ease-out', fill: 'forwards' }).finished;
        await flying.animate([{ transform: at(0.86) }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'forwards' }).finished;
        titleLogo.closest('#title')?.classList.remove('logo-away');
      }
      await drop;
      root.hidden = true;
      root.classList.remove('leaving');
      root.replaceChildren();
      resolve(what);
    }

    // --- arrive closed, then the cover swings open, then on to the first new photo
    setPage(left, -2);
    setPage(right, -1);
    updateNav();
    size();
    root.hidden = false;
    const coverLogo = book.querySelector<HTMLElement>('.page.right .cover img');
    // where the cover's logo will be once the binder has come to rest: measured now, before it starts to move
    const logoTo = coverLogo?.getBoundingClientRect();
    // the closed binder comes up from below
    void book.animate([{ translate: '0 60vh', rotate: '9deg' }, { translate: '0 0', rotate: '0deg' }], {
      duration: 500, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    if (bk.logoFrom && coverLogo && logoTo) {
      // The title screen's logo becomes the cover's: it flies from where it was, shrinking, to land on the cover
      // as the binder comes to rest.
      const to = logoTo, from = bk.logoFrom;
      const flying = el('img', 'logo-fly');
      flying.src = 'art/ui/logo.webp';
      flying.alt = '';
      flying.style.cssText = `left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px`;
      coverLogo.style.visibility = 'hidden';
      root.append(flying);
      const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
      void flying.animate([{ transform: start }, { transform: 'none' }], { duration: 540, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' }).finished.then(() => {
        coverLogo.style.visibility = '';
        flying.remove();
      });
    }
    void (async () => {
      await wait(650);
      if (!open) return;
      book.classList.remove('closed');
      busy = false;
      await turn(1);
      const first = DINO_LIST.findIndex((d) => fresh.some((k) => k.startsWith(`${bk.levelId}:${d.id}:`)));
      const wanted = first < 0 ? 0 : Math.floor((first + 1) / 2);
      while (open && spread < wanted) await turn(1, 380);
      if (open && owned() === TOTAL && fresh.length) {
        say('complete');
        sound('tada');
      }
    })();
  });
}
