// After the ride: his best photo of each dinosaur-and-pose he caught, one at a time, with its stars.
// A pose he has never caught gets a "New!" badge, and he keeps it for the binder or throws it away.
// If the binder already has that pose, the old and new photos sit side by side and he taps the one to keep.

import { Check, Trash2 } from 'lucide';
import { hush, say, sound } from '../audio';
import { DINOS, POSES, type DinoId, type DinoInfo, type PoseId } from '../data/dinos';
import { fillSlot, slotKey, type Photo } from '../storage/db';
import { $, button, el, print, stars, wait } from './dom';

/** A photo taken this ride, with an address for showing it. */
export interface RidePhoto extends Photo {
  url: string;
}

const root = $('review');

/** A print with its stars underneath. */
function shot(url: string, photo: Photo, ...extra: Node[]): HTMLDivElement {
  return el('div', 'shot', print(url, photo.width, photo.height), stars(photo.stars), ...extra);
}

/**
 * Runs the review. `binder` is updated as he keeps photos. Returns the slots that changed, for the binder to show off.
 */
export async function runReview(levelId: string, cast: DinoInfo[], photos: RidePhoto[], binder: Map<string, Photo>, urlOf: (photo: Photo) => string): Promise<string[]> {
  // his shots of each dinosaur-and-pose, best first, in binder order
  const groups: { dino: DinoId; pose: PoseId; shots: RidePhoto[] }[] = [];
  for (const info of cast) {
    for (const pose of POSES) {
      // A photo already in the binder is only ever up against better ones: a worse shot of the same pose is
      // never offered, so a good photo cannot be swapped for a poorer one.
      const kept = binder.get(slotKey(levelId, info.id, pose));
      const shots = photos
        .filter((p) => p.subject?.dino === info.id && p.subject.pose === pose && (!kept || p.points > kept.points))
        .sort((a, b) => b.points - a.points);
      if (shots.length) groups.push({ dino: info.id, pose, shots });
    }
  }

  root.hidden = false;
  root.replaceChildren();
  const changed: string[] = [];

  if (!groups.length) {
    // nothing to fail: no dinosaurs this time just means another ride
    root.append(el('h2', 'heading', 'Ride again!'));
    say('none');
    await wait(2800);
    root.hidden = true;
    return changed;
  }

  const dots = el('div', 'dots', ...groups.map(() => el('i')));
  const heading = el('h2', 'heading small');
  const table = el('div', 'table');
  const others = el('div', 'others');
  const buttons = el('div', 'row');
  root.append(dots, heading, table, others, buttons);

  for (const [n, group] of groups.entries()) {
    const key = slotKey(levelId, group.dino, group.pose);
    const old = binder.get(key);
    let chosen = group.shots[0];
    let card = shot(chosen.url, chosen);

    const present = (next: RidePhoto) => {
      chosen = next;
      const fresh = old ? shot(next.url, next, el('span', 'tag', 'New')) : shot(next.url, next, el('span', 'badge-new', 'NEW!'));
      card.replaceWith(fresh);
      card = fresh;
      for (const [i, thumb] of [...others.children].entries()) thumb.classList.toggle('on', group.shots[i] === next);
      for (let i = 0; i < next.stars; i++) setTimeout(() => sound('star'), 250 + i * 260);
    };

    // --- lay the table
    heading.textContent = old ? 'Which one?' : DINOS[group.dino].name;
    table.className = old ? 'table choose' : 'table';
    table.replaceChildren(card);
    let oldCard: HTMLElement | undefined;
    if (old) {
      oldCard = shot(urlOf(old), old, el('span', 'tag', 'In your binder'));
      table.prepend(oldCard);
    }
    // his other shots of the same thing: tap one to look at it instead
    others.replaceChildren();
    if (group.shots.length > 1) {
      for (const other of group.shots.slice(0, 5)) {
        const thumb = el('img');
        thumb.src = other.url;
        thumb.alt = '';
        thumb.addEventListener('click', () => {
          sound('tap');
          present(other);
        });
        others.append(thumb);
      }
    }
    present(chosen);
    // the name, then what he thinks of it: the second line waits for the first to finish
    hush();
    say(`name-${group.dino}`);
    say(old ? 'choose' : chosen.stars === 3 ? 'wow' : chosen.stars === 2 ? 'great' : 'new');
    if (!old) setTimeout(() => sound('stamp'), 450);

    // --- his choice
    let keep: boolean;
    if (old) {
      buttons.replaceChildren();
      keep = await new Promise<boolean>((resolve) => {
        // the new card can be swapped for another shot, so listen on the table
        const pick = (e: Event) => {
          const target = (e.target as HTMLElement).closest('.shot');
          if (!target) return;
          table.removeEventListener('click', pick);
          resolve(target !== oldCard);
        };
        table.addEventListener('click', pick);
      });
      (keep ? oldCard! : card).classList.add('binned');
      (keep ? card : oldCard!).classList.add('kept');
    } else {
      keep = await new Promise<boolean>((resolve) => {
        buttons.replaceChildren(button('', Trash2, 'Bin', () => resolve(false)), button('btn-go', Check, 'Keep', () => resolve(true)));
      });
      card.classList.add(keep ? 'kept' : 'binned');
    }

    sound(keep ? 'keep' : 'bin');
    if (keep) {
      const { url: _url, ...photo } = chosen;
      await fillSlot(key, photo);
      binder.set(key, photo);
      changed.push(key);
    }
    dots.children[n].classList.add('done');
    buttons.replaceChildren();
    await wait(800);
  }

  root.hidden = true;
  root.replaceChildren();
  return changed;
}
