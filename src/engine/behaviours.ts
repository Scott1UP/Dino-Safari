// How a dinosaur behaves. Each is a cardboard puppet: one picture per pose, brought to life by hopping,
// breathing and flipping like paper. It idles where it lives, does its special pose once as the ride passes,
// and reacts to fruit and to the drum; a reaction interrupts whatever it was doing, then it carries on.

import * as THREE from 'three';
import { DINOS, POSES, poseSprite, type DinoInfo, type PoseId } from '../data/dinos';
import { groundHeight, spot, type Spawn } from '../data/level';
import { Puppet, loadArt, type Art } from './cutouts';

const FRUIT_REACH = 6; // metres from where the fruit lands
export const DRUM_REACH = 20; // metres from the camera
const EAT_SECONDS = 5;
const DRUM_SECONDS = 5;
const HOP_LENGTH = 0.9;
const HOP_TIME = 0.36;
/** A special starts once the dinosaur has been on screen this long, and can happen again after a rest. */
const SEEN_BEFORE_SPECIAL = 0.8;
const REST_BETWEEN_SPECIALS = 7;
const SPECIALS_PER_RIDE = 3;
const scratch = new THREE.Vector3();

type State = 'away' | 'entering' | 'idle' | 'special' | 'toFruit' | 'eating' | 'returning' | 'drum';

export interface Stage {
  camera: THREE.Camera;
  sound(id: string, at?: THREE.Vector3): void;
}

export class Actor {
  readonly info: DinoInfo;
  readonly puppet: Puppet<PoseId>;
  private state: State = 'idle';
  private timer = 0;
  private readonly home = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private travelled = 0;
  /** How long it has been on screen, the wait before it may do its special again, and how many it has left. */
  private seenFor = 0;
  private specialRest = 0;
  private specialsLeft = SPECIALS_PER_RIDE;
  private wanderOut = true;
  private wanderWait = 1;
  private facingWanted = 1;
  private resume: State = 'idle';
  private onArrive: (() => void) | undefined;
  private eatingDone: (() => void) | undefined;

  private constructor(readonly spawn: Spawn, arts: Record<PoseId, Art>, code: number) {
    this.info = DINOS[spawn.dino];
    // every pose covers the same area of the world as the standing pose, so a rearing dinosaur is taller but no bigger
    const standing = arts.standing.aspect * this.info.height ** 2;
    const heights = Object.fromEntries(
      POSES.map((p) => [p, Math.sqrt(standing / arts[p].aspect) * (this.info.poseScale?.[p] ?? 1)]),
    ) as Record<PoseId, number>;
    this.puppet = new Puppet<PoseId>(arts, heights, 'standing', code);
    this.reset();
  }

  static async create(scene: THREE.Scene, spawn: Spawn, code: number): Promise<Actor> {
    const loaded = await Promise.all(POSES.map((p) => loadArt(poseSprite(spawn.dino, p))));
    const actor = new Actor(spawn, Object.fromEntries(POSES.map((p, i) => [p, loaded[i]])) as Record<PoseId, Art>, code);
    scene.add(actor.puppet.group);
    return actor;
  }

  get pose(): PoseId {
    return this.puppet.pose_;
  }

  get visible() {
    return this.puppet.group.visible;
  }

  /**
   * Free to go and eat. Fruit can call it away from idling, walking in, walking home, or its special pose;
   * only eating and the short drum reaction are left to finish.
   */
  get free() {
    return this.visible && this.state !== 'away' && this.state !== 'toFruit' && this.state !== 'eating' && this.state !== 'drum';
  }

  /** How far it will come for a fruit: big dinosaurs notice from further off. */
  get fruitReach() {
    return FRUIT_REACH + this.info.height * 0.6;
  }

