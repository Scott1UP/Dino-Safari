// What a level is, and the level being played. A level is a route (its line, its ups and downs), the land
// around it, six scenes, a cast of ten dinosaurs with their own binder, and the scenery and life that fill it.
//
// `s` is the distance travelled along the route in metres (the ride heads towards negative z, so z = -s), and
// `side` is metres to the side of the track (negative is left).

import type { DinoId } from './dinos';

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Things that happen once as the ride passes a point: the guide speaks, a sound plays, a button pulses. */
export interface Cue {
  s: number;
  say?: string;
  sound?: string;
  pulse?: 'shutter' | 'fruit' | 'drum';
}

export interface Special {
  /** How long the special pose is held, in seconds. */
  seconds: number;
  /** Big hops during it: how many and how high. */
  hops?: number;
  hopHeight?: number;
  /** It ends up here instead of where it started. */
  to?: { s: number; side: number };
  /** A loop through the air of this radius and height, back to where it started. */
  fly?: { radius: number; height: number };
  sound?: string;
}

export interface Spawn {
  dino: DinoId;
  s: number;
  side: number;
  /** Metres above the ground, for a perch. */
  lift?: number;
  /** Hop-walks this many metres away from the track and back while idle. */
  wander?: number;
  /** Not there until the ride reaches `enterAtS`, then hops in from here. */
  enterFrom?: { s: number; side: number };
  enterAtS?: number;
  /** The special pose: it starts once the dinosaur has been in view for a moment, so he is always there to see it. */
  special: Special;
  /** Stays out of sight until then. */
  hiddenUntil?: 'special' | 'drum';
  /** Where it comes out to. */
  revealTo?: { s: number; side: number };
}

export interface PropPlacement {
  sprite: string;
  position: [number, number, number];
  height: number;
  mirror: boolean;
  /** Stands square to the track instead of turning to face the camera. */
  fixed?: boolean;
  /** Hangs down from the roof of a tunnel instead of standing on the ground. */
  hang?: boolean;
  /** How far it sways in the breeze, in radians: plants do, rocks and wood do not. */
  sway: number;
  /**
   * How much detail it is: 0 is always there; 1 goes on low graphics (every other scattered plant, and the
   * things out in the haze); 2 is the middle-ground filler, which is only there on high.
   */
  detail: 0 | 1 | 2;
}

/** One kind of plant or rock in a stretch of the route: [prop, one every this many metres, nearest side, farthest side, shortest, tallest]. */
export type Scatter = [string, number, number, number, number, number];
export interface Biome {
  from: number;
  to: number;
  /** Small things for the open middle ground. */
  fill: string[];
  /** The first kind listed also carries on into the haze beyond the scattered scenery. */
  scatter: Scatter[];
}
/** A landmark placed by hand: [prop, s, side, height, mirror?, stands square to the track?]. */
export type Landmark = [string, number, number, number, boolean?, boolean?];

/** A river, of water or of lava, lying in a bed beside the track. */
export interface Channel {
  from: number;
  to: number;
  /** Which side of the track it is on, and how far from it its banks are. */
  side: 1 | -1;
  near: number;
  far: number;
  /** Height of its surface, and how deep its bed is cut. */
  surface: number;
  depth: number;
  tile: string;
  /** Lava is not shaded: it glows. */
  glows: boolean;
  /** The looping sound heard beside it. */
  sound: string;
}

/** A stretch of the route, and a band to one or both sides of it, where small things fly about. */
export interface Zone {
  from: number;
  to: number;
  near: number;
  far: number;
  /** -1 left, 1 right, 0 both. */
  side: -1 | 0 | 1;
  count: number;
}

/**
 * A roofed stretch of the route: a tunnel or a cavern. Its shape is given at points along it, each
 * [s, half its width, its height], and it swells and narrows smoothly between them.
 */
export interface Tunnel {
  shape: [number, number, number][];
  /** How dark it is inside: 0 is dim, 1 is very dark. */
  dark: number;
}

/** A level's colours, for its binder. */
export interface Theme {
  /** Behind the binder: the level's picture is washed with this. */
  wash: string;
  /** The photo pages and the stats page, as CSS backgrounds. */
  sheet: string;
  paper: string;
}

