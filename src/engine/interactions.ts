// The two things to try: fruit to throw and a drum to bang.

import * as THREE from 'three';
import { surfaceHeight } from '../data/level';
import { sound } from '../audio';
import { Cutout, loadArt } from './cutouts';
import { Actor, DRUM_REACH, type Stage } from './behaviours';

const FRUIT_STAYS = 8; // seconds on the ground
const FRUIT_SIZE = 0.75; // metres
const THROW_REACH = 30; // metres: as far as a fruit can be thrown
const FLIGHT = 0.75; // seconds in the air
const DRUM_BEATS = 3;
const DRUM_BEAT = 0.3; // seconds between beats

interface Fruit {
  cutout: Cutout;
  from: THREE.Vector3;
  to: THREE.Vector3;
  age: number;
  /** Seconds left on the ground; a dinosaur eating it takes over. */
  left: number;
  claimed: boolean;
  gone: boolean;
}

export class Interactions {
  private readonly fruits: Fruit[] = [];
  private readonly ring: THREE.Mesh;
  private ringAge = Infinity;
  /** Seconds until the dinosaurs react to the drum: they wait for its three beats, so the drum is heard on its own. */
  private drumDue = Infinity;
  private readonly ray = new THREE.Raycaster();

  private constructor(private readonly scene: THREE.Scene, private readonly actors: Actor[], private readonly fruitArt: Awaited<ReturnType<typeof loadArt>>) {
    // the drum's ring: a band that spreads out across the ground from the camera
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.ring.visible = false;
    this.ring.userData.notInFlat = true;
    scene.add(this.ring);
  }

  static async create(scene: THREE.Scene, actors: Actor[]) {
    return new Interactions(scene, actors, await loadArt('art/ui/fruit.webp'));
  }

  /** Clears everything away for a new ride. */
  reset() {
    for (const f of this.fruits) this.scene.remove(f.cutout.group);
    this.fruits.length = 0;
    this.ring.visible = false;
    this.ringAge = this.drumDue = Infinity;
  }

  /**
   * Throws a fruit at the spot on the ground under a point of the view (`x`, `y` from -1 to 1).
   * It lands where the finger lifted, or as far as it can be thrown in that direction.
   */
  throwFruit(x: number, y: number, stage: Stage) {
    const camera = stage.camera as THREE.PerspectiveCamera;
    this.ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const { origin, direction } = this.ray.ray;
    const p = new THREE.Vector3();
    // step along the line of sight until it goes underground
    let t = 1;
    for (; t < THROW_REACH; t += 0.4) {
      p.copy(origin).addScaledVector(direction, t);
      if (p.y <= surfaceHeight(p.x, p.z)) break;
    }
    p.copy(origin).addScaledVector(direction, t);
    p.y = surfaceHeight(p.x, p.z);
    const cutout = new Cutout(this.fruitArt, FRUIT_SIZE);
    const from = origin.clone().addScaledVector(direction, 0.9);
    from.y -= 0.7;
    cutout.group.position.copy(from);
    this.scene.add(cutout.group);
    this.fruits.push({ cutout, from, to: p, age: 0, left: FRUIT_STAYS, claimed: false, gone: false });
    stage.sound('throw');
  }

  bangDrum(stage: Stage) {
    // three beats in a row: boom, boom, boom
    for (let beat = 0; beat < DRUM_BEATS; beat++) sound('drum', 1, beat * DRUM_BEAT);
    this.ringAge = 0;
    this.ring.position.copy(stage.camera.position);
    this.ring.position.y -= 1.2;
    this.drumDue = DRUM_BEATS * DRUM_BEAT;
  }

  update(dt: number, stage: Stage) {
    // --- drum: a ring spreads out on each beat, and the dinosaurs answer once the beats are done
    this.drumDue -= dt;
    if (this.drumDue <= 0) {
      this.drumDue = Infinity;
      for (const a of this.actors) a.hearDrum(stage);
    }
    if (this.ringAge < DRUM_BEATS * DRUM_BEAT + 0.5) {
      this.ringAge += dt;
      const t = Math.min(1, (this.ringAge % DRUM_BEAT) / DRUM_BEAT);
      this.ring.visible = true;
      this.ring.scale.setScalar(1 + (DRUM_REACH - 1) * (1 - (1 - t) ** 2));
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    } else {
      this.ring.visible = false;
    }

    // --- fruit
    for (const f of this.fruits) {
      const wasFlying = f.age < FLIGHT;
      f.age += dt;
      const c = f.cutout;
      if (f.age < FLIGHT) {
        const t = f.age / FLIGHT;
        c.group.position.lerpVectors(f.from, f.to, t);
        c.group.position.y += Math.sin(t * Math.PI) * (2 + f.from.distanceTo(f.to) * 0.12);
      } else {
        c.group.position.copy(f.to);
        // two small bounces on landing
        const b = f.age - FLIGHT;
        c.hop = b < 0.7 ? Math.abs(Math.sin(b * 9)) * 0.45 * (1 - b / 0.7) : 0;
        if (wasFlying) stage.sound('bounce', f.to);
        if (!f.claimed) {
          // For as long as it lies there, the nearest dinosaur that is free and close enough comes to eat it:
          // one that was busy when it landed still gets it as soon as it is free.
          let best: Actor | undefined;
          let bestDistance = Infinity;
          for (const a of this.actors) {
            const d = Math.hypot(a.position.x - f.to.x, a.position.z - f.to.z);
            if (a.free && d < a.fruitReach && d < bestDistance) {
              best = a;
              bestDistance = d;
            }
          }
          if (best?.offerFruit(f.to, () => (f.gone = true))) f.claimed = true;
        }
        if (!f.claimed) {
          f.left -= dt;
          if (f.left <= 0) {
            f.gone = true;
            stage.sound('pop', f.to);
          }
        }
      }
      c.squashX = c.squashY = f.gone ? 0 : 1;
      c.pose();
      c.faceCamera(stage.camera);
    }
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      if (!this.fruits[i].gone) continue;
      this.scene.remove(this.fruits[i].cutout.group);
      this.fruits.splice(i, 1);
    }
  }
}