  /** Stops a special pose part-way, so that something else can happen. It gets the special back for later. */
  private cutSpecialShort() {
    if (this.state !== 'special') return;
    const sp = this.spawn.special;
    if (sp.to) this.home.copy(this.goal);
    // one caught in mid-air comes down where it is, and walks back to its perch afterwards
    if (sp.fly) this.position.y = groundHeight(this.position.x, this.position.z);
    this.puppet.setPose('standing');
    this.specialsLeft++;
    this.specialRest = 4;
    this.state = 'idle';
  }

  get position() {
    return this.puppet.group.position;
  }

  /** The middle of the dinosaur: where the ride's view is drawn to. */
  centre(out: THREE.Vector3) {
    return out.copy(this.position).setY(this.position.y + this.puppet.hop + this.puppet.height * 0.5);
  }

  /** Back to the start of a ride. */
  reset() {
    const s = this.spawn;
    this.place(this.home, s.s, s.side);
    this.position.copy(this.home);
    this.puppet.setPose('standing');
    this.puppet.hop = 0;
    this.puppet.group.visible = !s.hiddenUntil && !s.enterFrom;
    this.state = this.puppet.group.visible ? 'idle' : 'away';
    this.seenFor = this.specialRest = 0;
    this.specialsLeft = SPECIALS_PER_RIDE;
    this.wanderOut = true;
    this.wanderWait = 1 + (s.s % 3);
    // at rest it faces the track: the art faces right, so anything on the right of the track is mirrored
    this.facingWanted = this.puppet.facing = s.side < 0 ? 1 : -1;
    this.onArrive = this.eatingDone = undefined;
  }

  private place(out: THREE.Vector3, s: number, side: number) {
    const [x, y, z] = spot(s, side);
    return out.set(x, y + (this.spawn.lift ?? 0), z);
  }

  private walkTo(goal: THREE.Vector3, state: State, then?: () => void) {
    this.start.copy(this.position);
    this.goal.copy(goal);
    this.travelled = 0;
    this.state = state;
    this.onArrive = then;
  }

  /** The drum was banged at the camera. */
  hearDrum(stage: Stage) {
    if (this.position.distanceTo(stage.camera.position) > DRUM_REACH) return;
    if (this.state === 'away') {
      if (this.spawn.hiddenUntil !== 'drum') return;
      // the drum brings it out of hiding
      this.puppet.group.visible = true;
      stage.sound(`call-${this.info.id}`, this.position);
      const to = this.spawn.revealTo ?? this.spawn;
      this.place(this.home, to.s, to.side);
      this.walkTo(this.home, 'entering');
      return;
    }
    // the drum interrupts a special pose or a walk; only eating is left to finish
    if (this.state === 'eating' || this.state === 'toFruit' || this.state === 'drum') return;
    this.cutSpecialShort();
    this.resume = this.state;
    this.state = 'drum';
    this.timer = DRUM_SECONDS;
    this.puppet.setPose('drum');
    stage.sound(`call-${this.info.id}`, this.position);
  }

  /** A fruit has landed nearby. Returns true if this dinosaur is going to eat it; `eaten` is called as it does. */
  offerFruit(at: THREE.Vector3, eaten: () => void): boolean {
    if (!this.free) return false;
    this.cutSpecialShort();
    // stop short, so its head and not its middle arrives at the fruit
    const reach = this.puppet.height * 0.45;
    const from = this.position;
    const d = Math.hypot(at.x - from.x, at.z - from.z);
    const k = Math.max(0, d - reach) / Math.max(d, 0.001);
    const goal = new THREE.Vector3(from.x + (at.x - from.x) * k, 0, from.z + (at.z - from.z) * k);
    goal.y = groundHeight(goal.x, goal.z);
    this.eatingDone = eaten;
    this.walkTo(goal, 'toFruit', () => {
      this.state = 'eating';
      this.timer = EAT_SECONDS;
      this.puppet.setPose('eating');
      // the eating picture has the fruit in it, so the thrown one goes as the picture changes
      this.eatingDone?.();
      this.eatingDone = undefined;
      this.faceTowards(at.x - this.position.x, at.z - this.position.z, this.lastStage!);
      this.lastStage?.sound('munch', this.position);
    });
    return true;
  }