export interface LevelDef {
  id: string;
  name: string;
  /** A picture of the level, for the cards where a level is chosen and for its binder. */
  card: string;
  theme: Theme;
  tunnels: Tunnel[];
  length: number;
  /** Its ten dinosaurs: the pages of its binder. */
  cast: DinoId[];
  sky: string;
  /** Hazy ridges that stand either side of the route, in turn. */
  far: string[];
  /** The great landmark at the end of the route. */
  backdrop: { sprite: string; width: number; beyond: number; side: number };
  ground: string;
  /** What the ride runs along: a sandy path, or rails. `across` fits one tile across its width. */
  path: { tile: string; across: boolean };
  /** Other ground laid over stretches of the route, fading in and out. */
  overlays: { from: number; to: number; tile: string }[];
  channel?: Channel;
  /** Where the track sits from side to side, and its height. */
  railX(s: number): number;
  railHeight(s: number): number;
  /** The camera crawls through each scene and hurries between them. */
  scenes: { id: string; from: number; to: number }[];
  cues: Cue[];
  spawns: Spawn[];
  biomes: Biome[];
  landmarks: Landmark[];
  life: {
    birds: boolean;
    dragonflies: Zone[];
    butterflies: Zone[];
    /** Rising sparks. */
    embers: Zone[];
    /** A far-off herd at each of these [s, side] places. */
    herds: [number, number][];
    cloud: string;
  };
  /** The background sound of the place, and whether the ride rattles along on rails. */
  ambience: string;
  cart: boolean;
}

/** Height of the camera above the ground. */
const EYE = 1.7;

/** The level being played. */
export let level: LevelDef;
export function useLevel(def: LevelDef) {
  level = def;
}

// ---- art ----------------------------------------------------------------------------------------
/** Scenery drawn for level 2; everything else is in level 1's kit, which every level may use. */
const LEVEL_2_PROPS = new Set([
  'crystal-blue', 'crystal-pink', 'crystal-small', 'stalagmite', 'basalt', 'lavafall', 'geyser', 'emberbush', 'firefern',
  'ashshrub', 'glowshroom', 'obsidian', 'minecart', 'minegate', 'lantern', 'barrels', 'buffer', 'ember', 'ashcloud',
]);
export const prop = (id: string) => `art/levels/level-${LEVEL_2_PROPS.has(id) ? 2 : 1}/props/${id}.webp`;
export const far = (levelNumber: number, id: string) => `art/levels/level-${levelNumber}/far/${id}.webp`;
export const tile = (levelNumber: number, id: string) => `art/levels/level-${levelNumber}/ground/${id}.webp`;

const STILL = [
  'rock', 'rockstack', 'flatrock', 'spire', 'lavarock', 'vent', 'log', 'stump', 'bones', 'skull', 'nest', 'gate', 'signpost', 'fence',
  'crystal-blue', 'crystal-pink', 'crystal-small', 'stalagmite', 'basalt', 'lavafall', 'geyser', 'obsidian', 'minecart',
  'minegate', 'lantern', 'barrels', 'buffer',
];
const TREES = ['tree', 'palm', 'conifer', 'treefern', 'vinetree', 'fruittree', 'ginkgo', 'deadtree'];
const swayOf = (id: string) => (STILL.includes(id) ? 0 : TREES.includes(id) ? 0.012 : 0.045);

/** Small things for the open ground between the scenery by the track and the big things further back: [shortest, tallest]. */
const SMALL: Record<string, [number, number]> = {
  grass: [0.8, 1.3], flowers: [0.9, 1.6], bush: [1.2, 2.1], fern: [1.3, 2.5], fern2: [0.9, 1.6], rock: [1, 2.6], flatrock: [0.6, 1.1],
  mushrooms: [0.5, 1], horsetail: [1.6, 2.8], bigleaf: [1.4, 2.4], reeds: [1.5, 2.3], cycad: [1.4, 2.2], stump: [0.9, 1.3], log: [1, 1.4],
  lavarock: [1.1, 2.6], bones: [1.6, 2.5], emberbush: [1.1, 2], firefern: [1, 1.9], ashshrub: [0.8, 1.5], glowshroom: [0.5, 1],
  obsidian: [1, 2.4], 'crystal-small': [0.8, 1.6], stalagmite: [2, 3.6], skull: [1.2, 1.8],
};

// ---- the land -----------------------------------------------------------------------------------
export const railX = (s: number) => level.railX(s);
export const railHeight = (s: number) => level.railHeight(s);

/** How far `side` is into the channel's side of the track: positive towards the channel. */
const towards = (ch: Channel, side: number) => side * ch.side;
const channelBed = (s: number, side: number) => {
  const ch = level.channel;
  if (!ch) return 0;
  const t = towards(ch, side);
  return ch.depth * smooth(ch.near - 0.5, ch.near + 3, t) * (1 - smooth(ch.far - 4, ch.far + 1, t)) *
    smooth(ch.from, ch.from + 8, s) * (1 - smooth(ch.to - 8, ch.to, s));
};
/** Whether a spot is in the river or the lava. */
function inChannel(s: number, side: number, margin = 0): boolean {
  const ch = level.channel;
  if (!ch) return false;
  const t = towards(ch, side);
  return s > ch.from - margin && s < ch.to + margin && t > ch.near - 0.6 - margin * 0.2 && t < ch.far + 1 + margin * 0.5;
}

