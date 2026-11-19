// Small helpers shared by the screens.

import { createElement, Play, Star, type IconNode } from 'lucide';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Builds an element: `el('div', 'class names', child, child...)`. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

/** A Lucide icon. */
export function icon(node: IconNode): SVGElement {
  const svg = createElement(node, { 'aria-hidden': 'true' });
  if (node === Play) svg.classList.add('solid'); // the play triangle is filled in
  return svg;
}

/** A chunky button in the house style: `kind` is 'btn-go', 'btn-alt', 'btn-plain' or '' for cream. */
export function button(kind: string, node: IconNode | undefined, label: string, press?: () => void): HTMLButtonElement {
  const b = el('button', `btn ${kind}`);
  b.type = 'button';
  if (node) b.append(icon(node));
  if (label) b.append(label);
  if (press) b.addEventListener('click', press);
  return b;
}

/** Three stars, the first `lit` of them gold, popping in one after another. */
export function stars(lit: number): HTMLDivElement {
  const row = el('div', 'stars');
  for (let i = 0; i < 3; i++) {
    const star = icon(Star);
    if (i < lit) {
      star.classList.add('lit');
      star.style.animationDelay = `${250 + i * 260}ms`;
    }
    row.append(star);
  }
  return row;
}

/**
 * A photo as a print: a white border round the picture, at the picture's own shape. The border is drawn round
 * the picture, never into it, and the print shrinks to fit whatever space it is given without being cropped.
 */
export function print(url: string, width: number, height: number): HTMLDivElement {
  const img = el('img');
  img.src = url;
  img.alt = '';
  img.draggable = false;
  const card = el('div', 'print', img);
  card.style.setProperty('--ar', String(width / height));
  return card;
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