  private lastStage: Stage | undefined;

  /** Which way the art should face to look along a direction on the ground, as the camera sees it. */
  private faceTowards(dx: number, dz: number, stage: Stage) {
    const e = stage.camera.matrixWorld.elements; // the camera's right-hand direction is its first column
    const across = dx * e[0] + dz * e[2];
    if (Math.abs(across) > 0.05) this.facingWanted = Math.sign(across);
  }

  /** Whether it is comfortably inside the view and near enough to make out. */
  private onScreen(stage: Stage): boolean {
    const reach = 26 + this.info.height * 2.5;
    if (this.position.distanceTo(stage.camera.position) > reach) return false;
    const p = this.centre(scratch).project(stage.camera);
    return p.z < 1 && Math.abs(p.x) < 0.8 && Math.abs(p.y) < 0.9;
  }

  /** Hop-walks towards the goal. Returns true on arrival. */
  private hopAlong(dt: number, stage: Stage, stomp: boolean): boolean {
    const distance = Math.max(0.001, this.start.distanceTo(this.goal));
    const before = Math.floor(this.travelled / HOP_LENGTH);
    this.travelled = Math.min(distance, this.travelled + (dt * HOP_LENGTH) / HOP_TIME);
    this.faceTowards(this.goal.x - this.start.x, this.goal.z - this.start.z, stage);
    this.position.lerpVectors(this.start, this.goal, this.travelled / distance);
    this.position.y = THREE.MathUtils.lerp(this.start.y, this.goal.y, this.travelled / distance);
    if (!this.spawn.lift) this.position.y = groundHeight(this.position.x, this.position.z);
    const size = Math.min(1, this.puppet.height / 3);
    this.puppet.hop = Math.abs(Math.sin((this.travelled / HOP_LENGTH) * Math.PI)) * 0.34 * size;
    if (stomp && Math.floor(this.travelled / HOP_LENGTH) > before) stage.sound('stomp', this.position);
    if (this.travelled < distance) return false;
    this.puppet.hop = 0;
    return true;
  }