/**
 * The tunnel over a point of the route, if there is one: half its width and its height there, how far inside it
 * the point is (0 at a mouth, 1 once well in), and how dark it is.
 */
export function tunnelAt(s: number): { halfWidth: number; height: number; inside: number; dark: number } | undefined {
  for (const t of level.tunnels) {
    const from = t.shape[0][0], to = t.shape[t.shape.length - 1][0];
    if (s < from || s > to) continue;
    let i = 0;
    while (i < t.shape.length - 2 && s > t.shape[i + 1][0]) i++;
    const [s0, w0, h0] = t.shape[i], [s1, w1, h1] = t.shape[i + 1];
    const k = smooth(s0, s1, s);
    return { halfWidth: w0 + (w1 - w0) * k, height: h0 + (h1 - h0) * k, inside: smooth(from, from + 8, s) * (1 - smooth(to - 8, to, s)), dark: t.dark };
  }
  return undefined;
}

/** How high the roof is above the track's level, `side` metres from the middle of a tunnel. */
export const roofHeight = (t: { halfWidth: number; height: number }, side: number) =>
  t.height * Math.sqrt(Math.max(0, 1 - (side / t.halfWidth) ** 2));

/** How high the mountain over a tunnel stands above the land, and how far the cutting to each mouth runs. */
const MOUNTAIN = 28;
const CUTTING = 16;

/**
 * The mountain over the tunnels: how far its surface is above the ordinary land at a spot. Over a tunnel it is
 * a hill, lower at the mouths and full height further in. Before and after a tunnel it falls away, and a
 * cutting through it leads the track to the mouth.
 */
export function mountainHeight(s: number, side: number): number {
  let most = 0;
  const lumps = 1 + 0.14 * Math.sin(side * 0.09 + s * 0.05) * Math.sin(s * 0.11 + side * 0.03);
  for (const t of level.tunnels) {
    const from = t.shape[0][0], to = t.shape[t.shape.length - 1][0];
    if (s >= from && s <= to) {
      most = Math.max(most, MOUNTAIN * (0.45 + 0.55 * smooth(from, from + 30, s) * (1 - smooth(to - 30, to, s))));
    } else {
      const along = s < from ? smooth(from - CUTTING, from, s) : 1 - smooth(to, to + CUTTING, s);
      most = Math.max(most, MOUNTAIN * 0.45 * along * smooth(9, 24, Math.abs(side)));
    }
  }
  return most * lumps;
}

/** Whether something of this height fits under the roof at a spot; in the open, everything fits. */
function fits(s: number, side: number, height: number): boolean {
  const t = tunnelAt(s);
  return !t || (Math.abs(side) < t.halfWidth - 1.2 && height < roofHeight(t, side) - 0.6);
}

/** Height of the ground anywhere. Smooth under the track, lumpy away from it, rising at the far sides. */
export function groundHeight(x: number, z: number): number {
  const s = -z;
  const side = x - railX(s);
  const d = Math.abs(side);
  return (
    railHeight(s) +
    0.7 * Math.sin(x * 0.13 + z * 0.07) * Math.sin(z * 0.09) * smooth(4, 14, d) +
    3 * smooth(25, 75, d) -
    channelBed(s, side)
  );
}

/** Height of whatever a thrown fruit would land on: the ground, or the river. */
export function surfaceHeight(x: number, z: number): number {
  const s = -z, side = x - railX(s);
  const ground = groundHeight(x, z);
  return level.channel && inChannel(s, side) ? Math.max(ground, level.channel.surface) : ground;
}

/** A spot on the ground, from track distance and side offset. */
export function spot(s: number, side: number): [number, number, number] {
  const x = railX(s) + side;
  return [x, groundHeight(x, -s), -s];
}

/** Where scenery stands at a spot: on the ground, or on the mountainside where a cutting runs up to a tunnel. */
function standing(s: number, side: number): [number, number, number] {
  const [x, y, z] = spot(s, side);
  return [x, y + (tunnelAt(s) ? 0 : mountainHeight(s, side)), z];
}

export const railPoints = (): [number, number, number][] =>
  Array.from({ length: level.length / 10 + 1 }, (_, i) => [railX(i * 10), railHeight(i * 10) + EYE, -i * 10]);

