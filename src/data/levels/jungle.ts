// Level 1, the Jungle Trail: a jungle route with a river, a long drop into a fern gully, a fruit grove,
// a rocky ridge and a volcano at the end.

import { far, prop, smooth, tile, type LevelDef } from '../level';

export const JUNGLE: LevelDef = {
  id: 'level-1',
  name: 'Jungle Trail',
  card: 'art/ui/card-level-1.webp',
  theme: {
    wash: 'radial-gradient(ellipse at 50% 40%, rgb(79 168 90 / 0.82), rgb(31 106 58 / 0.9) 70%, rgb(22 79 44 / 0.95))',
    sheet: 'linear-gradient(160deg, #2c3f33, #1a281f)',
    paper: 'linear-gradient(#fff7e3, #ffe9bd)',
  },
  tunnels: [],
  length: 440,
  cast: ['para', 'dilo', 'rex', 'spino', 'trike', 'raptor', 'brachio', 'anky', 'stego', 'ptera'],
  sky: far(1, 'sky'),
  far: [far(1, 'far-jungle'), far(1, 'far-hills')],
  backdrop: { sprite: far(1, 'volcano'), width: 300, beyond: 185, side: 25 },
  ground: tile(1, 'grass'),
  path: { tile: tile(1, 'dirt'), across: false },
  // volcanic ground under the finale
  overlays: [{ from: 384, to: 600, tile: tile(1, 'ash') }],
  // the river runs along the right of the track through scene 2
  channel: { from: 76, to: 152, side: 1, near: 5, far: 26, surface: -0.55, depth: 1.7, tile: tile(1, 'water'), glows: false, sound: 'river' },

  /** A gentle meander. */
  railX: (s) => 6 * Math.sin(s * 0.035) + 3 * Math.sin(s * 0.013),
  /**
   * Mostly flat, with three moments: up a hill and down a long drop into the fern gully, the climb back out,
   * and a low rocky ridge before the volcano.
   */
  railHeight: (s) => 5 * smooth(140, 172, s) - 9 * smooth(182, 218, s) + 4 * smooth(256, 286, s) + 2 * smooth(328, 348, s) - 2 * smooth(382, 402, s),

  scenes: [
    { id: 'glade', from: 30, to: 64 },
    { id: 'river', from: 90, to: 130 },
    { id: 'gully', from: 222, to: 254 },
    { id: 'grove', from: 290, to: 324 },
    { id: 'ridge', from: 350, to: 380 },
    { id: 'volcano', from: 406, to: 436 },
  ],
  cues: [
    { s: 2, say: 'welcome' },
    { s: 28, say: 'teach-look' },
    { s: 37, say: 'teach-photo', pulse: 'shutter' },
    { s: 84, say: 'river', sound: 'splash' },
    { s: 176, sound: 'rustle' },
    { s: 214, say: 'ferns', sound: 'rustle' },
    { s: 288, say: 'teach-fruit', pulse: 'fruit' },
    { s: 346, say: 'teach-drum', pulse: 'drum' },
    { s: 398, say: 'finale', sound: 'rumble' },
    { s: 420, say: 'rex' },
  ],
  spawns: [
    // 1. Entrance glade: one easy close-up
    { dino: 'trike', s: 50, side: -6.5, wander: 3.5, special: { seconds: 5, hops: 2, hopHeight: 0.25 } },
    // 2. Riverbank: one drinks, one splashes
    { dino: 'para', s: 100, side: -7.5, special: { seconds: 5 } },
    { dino: 'spino', s: 114, side: 11.5, special: { seconds: 5, hops: 2, hopHeight: 1.1, sound: 'splash' } },
    // 3. Fern gully: one leaps out of the ferns
    { dino: 'raptor', s: 236, side: -7.5, hiddenUntil: 'special', special: { seconds: 5, hops: 4, hopHeight: 1.3, to: { s: 238, side: -4.6 }, sound: 'rustle' } },
    { dino: 'dilo', s: 248, side: 6, wander: 2.5, special: { seconds: 5 } },
    // 4. Fruit grove
    { dino: 'stego', s: 300, side: -7.5, wander: 3, special: { seconds: 5 } },
    { dino: 'brachio', s: 314, side: 15, special: { seconds: 6 } },
    // 5. Rocky ridge: one flies, one only comes out for the drum
    { dino: 'ptera', s: 360, side: -8.5, lift: 1.25, special: { seconds: 7, fly: { radius: 7, height: 5 }, sound: 'flap' } },
    { dino: 'anky', s: 372, side: 10.5, hiddenUntil: 'drum', revealTo: { s: 371, side: 6.2 }, special: { seconds: 5 } },
    // 6. Volcano finale: the T. rex stomps in and roars
    { dino: 'rex', s: 426, side: 9, enterFrom: { s: 446, side: 32 }, enterAtS: 404, special: { seconds: 6, sound: 'roar' } },
  ],
  biomes: [
    { from: -30, to: 76, fill: ['flowers', 'bush', 'fern', 'grass', 'rock', 'mushrooms', 'stump', 'grass'], scatter: [
      ['tree', 4, 9, 60, 9, 14], ['ginkgo', 9, 8, 45, 7, 11], ['flowers', 5, 3.2, 16, 0.8, 1.4], ['mushrooms', 9, 3, 12, 0.4, 0.9],
      ['fern', 5, 3, 14, 1.1, 2.2], ['grass', 3, 2.8, 18, 0.6, 1.1], ['bush', 8, 4.5, 20, 1, 1.8], ['stump', 26, 4, 14, 0.8, 1.2],
    ] },
    { from: 76, to: 152, fill: ['horsetail', 'bigleaf', 'fern2', 'flatrock', 'reeds', 'grass', 'rock'], scatter: [
      ['palm', 4.5, 8, 55, 9, 13], ['tree', 9, 28, 65, 10, 15], ['bigleaf', 6, 3.2, 14, 1.2, 2.2], ['horsetail', 6, 3.4, 16, 1.5, 2.6],
      ['fern2', 6, 3, 12, 0.8, 1.4], ['flatrock', 14, 3.5, 12, 0.5, 1], ['grass', 4, 2.8, 16, 0.6, 1.1],
    ] },
    { from: 152, to: 186, fill: ['rock', 'cycad', 'grass', 'fern2', 'bush'], scatter: [
      ['conifer', 4.5, 9, 60, 13, 19], ['rock', 9, 4, 20, 0.9, 2.2], ['cycad', 8, 3.5, 16, 1.2, 2], ['grass', 3, 2.8, 16, 0.6, 1.1], ['fern2', 8, 3, 12, 0.8, 1.3],
    ] },
    { from: 186, to: 286, fill: ['fern', 'fern2', 'bigleaf', 'log', 'mushrooms', 'rock'], scatter: [
      ['treefern', 3.5, 6.5, 40, 5, 8], ['vinetree', 6, 11, 60, 11, 16], ['fern', 1.7, 2.9, 11, 1.2, 2.5], ['fern2', 4, 2.9, 10, 0.9, 1.5],
      ['bigleaf', 6, 3.4, 12, 1.3, 2.3], ['log', 30, 4, 10, 0.9, 1.3], ['mushrooms', 10, 3, 9, 0.4, 0.9],
    ] },
    { from: 286, to: 330, fill: ['bush', 'flowers', 'grass', 'fern2', 'rock'], scatter: [
      ['fruittree', 5, 9, 40, 6, 8.5], ['tree', 8, 26, 65, 10, 14], ['bush', 6, 4, 18, 1, 1.8], ['flowers', 4, 3.2, 16, 0.8, 1.4],
      ['ginkgo', 14, 10, 40, 7, 11], ['grass', 3, 2.8, 16, 0.6, 1.1],
    ] },
    { from: 330, to: 396, fill: ['rock', 'flatrock', 'cycad', 'grass', 'rock'], scatter: [
      ['rockstack', 9, 8, 40, 4, 7], ['spire', 8, 14, 60, 6, 11], ['rock', 5, 3.6, 22, 0.9, 2.4], ['flatrock', 9, 3.2, 14, 0.5, 1],
      ['conifer', 8, 16, 65, 13, 19], ['cycad', 7, 3.5, 16, 1.2, 2], ['grass', 5, 2.8, 14, 0.6, 1],
    ] },
    { from: 396, to: 500, fill: ['lavarock', 'rock', 'bones', 'flatrock', 'lavarock'], scatter: [
      ['deadtree', 5, 9, 60, 6, 10], ['lavarock', 4, 3.6, 30, 1, 2.6], ['spire', 9, 16, 60, 6, 11],
      ['bones', 30, 5, 16, 1.5, 2.4], ['rock', 9, 4, 22, 0.9, 2],
    ] },
  ],
  landmarks: [
    ['gate', 7, 0, 7.5, false, true],
    ['signpost', 19, 3.3, 1.9],
    ['fence', 26, -3.6, 1.2],
    ['fence', 60, 3.6, 1.2, true],
    ['log', 66, -5, 1.2],
    ['reeds', 92, 4.6, 1.9], ['reeds', 101, 5, 2.1, true], ['reeds', 118, 4.7, 1.8], ['reeds', 127, 5.1, 2.2, true], ['reeds', 138, 4.8, 1.9],
    ['reeds', 108, 24.5, 2.2], ['reeds', 122, 25, 2], ['reeds', 96, 24, 2.1, true],
    ['signpost', 178, -3.2, 1.9, true],
    ['nest', 306, -4.2, 0.8],
    ['fruittree', 296, 8, 7.5], ['fruittree', 320, -10, 7],
    ['flatrock', 360, -8.5, 1.3],
    ['rock', 370.5, 8.3, 3.2],
    ['rockstack', 352, 7, 6],
    ['skull', 410, -5, 1.7],
    ['bones', 418, -9.5, 2.4],
    // smoking cones: always big, and always well back from the track
    ['vent', 150, -100, 40], ['vent', 250, 98, 46, true], ['vent', 345, -92, 36], ['vent', 412, -66, 30, true], ['vent', 452, 74, 44],
  ],
  life: {
    birds: true,
    dragonflies: [
      { from: 84, to: 144, near: 5, far: 19, side: 1, count: 8 },
      { from: 222, to: 256, near: 3, far: 8, side: 0, count: 5 },
    ],
    butterflies: [
      { from: 18, to: 72, near: 2.6, far: 9.6, side: 0, count: 8 },
      { from: 288, to: 326, near: 2.6, far: 9.6, side: 0, count: 8 },
    ],
    embers: [],
    herds: [[120, -92], [300, 96], [400, -100]],
    cloud: prop('cloud'),
  },
  ambience: 'jungle',
  cart: false,
};
