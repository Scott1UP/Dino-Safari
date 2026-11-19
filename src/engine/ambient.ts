// Life in the background, so the land beyond the track is never still. Each level says what it has: birds
// wheeling overhead, dragonflies, butterflies, sparks rising from lava, a far-off herd on the move, drifting
// clouds and puffs of steam. None of it can be collected; it is only there to be alive.

import * as THREE from 'three';
import { far, level, prop, railX, steamVents, surfaceHeight, type Zone } from '../data/level';
import { Cutout, loadArt, type Art } from './cutouts';

/** Things further from the camera than this are not worth moving. */
const REACH = 240;

interface Mover {
  cutout: Cutout;
  /** Sets the mover's place for this moment. */
  move(c: Cutout, t: number): void;
  home: THREE.Vector3;
  /** Small, close-up life (birds, dragonflies, butterflies) is left out on low graphics. */
  small: boolean;
}

/** A copy of a picture's material that the haze does not touch, for things in the far distance. */
function unhazed(art: Art): Art {
  const face = art.face.clone();
  face.fog = false;
  return { ...art, face };
}

export class Ambient {
  private readonly movers: Mover[] = [];

  private constructor(private readonly scene: THREE.Scene) {}

  private add(art: Art, size: number, home: THREE.Vector3, move: Mover['move'], shadow = true, small = shadow) {
    const cutout = new Cutout(art, size);
    cutout.card.castShadow = shadow;
    cutout.group.position.copy(home);
    this.scene.add(cutout.group);
    this.movers.push({ cutout, move, home, small });
  }

