// The ride: the camera moves along the track by itself, facing the way it is going. The player can look anywhere
// and zoom, and the view never moves on its own: wherever he has turned it, it stays turned by that much from
// the track, so a shot can be lined up ahead of time.

import * as THREE from 'three';
import { level, railPoints, smooth } from '../data/level';

const CRUISE = 4.8; // metres a second between scenes
const CRAWL = 1.8; // metres a second through a scene
/** With a dinosaur close and on screen the ride eases right down, to give time to line up the photo. */
const BESIDE_A_DINO = 0.55;
/** Slow mode takes this much off every speed. */
const SLOW_MODE = 0.7;
/** Straight up and straight down are the only places the view cannot go. */
const LOOK_PITCH = THREE.MathUtils.degToRad(80);
const BASE_FOV = 45;
const ZOOM_OUT = 0.75;
const ZOOM_IN = 4;

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export interface LookTarget {
  readonly visible: boolean;
  /** A point worth looking at, such as the middle of a dinosaur. */
  centre(out: THREE.Vector3): THREE.Vector3;
}

export class Ride {
  private readonly curve = new THREE.CatmullRomCurve3(railPoints().map((p) => new THREE.Vector3(...p)));
  private readonly length = this.curve.getLength();
  private u = 0;
  private speed = CRUISE;
  private settled = false;
  private yaw = 0;
  private pitch = 0;
  /** Stays where it is, as on the title screen. */
  parked = false;
  /** How far the player has turned the view away from straight down the track. */
  private lookYaw = 0;
  private lookPitch = 0;
  /** 1 is the normal view; bigger is closer. */
  zoom = 1;
  /** Slow mode: everything a good deal slower. */
  slow = false;
  private readonly here = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();

  get finished() {
    return this.u >= 1;
  }

  /** Distance travelled, in the level's own metres. */
  get s() {
    return this.u * level.length;
  }

  restart() {
    this.u = 0;
    this.speed = CRUISE;
    this.settled = false;
    this.zoom = 1;
    this.lookYaw = this.lookPitch = 0;
  }

  /** The player turns the view: `right`, `up` in radians. */
  turn(right: number, up: number) {
    this.lookYaw = wrap(this.lookYaw - right);
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch + up, -LOOK_PITCH, LOOK_PITCH);
  }

  /** Zooms by a factor: more than 1 closer, less than 1 wider. */
  zoomBy(factor: number) {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, ZOOM_OUT, ZOOM_IN);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, targets: LookTarget[]) {
    const u = THREE.MathUtils.clamp(this.u, 0, 1);
    this.curve.getPointAt(u, this.here);
    // look a few metres down the track, so the view leans into bends and tips over the brow of a hill
    const lead = 7 / this.length;
    if (u + lead <= 1) this.curve.getPointAt(u + lead, this.ahead);
    else this.ahead.copy(this.here).add(this.curve.getTangentAt(1));
    const dir = this.ahead.sub(this.here);
    const slope = dir.y / dir.length();
    const trackYaw = Math.atan2(-dir.x, -dir.z);
    const trackPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.8;

    // the view follows the track smoothly, plus however far he has turned it
    if (!this.settled) {
      this.settled = true;
      this.yaw = trackYaw;
      this.pitch = trackPitch;
    }
    const ease = 1 - Math.exp(-dt * 2.5);
    this.yaw += wrap(trackYaw - this.yaw) * ease;
    this.pitch += (trackPitch - this.pitch) * ease;
    camera.position.copy(this.here);
    // a mine cart rattles: a small, quick bob on the rails
    if (level.cart && !this.parked) camera.position.y += Math.sin(this.s * 2.6) * 0.018 + Math.sin(this.s * 7.1) * 0.008;
    camera.rotation.set(THREE.MathUtils.clamp(this.pitch + this.lookPitch, -LOOK_PITCH, LOOK_PITCH), this.yaw + this.lookYaw, 0);
    // the lens glides to its new zoom
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / this.zoom));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 12));
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();

    // a dinosaur that is close and on screen slows the ride
    let beside = 1;
    for (const target of targets) {
      if (!target.visible) continue;
      const p = target.centre(this.spot);
      const distance = p.distanceTo(this.here);
      if (distance > 28) continue;
      p.project(camera);
      if (p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) beside = Math.min(beside, THREE.MathUtils.lerp(BESIDE_A_DINO, 1, smooth(12, 28, distance)));
    }

    // crawl through a scene, hurry between scenes, and go quicker still down a hill
    const s = this.s;
    let inScene = 0;
    for (const scene of level.scenes) inScene = Math.max(inScene, smooth(scene.from - 8, scene.from, s) * (1 - smooth(scene.to, scene.to + 8, s)));
    const wantSpeed = THREE.MathUtils.lerp(CRUISE, CRAWL, inScene) * (1 + Math.max(0, -slope) * 2) * beside * (this.slow ? SLOW_MODE : 1);
    this.speed += (wantSpeed - this.speed) * (1 - Math.exp(-dt * 1.5));
    if (!this.parked) this.u += (this.speed * dt) / this.length;
  }
}