/** Where steam rises: the top of each smoking cone placed by hand. */
export const steamVents = () => level.landmarks.filter(([id]) => id === 'vent').map(([, s, side, height]) => {
  const [x, y, z] = spot(s, side);
  return { at: [x, y + height * 0.6, z] as [number, number, number], height };
});

/** All of the level's scenery. The same seed gives the same place every ride. */
export function props(): PropPlacement[] {
  let seed = 20261119;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // patches to keep clear: around each dinosaur, where it walks, and round the landmarks
  const clear: { s: number; side: number; r: number }[] = [];
  for (const d of level.spawns) {
    clear.push({ s: d.s, side: d.side, r: 6 });
    if (d.wander) clear.push({ s: d.s, side: d.side + Math.sign(d.side) * d.wander, r: 5 });
    for (const p of [d.revealTo, d.special.to, d.enterFrom]) if (p) clear.push({ ...p, r: 5 });
    if (d.enterFrom) for (let t = 0.2; t < 1; t += 0.2) clear.push({ s: d.s + (d.enterFrom.s - d.s) * t, side: d.side + (d.enterFrom.side - d.side) * t, r: 5 });
  }
  const out: PropPlacement[] = [];
  for (const [id, s, side, height, mirror, fixed] of level.landmarks) {
    out.push({ sprite: prop(id), position: spot(s, side), height, mirror: !!mirror, fixed, sway: swayOf(id), detail: 0 });
    clear.push({ s, side, r: Math.max(1.5, height * 0.45) });
  }
  let thin = 0;
  // nothing stands in the river, or in a kept-clear patch
  const blocked = (at: number, side: number) => clear.some((c) => Math.hypot(c.s - at, c.side - side) < c.r) || inChannel(at, side, 2);
  for (const biome of level.biomes) {
    for (const [id, every, near, farthest, low, high] of biome.scatter) {
      for (let s = biome.from; s < biome.to; s += every) {
        const at = s + rnd() * every;
        const side = (rnd() < 0.5 ? -1 : 1) * (near + rnd() * rnd() * (farthest - near));
        const height = low + rnd() * (high - low);
        const mirror = rnd() < 0.5;
        if (blocked(at, side) || !fits(at, side, height)) continue;
        out.push({ sprite: prop(id), position: standing(at, side), height, mirror, sway: swayOf(id), detail: thin++ % 2 ? 1 : 0 });
      }
    }
    // The middle ground, between the scenery by the track and the big things further back: small plants and
    // rocks in loose clumps, so that there are no bare stretches.
    for (let s = biome.from; s < biome.to; s += 3) {
      const clumpAt = s + rnd() * 3;
      const clumpSide = (rnd() < 0.5 ? -1 : 1) * (10 + rnd() * 52);
      for (let i = 0, n = 2 + Math.floor(rnd() * 2); i < n; i++) {
        const id = biome.fill[Math.floor(rnd() * biome.fill.length)];
        const at = clumpAt + (rnd() - 0.5) * 5, side = clumpSide + (rnd() - 0.5) * 5;
        const [low, high] = SMALL[id];
        if (blocked(at, side) || !fits(at, side, high)) continue;
        out.push({ sprite: prop(id), position: standing(at, side), height: low + rnd() * (high - low), mirror: rnd() < 0.5, sway: swayOf(id), detail: 2 });
      }
    }
    // beyond the scattered scenery, each stretch's own tall thing carries on into the haze
    const [haze] = biome.scatter[0];
    for (let s = biome.from; s < biome.to; s += 2.4) {
      const side = (rnd() < 0.5 ? -1 : 1) * (60 + rnd() * 60);
      if (inChannel(s, side, 2) || tunnelAt(s)) continue; // (nothing shows through a tunnel's walls)
      out.push({ sprite: prop(haze), position: standing(s, side), height: 10 + rnd() * 8, mirror: rnd() < 0.5, sway: swayOf(haze), detail: 1 });
    }
  }
  // stalactites hang from the roof of every tunnel and cavern
  for (const t of level.tunnels) {
    for (let s = t.shape[0][0] + 4; s < t.shape[t.shape.length - 1][0] - 4; s += 3.5) {
      const here = tunnelAt(s)!;
      const side = (rnd() - 0.5) * 2 * (here.halfWidth - 2);
      const roof = roofHeight(here, side);
      const height = Math.min(roof * 0.4, 1.4 + rnd() * 3.2);
      out.push({ sprite: prop('stalagmite'), position: [railX(s) + side, railHeight(s) + roof + 0.3, -s], height, mirror: rnd() < 0.5, sway: 0, detail: thin++ % 2 ? 1 : 0, hang: true });
    }
  }
  return out;
}
