// Choosing a level: a card for each, showing a picture of the level, its name and how full its binder is.

import { Camera, X } from 'lucide';
import { sound } from '../audio';
import type { LevelDef } from '../data/level';
import { $, button, el, icon } from './dom';

const root = $('menu');

/**
 * Shows the levels under a heading and resolves with the one chosen, or nothing if the panel is closed.
 * `found` says how many of a level's photos are in its binder.
 */
export function pickLevel(heading: string, levels: LevelDef[], found: (level: LevelDef) => number): Promise<LevelDef | undefined> {
  return new Promise((resolve) => {
    const done = (choice?: LevelDef) => {
      sound('tap');
      root.hidden = true;
      root.replaceChildren();
      resolve(choice);
    };
    const cards = levels.map((level) => {
      const card = el('button', 'level-card',
        el('span', 'level-name', level.name),
        el('span', 'level-count', icon(Camera), `${found(level)} / ${level.cast.length * 4}`),
      );
      card.type = 'button';
      card.style.backgroundImage = `url('${level.card}')`;
      card.addEventListener('click', () => done(level));
      return card;
    });
    const close = button('btn-square level-close', X, '', () => done());
    close.setAttribute('aria-label', 'Close');
    root.replaceChildren(el('div', 'panel levels', close, el('h2', 'heading small', heading), el('div', 'level-row', ...cards)));
    root.hidden = false;
  });
}
