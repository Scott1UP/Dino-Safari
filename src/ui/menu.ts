// The pause and settings menu: one tap opens it. There is nothing in here a child could break.

import { ArrowLeft, Check, Focus, Gamepad2, Gauge, House, Music, Play, Sparkles, Turtle, Volume2, VolumeX } from 'lucide';
import { musicOn, muted, setMusicOn, setMuted, sound } from '../audio';
import { $, button, el, icon } from './dom';

const root = $('menu');

export type MenuChoice = 'resume' | 'home';

export interface MenuSettings {
  slowRide(): boolean;
  setSlowRide(on: boolean): void;
  autoFocus(): boolean;
  setAutoFocus(on: boolean): void;
  graphics(): Graphics;
  setGraphics(level: Graphics): void;
  fpsViewer(): boolean;
  setFpsViewer(on: boolean): void;
}

export type Graphics = 'high' | 'medium' | 'low';
const GRAPHICS: Graphics[] = ['high', 'medium', 'low'];
const GRAPHICS_NAME = { high: 'High', medium: 'Medium', low: 'Low' };

/**
 * Opens the menu and resolves with what was chosen. During a ride it is the pause menu, with a way home.
 * How the game plays (the ride's pace, the view's help) is a page of its own, behind the Gameplay button.
 */
export function openMenu(riding: boolean, settings: MenuSettings): Promise<MenuChoice> {
  return new Promise((resolve) => {
    const close = (choice: MenuChoice) => {
      sound('tap');
      root.hidden = true;
      root.replaceChildren();
      resolve(choice);
    };
    const toggle = (label: string, on: () => boolean, flip: () => void, onIcon = Volume2, offIcon = VolumeX) => {
      const b = button('btn-plain', undefined, '');
      const draw = () => {
        b.replaceChildren(icon(on() ? onIcon : offIcon), `${label} ${on() ? 'on' : 'off'}`);
        b.classList.toggle('off', !on());
      };
      b.addEventListener('click', () => {
        flip();
        draw();
        sound('tap');
      });
      draw();
      return b;
    };
    const switches = [
      toggle('Sound', () => !muted, () => setMuted(!muted)),
      toggle('Music', () => musicOn, () => setMusicOn(!musicOn), Music, Music),
      button('btn-plain', Gamepad2, 'Gameplay', () => {
        sound('tap');
        root.replaceChildren(gameplay());
      }),
    ];
    const gameplay = () =>
      el('div', 'panel menu',
        el('h2', 'heading small', 'Gameplay'),
        // slow ride: the whole ride at a gentler pace
        toggle('Slow ride', settings.slowRide, () => settings.setSlowRide(!settings.slowRide()), Turtle, Turtle),
        // auto focus: the view turns to the dinosaurs by itself
        toggle('Auto focus', settings.autoFocus, () => settings.setAutoFocus(!settings.autoFocus()), Focus, Focus),
        button('btn-go', ArrowLeft, 'Back', () => {
          sound('tap');
          root.replaceChildren(panel);
        }));
    // graphics: each press moves on to the next of high, medium and low
    const graphics = button('btn-plain', undefined, '');
    const drawGraphics = () => graphics.replaceChildren(icon(Sparkles), `Graphics: ${GRAPHICS_NAME[settings.graphics()]}`);
    graphics.addEventListener('click', () => {
      settings.setGraphics(GRAPHICS[(GRAPHICS.indexOf(settings.graphics()) + 1) % GRAPHICS.length]);
      drawGraphics();
      sound('tap');
    });
    drawGraphics();
    switches.push(graphics);
    // a small frames-per-second counter on the ride, for judging the graphics setting
    switches.push(toggle('FPS viewer', settings.fpsViewer, () => settings.setFpsViewer(!settings.fpsViewer()), Gauge, Gauge));
    const panel = riding
      ? el('div', 'panel menu',
          el('h2', 'heading small', 'Paused'),
          button('btn-go', Play, 'Keep going', () => close('resume')),
          ...switches,
          button('btn-alt', House, 'Home', () => close('home')))
      : el('div', 'panel menu',
          el('h2', 'heading small', 'Settings'),
          ...switches,
          button('btn-go', Check, 'Done', () => close('resume')));
    root.replaceChildren(panel);
    root.hidden = false;
  });
}
