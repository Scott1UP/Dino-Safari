// Scoring uses only the measurements saved with a photo, so it is based on what is really in the frame.

import type { PhotoSubject } from './capture';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function score(subject: PhotoSubject | undefined, others: PhotoSubject[]): { points: number; stars: 0 | 1 | 2 | 3 } {
  if (!subject) return { points: 0, stars: 0 };
  // bigger is better, up to about a fourteenth of the frame
  const size = clamp01(subject.frameShare / 0.07);
  const centring = 1 - subject.centreOffset;
  // how much of the animal he got: either most of the whole dinosaur, or a close-up that fills the frame
  const body = Math.max(clamp01((subject.visibleShare - 0.3) / 0.6), clamp01(subject.frameShare / 0.25));
  const company = Math.min(2, others.filter((o) => o.frameShare > 0.01 && o.visibleShare > 0.5).length);
  const points = Math.round(35 * size + 25 * centring + 40 * body + (subject.pose === 'standing' ? 0 : 15) + 5 * company);
  // any photo of a dinosaur earns a star; a dinosaur that is half out of the picture can never earn three
  let stars: 1 | 2 | 3 = points >= 78 ? 3 : points >= 52 ? 2 : 1;
  if (body < 0.8 && stars > 2) stars = 2;
  if (body < 0.45) stars = 1;
  return { points, stars };
}