  static async create(scene: THREE.Scene): Promise<Ambient> {
    const life = level.life;
    const [bird, dragonfly, butterfly, cloud, smoke, herd, ember] = await Promise.all([
      loadArt(prop('bird')), loadArt(prop('dragonfly')), loadArt(prop('butterfly')), loadArt(life.cloud), loadArt(prop('smoke')),
      // (only fetched by a level that has embers)
      loadArt(far(1, 'far-herd')), life.embers.length ? loadArt(prop('ember')) : loadArt(prop('smoke')),
    ]);
    const ambient = new Ambient(scene);
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const at = (s: number, side: number, up: number) => {
      const x = railX(s) + side;
      return new THREE.Vector3(x, surfaceHeight(x, -s) + up, -s);
    };
    /** A random place in a zone, `up` metres above the ground or the water. */
    const within = (zone: Zone, up: number) => {
      const way = zone.side || (rnd() < 0.5 ? -1 : 1);
      return at(zone.from + rnd() * (zone.to - zone.from), way * (zone.near + rnd() * (zone.far - zone.near)), up);
    };
    /** Faces the way it is travelling, as the camera sees it: the art faces right. */
    const heading = (c: Cutout, dx: number, dz: number, camera: THREE.Camera) => {
      const e = camera.matrixWorld.elements;
      const across = dx * e[0] + dz * e[2];
      if (Math.abs(across) > 0.02) c.facing = Math.sign(across);
    };

    // --- birds: small flocks wheeling in wide circles above the trees
    for (let s = 40; life.birds && s < level.length + 40; s += 75) {
      const centre = at(s, (rnd() - 0.5) * 70, 16 + rnd() * 10);
      const radius = 24 + rnd() * 22, speed = (rnd() < 0.5 ? -1 : 1) * (0.16 + rnd() * 0.1);
      for (let i = 0, n = 3 + Math.floor(rnd() * 3); i < n; i++) {
        const lag = i * 0.22, phase = rnd() * 6, lift = (rnd() - 0.5) * 4;
        ambient.add(bird, 1.3, centre, (c, t) => {
          const a = t * speed + lag;
          c.group.position.set(centre.x + Math.cos(a) * radius, centre.y + lift + Math.sin(t * 0.7 + phase) * 1.5, centre.z + Math.sin(a) * radius * 0.7);
          heading(c, -Math.sin(a) * speed, Math.cos(a) * speed, ambient.camera);
          c.squashY = 1 + 0.28 * Math.sin(t * 13 + phase); // flapping
        });
      }
    }

    // --- dragonflies over the river and in the gully: hover, then dart
    const dart = (home: THREE.Vector3, phase: number) => (c: Cutout, t: number) => {
      const dx = Math.sin(t * 0.9 + phase) * 2.2 + Math.sin(t * 2.3 + phase) * 0.6;
      const dz = Math.cos(t * 0.7 + phase * 2) * 2.2;
      c.group.position.set(home.x + dx, home.y + Math.sin(t * 1.7 + phase) * 0.4, home.z + dz);
      heading(c, Math.cos(t * 0.9 + phase), -Math.sin(t * 0.7 + phase * 2), ambient.camera);
      c.squashY = 1 + 0.12 * Math.sin(t * 40);
    };
    for (const zone of life.dragonflies) {
      for (let i = 0; i < zone.count; i++) {
        const home = within(zone, 0.7 + rnd() * 1.6);
        ambient.add(dragonfly, 0.55, home, dart(home, rnd() * 6));
      }
    }

    // --- butterflies among the flowers
    for (const zone of life.butterflies) {
      for (let i = 0; i < zone.count; i++) {
        const home = within(zone, 0.7 + rnd() * 1.1);
        const phase = rnd() * 6;
        ambient.add(butterfly, 0.34, home, (c, t) => {
          c.group.position.set(home.x + Math.sin(t * 0.6 + phase) * 1.4, home.y + Math.sin(t * 2.1 + phase) * 0.35, home.z + Math.sin(t * 0.43 + phase * 2) * 1.4);
          heading(c, Math.cos(t * 0.6 + phase), Math.cos(t * 0.43 + phase * 2), ambient.camera);
          c.squashX = 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + phase)); // wings opening and closing
        });
      }
    }

    // --- embers: sparks that drift up from the lava, wobbling, and wink out
    for (const zone of life.embers) {
      for (let i = 0; i < zone.count; i++) {
        const home = within(zone, 0.2);
        const phase = rnd() * 6, rise = 3.5 + rnd() * 4, rate = 0.12 + rnd() * 0.12;
        ambient.add(ember, 0.3, home, (c, t) => {
          const life = (t * rate + phase) % 1;
          c.group.position.set(home.x + Math.sin(life * 9 + phase) * 0.6, home.y + life * rise, home.z + Math.cos(life * 7 + phase) * 0.6);
          c.squashX = c.squashY = Math.min(1, life * 6) * (1 - life) * 1.6;
        }, false, true);
      }
    }

    // --- a herd of long-necks far off on the hills, plodding along and back
    const farHerd = unhazed(herd);
    for (const [s, side] of life.herds) {
      const home = at(s, side, -0.4);
      ambient.add(farHerd, 9, home, (c, t) => {
        const along = Math.sin(t * 0.035 + s) * 34;
        c.group.position.set(home.x, home.y, home.z + along);
        heading(c, 0, Math.cos(t * 0.035 + s), ambient.camera);
        c.hop = Math.abs(Math.sin(t * 1.3 + s)) * 0.12;
      }, false);
    }

    // --- clouds drifting across the sky, high and far
    const farCloud = unhazed(cloud);
    for (let i = 0; i < 12; i++) {
      const home = new THREE.Vector3((rnd() - 0.5) * 900, 95 + rnd() * 70, -level.length / 2 + (rnd() - 0.5) * 1100);
      const drift = 1.5 + rnd() * 2;
      ambient.add(farCloud, 26 + rnd() * 26, home, (c, t) => {
        c.group.position.x = ((((home.x + t * drift + 450) % 900) + 900) % 900) - 450;
      }, false);
    }

    // --- steam from the vents: puffs that rise, swell and vanish
    for (const { at: [x, y, z], height } of steamVents()) {
      // the puffs are in proportion to the cone they rise from, and big ones rise slowly
      for (let i = 0; i < 4; i++) {
        const home = new THREE.Vector3(x, y, z);
        ambient.add(smoke, height * 0.3, home, (c, t) => {
          const life = (t * 0.09 + i / 4) % 1;
          c.group.position.set(home.x + Math.sin(life * 5 + i) * height * 0.08, home.y + life * height * 0.9, home.z);
          c.squashX = c.squashY = (0.35 + life * 0.9) * Math.min(1, (1 - life) * 4);
        }, false);
      }
    }
    return ambient;
  }

  private camera!: THREE.Camera;
  /** On low graphics only the far-off life is kept: the herd, the clouds and the steam. */
  low = false;

  update(time: number, camera: THREE.Camera) {
    this.camera = camera;
    for (const m of this.movers) {
      const far = (this.low && m.small) || (m.home.distanceToSquared(camera.position) > REACH ** 2 && m.home.y < 90);
      m.cutout.group.visible = !far;
      if (far) continue;
      m.move(m.cutout, time);
      m.cutout.pose();
      m.cutout.faceCamera(camera);
    }
  }
}