  update(time: number, dt: number, rideS: number, stage: Stage) {
    this.lastStage = stage;
    const s = this.spawn;
    const puppet = this.puppet;
    puppet.hop = 0;

    // --- things the ride sets off
    if (this.state === 'away' && s.enterFrom && rideS >= (s.enterAtS ?? 0) && rideS < s.s + 40) {
      puppet.group.visible = true;
      this.place(this.position, s.enterFrom.s, s.enterFrom.side);
      this.walkTo(this.home, 'entering');
    }
    // The special is set off by being looked at, not by a point on the track: once the dinosaur (or, for one that
    // is hiding, its hiding place) has been on screen for a moment, it performs, so it always happens in view.
    const ready = this.state === 'idle' || (this.state === 'away' && s.hiddenUntil === 'special');
    this.specialRest -= dt;
    this.seenFor = rideS >= 0 && ready && this.onScreen(stage) ? this.seenFor + dt : 0;
    if (this.seenFor > SEEN_BEFORE_SPECIAL && this.specialRest <= 0 && this.specialsLeft > 0) {
      this.specialsLeft--;
      this.seenFor = 0;
      puppet.group.visible = true;
      this.state = 'special';
      this.timer = 0;
      this.start.copy(this.position);
      if (s.special.to) this.place(this.goal, s.special.to.s, s.special.to.side);
      puppet.setPose('special');
      stage.sound(s.special.sound ?? `call-${this.info.id}`, this.position);
      if (s.special.sound && s.special.sound !== 'roar') stage.sound(`call-${this.info.id}`, this.position);
    }

    // --- what it is doing
    switch (this.state) {
      case 'idle': {
        if (!s.wander) break;
        if (this.wanderWait > 0) {
          this.wanderWait -= dt;
          if (this.wanderWait <= 0) {
            const out = this.wanderOut;
            this.wanderOut = !out;
            const goal = out ? this.place(new THREE.Vector3(), s.s + 1.5, s.side + Math.sign(s.side) * s.wander) : this.home;
            this.start.copy(this.position);
            this.goal.copy(goal);
            this.travelled = 0;
          }
        } else if (Math.abs(this.facingWanted - puppet.facing) > 0.01) {
          this.faceTowards(this.goal.x - this.start.x, this.goal.z - this.start.z, stage); // finish turning first
        } else if (this.hopAlong(dt, stage, false)) {
          this.wanderWait = 2.2;
          if (this.wanderOut) this.facingWanted = s.side < 0 ? 1 : -1;
        }
        break;
      }
      case 'entering':
      case 'toFruit':
      case 'returning':
        if (this.hopAlong(dt, stage, this.info.height > 4)) {
          const then = this.onArrive;
          this.onArrive = undefined;
          this.state = 'idle';
          this.wanderWait = 2;
          this.wanderOut = true;
          if (!then) this.facingWanted = s.side < 0 ? 1 : -1;
          then?.();
        }
        break;
      case 'special': {
        this.timer += dt;
        const sp = s.special;
        const t = Math.min(1, this.timer / sp.seconds);
        if (sp.hops) puppet.hop = Math.abs(Math.sin(t * sp.hops * Math.PI)) * (sp.hopHeight ?? 0.5);
        if (sp.to) {
          this.position.lerpVectors(this.start, this.goal, THREE.MathUtils.smoothstep(t, 0, 0.8));
          this.position.y = groundHeight(this.position.x, this.position.z);
          this.faceTowards(this.goal.x - this.start.x, this.goal.z - this.start.z, stage);
        }
        if (sp.fly) {
          const turn = t * Math.PI * 2;
          this.position.set(
            this.start.x + Math.sin(turn) * sp.fly.radius,
            this.start.y,
            this.start.z - (1 - Math.cos(turn)) * sp.fly.radius * 0.5,
          );
          puppet.hop = Math.sin(t * Math.PI) ** 0.6 * sp.fly.height;
          this.faceTowards(Math.cos(turn), -Math.sin(turn) * 0.5, stage);
        }
        if (t >= 1) {
          puppet.setPose('standing');
          this.state = 'idle';
          this.specialRest = REST_BETWEEN_SPECIALS;
          if (sp.to) this.home.copy(this.goal);
          if (sp.fly) this.position.copy(this.start);
          this.facingWanted = s.side < 0 ? 1 : -1;
        }
        break;
      }
      case 'eating':
        this.timer -= dt;
        if (this.timer <= 0) {
          puppet.setPose('standing');
          this.walkTo(this.home, 'returning');
        }
        break;
      case 'drum': {
        this.timer -= dt;
        const t = 1 - this.timer / DRUM_SECONDS;
        puppet.hop = Math.abs(Math.sin(t * 8 * Math.PI)) * 0.3 * Math.min(1, puppet.height / 3) * (this.spawn.lift ? 0 : 1);
        if (this.timer <= 0) {
          puppet.setPose('standing');
          // carry on with whatever the drum interrupted: a walk picks up from where it stopped
          if (this.resume === 'returning' || this.resume === 'entering') this.walkTo(this.home, this.resume);
          else if (this.position.distanceTo(this.home) > 0.6) this.walkTo(this.home, 'returning');
          else this.state = this.resume;
        }
        break;
      }
    }

    // --- breathing, the paper flip and the pose pop
    const breath = Math.sin(time * 2.1 + s.s);
    const pop = puppet.popSquash(dt);
    puppet.squashY = (1 + 0.022 * breath) * pop;
    puppet.squashX = (1 - 0.012 * breath) * (2 - pop);
    const turn = this.facingWanted - puppet.facing;
    puppet.facing += Math.sign(turn) * Math.min(Math.abs(turn), dt * 9);
    puppet.pose();
  }
}
