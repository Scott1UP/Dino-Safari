// Flat cut-out pictures standing in the world. Each is an unlit card that turns to face the camera round the
// upright axis only, and casts a real shadow in the shape of its picture.

import * as THREE from 'three';
import { loadTexture } from './scene';

/** How far up the trimmed picture the feet are: just above the white border along the bottom edge. */
const FEET = 0.02;

// A unit square standing on its feet line.
const CARD = new THREE.PlaneGeometry(1, 1).translate(0, 0.5 - FEET, 0);
/** The card's corners, in order round its edge. */
export const CARD_CORNERS = [[-0.5, -FEET], [0.5, -FEET], [0.5, 1 - FEET], [-0.5, 1 - FEET]] as const;

/** Draws a picture's outline in one flat colour: the photo's "who is where" image is made of these. */
function flatMaterial(map: THREE.Texture, colour = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, tint: { value: new THREE.Vector3(colour / 255, 0, 0) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 tint; varying vec2 vUv; void main() { if (texture2D(map, vUv).a < 0.5) discard; gl_FragColor = vec4(tint, 1.0); }',
    side: THREE.DoubleSide,
  });
}

export interface Art {
  map: THREE.Texture;
  aspect: number;
  /** The share of the picture's rectangle that is actually picture, not see-through. */
  coverage: number;
  face: THREE.MeshBasicMaterial;
  /** Lets the shadow follow the picture's outline instead of its rectangle. */
  depth: THREE.MeshDepthMaterial;
  /** In the who-is-where image, scenery is a black shape that can hide a dinosaur. */
  blocker: THREE.ShaderMaterial;
}

const arts = new Map<string, Promise<Art>>();
const GLOWS = /\/(crystal-[a-z]+|glowshroom|lantern|ember|lavafall)\.webp$/;

export function loadArt(sprite: string): Promise<Art> {
  let made = arts.get(sprite);
  if (!made) {
    made = loadTexture(sprite).then((map) => {
      const image = map.image as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, 64, 64);
      const alpha = ctx.getImageData(0, 0, 64, 64).data;
      let solid = 0;
      for (let i = 3; i < alpha.length; i += 4) if (alpha[i] > 127) solid++;
      return {
        map,
        aspect: image.width / image.height,
        coverage: solid / 4096,
        // things that give off light are not dimmed by haze or by the gloom of a tunnel: they glow
        face: new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, fog: !GLOWS.test(sprite) }),
        depth: new THREE.MeshDepthMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, depthPacking: THREE.RGBADepthPacking }),
        blocker: flatMaterial(map),
      };
    });
    arts.set(sprite, made);
  }
  return made;
}

/** Frees every picture loaded so far, when leaving a level. */
export function disposeArt() {
  for (const loading of arts.values()) {
    void loading.then((a) => {
      a.map.dispose();
      a.face.dispose();
      a.depth.dispose();
      a.blocker.dispose();
    });
  }
  arts.clear();
}

export class Cutout {
  /** Sits at the feet. */
  readonly group = new THREE.Group();
  readonly card: THREE.Mesh;
  /** Squash and stretch, the paper flip (1 faces right, -1 left) and the height of a hop. */
  squashX = 1;
  squashY = 1;
  facing = 1;
  hop = 0;
  /** Stands square to the track instead of turning to face the camera. */
  fixed = false;
  protected art: Art;
  height: number;

  constructor(art: Art, height: number, mirror = false) {
    this.art = art;
    this.height = height;
    this.facing = mirror ? -1 : 1;
    this.card = new THREE.Mesh(CARD, art.face);
    this.card.customDepthMaterial = art.depth;
    this.card.castShadow = true;
    this.card.userData.flat = art.blocker;
    this.group.add(this.card);
    this.pose();
  }

  /** Turns to face the camera, round the upright axis only, so the feet stay on the ground. */
  faceCamera(camera: THREE.Camera) {
    if (this.fixed) return;
    const p = this.group.position;
    this.group.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
  }

  /** Applies size, squash, flip and hop to the card. */
  pose() {
    this.card.scale.set(this.height * this.art.aspect * this.squashX * this.facing, this.height * this.squashY, 1);
    this.card.position.y = this.hop;
  }

  /** Swaps the picture. */
  protected show(art: Art, height: number, flat: THREE.ShaderMaterial) {
    this.art = art;
    this.height = height;
    this.card.material = art.face;
    this.card.customDepthMaterial = art.depth;
    this.card.userData.flat = flat;
    flat.uniforms.map.value = art.map;
  }
}

/** A cut-out with several pictures, one per pose, and its own colour in the who-is-where image. */
export class Puppet<Pose extends string> extends Cutout {
  pose_: Pose;
  private readonly flat: THREE.ShaderMaterial;
  /** Counts down through the quick squash that hides a change of picture. */
  private pop = 0;

  constructor(
    private readonly arts: Record<Pose, Art>,
    private readonly heights: Record<Pose, number>,
    first: Pose,
    /** 1 to 255: the red value this puppet is drawn with in the who-is-where image. */
    readonly code: number,
  ) {
    super(arts[first], heights[first]);
    this.pose_ = first;
    this.flat = flatMaterial(arts[first].map, code);
    this.card.userData.flat = this.flat;
  }

  /** The share of the card's rectangle its current picture fills. */
  get coverage() {
    return this.art.coverage;
  }

  setPose(pose: Pose) {
    if (pose === this.pose_) return;
    this.pose_ = pose;
    this.show(this.arts[pose], this.heights[pose], this.flat);
    this.pop = 0.12;
  }

  /** The pose pop: a 120 ms squash. Returns the squash to multiply in. */
  popSquash(dt: number): number {
    if (this.pop <= 0) return 1;
    this.pop = Math.max(0, this.pop - dt);
    return 1 - 0.22 * Math.sin((this.pop / 0.12) * Math.PI);
  }
}
