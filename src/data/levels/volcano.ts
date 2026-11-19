// Level 2, the Volcano Mine: a mine cart ride in and out of the mountain. In through the mine's mouth to a wide
// entrance cavern; out into the open beside a river of lava; down a big drop back underground, through a narrow
// shaft into a dark cavern of crystals; then out past hot springs and up to the rim of the crater.

import { far, prop, smooth, tile, type LevelDef } from '../level';

export const VOLCANO: LevelDef = {
  id: 'level-2',
  name: 'Volcano Mine',
  card: 'art/ui/card-level-2.webp',
  theme: {
    wash: 'radial-gradient(ellipse at 50% 40%, rgb(196 92 52 / 0.8), rgb(110 40 60 / 0.9) 65%, rgb(48 20 44 / 0.95))',
    sheet: 'linear-gradient(160deg, #47283a, #251424)',
    paper: 'linear-gradient(#fff1dc, #ffd9b0)',
  },
  // Two stretches underground. Each is [s, half its width, its height] at points along it.
  tunnels: [
    // through the mine's mouth into a wide entrance cavern, and out through a narrow tunnel
    // (the mouths are wider than the timber gate, so the gate stands clear of the rock)
    { dark: 0.35, shape: [[20, 5.8, 8], [36, 20, 13], [60, 20, 13], [76, 5.8, 8]] },
    // the big drop down a narrow shaft, opening into the crystal cavern: wide, high and dark
    { dark: 1, shape: [[150, 5.8, 8], [162, 8, 8.5], [192, 9, 9.5], [208, 27, 17], [266, 27, 17], [284, 6.5, 8], [290, 5.8, 8]] },
  ],
  length: 450,
  cast: ['pachy', 'troodon', 'dimorph', 'styraco', 'kentro', 'giga', 'carno', 'theri', 'quetzal', 'utah'],
  sky: far(2, 'sky'),
  far: [far(2, 'far-crags'), far(2, 'far-cones')],
  // the same volcano as the end of the Jungle Trail, now close and enormous
  backdrop: { sprite: far(1, 'volcano'), width: 480, beyond: 170, side: 0 },
  ground: tile(1, 'ash'),
  // the mine cart's rails
  path: { tile: tile(2, 'rails'), across: true },
  // bare stone on the floors of the two caverns
  overlays: [{ from: 22, to: 74, tile: tile(2, 'stone') }, { from: 192, to: 288, tile: tile(2, 'stone') }],
  // a river of lava along the left of the track through scene 2
  channel: { from: 92, to: 134, side: -1, near: 5, far: 24, surface: -0.6, depth: 1.8, tile: tile(2, 'lava'), glows: true, sound: 'lava' },

  railX: (s) => 5 * Math.sin(s * 0.03 + 1) + 4 * Math.sin(s * 0.011) - 4.2,
  /**
   * A rise, then the big drop into the canyon; a climb to the hot springs; a long haul up to the crater rim;
   * and a last dip into the crater.
   */
  railHeight: (s) => 3 * smooth(118, 146, s) - 14 * smooth(152, 192, s) + 6 * smooth(272, 300, s) + 9 * smooth(338, 384, s) - 2 * smooth(392, 410, s),

  scenes: [
    { id: 'entrance', from: 30, to: 64 },
    { id: 'lava', from: 92, to: 130 },
    { id: 'cavern', from: 216, to: 264 },
    { id: 'springs', from: 302, to: 334 },
    { id: 'rim', from: 352, to: 382 },
    { id: 'crater', from: 410, to: 442 },
  ],
  cues: [
    { s: 2, say: 'l2-welcome' },
    { s: 34, say: 'l2-first' },
    { s: 84, say: 'l2-lava' },
    { s: 150, say: 'l2-drop' },
    { s: 208, say: 'l2-crystals', sound: 'chime', pulse: 'drum' },
    { s: 298, say: 'l2-springs', sound: 'geyser', pulse: 'fruit' },
    { s: 346, say: 'l2-rim' },
    { s: 402, say: 'l2-finale', sound: 'rumble' },
  ],
  spawns: [
    // 1. Mine entrance: one easy close-up, butting rocks
    { dino: 'pachy', s: 50, side: 6.5, wander: 3, special: { seconds: 5, hops: 3, hopHeight: 0.3 } },
    // 2. Lava fields
    { dino: 'kentro', s: 100, side: 6.5, wander: 2.5, special: { seconds: 5 } },
    { dino: 'carno', s: 118, side: 10.5, special: { seconds: 5.5, sound: 'roar' } },
    // 3. Crystal cavern: one leaps out, one hides until the drum, one flies
    { dino: 'utah', s: 226, side: 8, hiddenUntil: 'special', special: { seconds: 5, hops: 4, hopHeight: 1.5, to: { s: 228, side: 4.8 }, sound: 'rustle' } },
    { dino: 'troodon', s: 244, side: -9.5, hiddenUntil: 'drum', revealTo: { s: 243, side: -5.6 }, special: { seconds: 5, sound: 'chime' } },
    { dino: 'dimorph', s: 256, side: 7, lift: 2, special: { seconds: 7, fly: { radius: 5, height: 4 }, sound: 'flap' } },
    // 4. Hot springs
    { dino: 'theri', s: 312, side: -8.5, special: { seconds: 6 } },
    { dino: 'styraco', s: 322, side: 7.5, wander: 3, special: { seconds: 5, hops: 2, hopHeight: 0.3 } },
    // 5. Crater rim: the giant flyer
    { dino: 'quetzal', s: 366, side: -11, special: { seconds: 8, fly: { radius: 12, height: 9 }, sound: 'flap' } },
    // 6. The crater: the Gigantosaurus stomps in and roars
    { dino: 'giga', s: 428, side: 9.5, enterFrom: { s: 448, side: 34 }, enterAtS: 408, special: { seconds: 6, sound: 'roar' } },
  ],
  biomes: [
    // the approach, outside
    { from: -30, to: 20, fill: ['ashshrub', 'emberbush', 'rock', 'lavarock', 'bones'], scatter: [
      ['deadtree', 5, 9, 60, 6, 10], ['spire', 9, 14, 60, 6, 11], ['lavarock', 5, 3.6, 26, 1, 2.4], ['ashshrub', 3, 2.8, 16, 0.7, 1.3],
      ['emberbush', 5, 3.4, 18, 1, 1.9],
    ] },
    // the entrance cavern
    { from: 20, to: 76, fill: ['rock', 'glowshroom', 'stalagmite', 'crystal-small'], scatter: [
      ['stalagmite', 3, 4, 19, 2.2, 5.5], ['rock', 4, 3.4, 18, 0.9, 2.4], ['glowshroom', 4, 2.9, 12, 0.5, 1], ['crystal-small', 6, 3, 14, 0.7, 1.4],
      ['lavarock', 7, 3.6, 16, 1, 2.2],
    ] },
    // the lava fields, in the open
    { from: 76, to: 150, fill: ['obsidian', 'lavarock', 'firefern', 'ashshrub'], scatter: [
      ['basalt', 5, 8, 55, 7, 13], ['lavarock', 3.5, 3.4, 28, 1, 2.8], ['obsidian', 6, 3.4, 18, 1, 2.2], ['firefern', 4, 2.9, 14, 0.9, 1.7],
      ['deadtree', 9, 12, 60, 6, 10],
    ] },
    // the shaft down
    { from: 150, to: 196, fill: ['rock', 'crystal-small'], scatter: [
      ['stalagmite', 4, 3.4, 8, 1.6, 3.5], ['rock', 5, 3.2, 8, 0.8, 1.8], ['crystal-small', 5, 3, 8, 0.7, 1.3], ['glowshroom', 6, 2.9, 7, 0.5, 0.9],
    ] },
    // the crystal cavern
    { from: 196, to: 290, fill: ['crystal-small', 'glowshroom', 'stalagmite', 'rock'], scatter: [
      ['stalagmite', 3.5, 4, 24, 2.5, 6], ['crystal-blue', 5, 4.5, 24, 2, 5], ['crystal-pink', 6, 4.5, 24, 1.8, 4.5],
      ['crystal-small', 2.5, 2.9, 16, 0.7, 1.5], ['glowshroom', 3.5, 2.9, 14, 0.5, 1],
    ] },
    // the hot springs, in the open
    { from: 290, to: 338, fill: ['firefern', 'emberbush', 'flatrock', 'rock'], scatter: [
      ['basalt', 8, 14, 55, 7, 12], ['geyser', 10, 9, 40, 5, 9], ['emberbush', 4, 3.4, 18, 1, 2], ['firefern', 3, 2.9, 14, 0.9, 1.8],
      ['flatrock', 7, 3.4, 14, 0.5, 1],
    ] },
    { from: 338, to: 396, fill: ['lavarock', 'obsidian', 'rock', 'ashshrub'], scatter: [
      ['spire', 5, 10, 60, 7, 13], ['rockstack', 9, 8, 40, 4, 7], ['lavarock', 5, 3.6, 24, 1, 2.6], ['obsidian', 7, 3.4, 16, 1, 2.2],
      ['ashshrub', 5, 2.9, 14, 0.7, 1.3],
    ] },
    { from: 396, to: 510, fill: ['lavarock', 'bones', 'skull', 'obsidian'], scatter: [
      ['lavafall', 9, 14, 60, 12, 20], ['lavarock', 4, 3.6, 30, 1, 2.8], ['deadtree', 7, 9, 50, 6, 10], ['bones', 26, 5, 16, 1.5, 2.4],
      ['obsidian', 6, 3.4, 18, 1, 2.4],
    ] },
  ],
  landmarks: [
    // the timber frame round the mine's mouth
    ['minegate', 18.6, 0, 7.5, false, true],
    ['lantern', 12, 3.2, 2.6],
    ['barrels', 30, -4.6, 1.6],
    ['minecart', 40, -5, 1.6],
    ['lantern', 34, 4, 2.6], ['lantern', 58, -4.2, 2.6, true], ['lantern', 72, 3.4, 2.6],
    // lava pours down the cliffs on the far bank of the lava river
    ['lavafall', 106, -34, 18], ['lavafall', 122, -38, 22, true],
    ['lantern', 146, 3.2, 2.6],
    ['lantern', 170, -3.4, 2.6, true], ['lantern', 190, 3.4, 2.6],
    ['crystal-pink', 232, -6, 3.8],
    // the Troodon hides behind this one
    ['crystal-blue', 244.5, -7.6, 3.4],
    // the Dimorphodon's perch
    ['flatrock', 256, 7, 2.2],
    ['minecart', 268, 4.2, 1.6, true],
    ['lantern', 282, -3.4, 2.6, true],
    ['geyser', 306, 9, 7], ['geyser', 318, -14, 8, true],
    ['lantern', 340, -3.2, 2.6],
    ['skull', 414, -5, 1.8],
    ['bones', 420, -9.5, 2.4],
    ['buffer', 455, 0, 1.9, false, true],
    // smoking cones: always big, and always well back from the track
    ['vent', 112, 100, 44], ['vent', 330, 98, 38], ['vent', 440, -80, 46, true],
  ],
  life: {
    birds: false,
    dragonflies: [],
    butterflies: [],
    embers: [
      { from: 10, to: 70, near: 3, far: 14, side: 0, count: 6 },
      { from: 96, to: 130, near: 5, far: 22, side: -1, count: 16 },
      { from: 396, to: 450, near: 3, far: 20, side: 0, count: 14 },
    ],
    herds: [],
    cloud: prop('ashcloud'),
  },
  ambience: 'cart',
  cart: true,
};
