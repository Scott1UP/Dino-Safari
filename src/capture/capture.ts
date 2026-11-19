// Taking a photo. The picture is the scene drawn again exactly as it stands, at the shape of the screen:
// nothing is moved, re-aimed, cropped or cleaned up, and the interface is not part of the scene, so it cannot appear.
//
// In the same tick the scene is drawn once more, small, with every dinosaur in its own flat colour and everything
// else black. That "who is where" image says how much of each dinosaur can really be seen in the photo.

import * as THREE from 'three';
import type { DinoId, PoseId } from '../data/dinos';
import { CARD_CORNERS } from '../engine/cutouts';

/** The longer side of a photo, and of the who-is-where image, in pixels. */
const PHOTO_SIZE = 1200;
const MAP_SIZE = 240;
/** How close to the middle of the frame counts as "aimed at", as a share of the frame's shorter side. */
const AIM_RADIUS = 0.2;
/** A dinosaur is only the subject of a photo if this much of it is in the picture... */
const ENOUGH_OF_IT = 0.35;
/** ...or it is a close-up, filling at least this share of the frame. */
const CLOSE_UP = 0.1;
/** And never if it fills less of the frame than this. */
const SMALLEST_SUBJECT = 0.004;

export interface PhotoSubject {
  dino: DinoId;
  pose: PoseId;
  /** Visible pixels as a share of the frame. */
  frameShare: number;
  /** How much of the whole dinosaur is in the picture: what is neither hidden nor cut off by the frame's edge. */
  visibleShare: number;
  /** 0 = centred, 1 = at the corner. */
  centreOffset: number;
}

export interface Shot {
  image: Promise<Blob>;
  width: number;
  height: number;
  subject?: PhotoSubject;
  others: PhotoSubject[];
}

/** Something that can be a photo's subject: a dinosaur, with the code it is drawn in. */
export interface Sitter {
  code: number;
  dino: DinoId;
  pose: PoseId;
  card: THREE.Mesh;
  /** The share of the card's rectangle its picture fills. */
  coverage: number;
}

let photoTarget: THREE.WebGLRenderTarget | undefined;
let mapTarget: THREE.WebGLRenderTarget | undefined;
let photoPixels = new Uint8Array(0);
let mapPixels = new Uint8Array(0);
const black = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
const blackClear = new THREE.Color(0x000000);
const corner = new THREE.Vector3();

/** A picture size with the given longer side and the shape of the view. */
function sized(longest: number, aspect: number): [number, number] {
  return aspect >= 1 ? [longest, Math.round(longest / aspect / 2) * 2] : [Math.round((longest * aspect) / 2) * 2, longest];
}

/** The picture itself, read back before returning; only the encoding into a file happens afterwards. */
function takePicture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): Promise<Blob> {
  if (!photoTarget) {
    photoTarget = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
    // stored as sRGB, so the pixels read back are ready to save as they are
    photoTarget.texture.colorSpace = THREE.SRGBColorSpace;
  }
  photoTarget.setSize(width, height);
  if (photoPixels.length !== width * height * 4) photoPixels = new Uint8Array(width * height * 4);
  renderer.setRenderTarget(photoTarget);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(photoTarget, 0, 0, width, height, photoPixels);

  // WebGL counts rows from the bottom; pictures count from the top
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) image.data.set(photoPixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => {
    const done = (blob: Blob | null) => (blob ? resolve(blob) : reject(new Error('could not encode the photo')));
    // browsers that cannot write WebP hand back a PNG here, so ask for JPEG instead
    canvas.toBlob((blob) => (blob && blob.type === 'image/webp' ? resolve(blob) : canvas.toBlob(done, 'image/jpeg', 0.9)), 'image/webp', 0.9);
  });
}

/**
 * How many who-is-where pixels the whole dinosaur would cover if nothing hid it and the frame had no edges:
 * the area of its card on screen, times the share of the card its picture fills.
 */
function wholeSize(sitter: Sitter, camera: THREE.Camera, width: number, height: number): number {
  const xs: number[] = [], ys: number[] = [];
  for (const [x, y] of CARD_CORNERS) {
    corner.set(x, y, 0).applyMatrix4(sitter.card.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    if (corner.z > -0.05) return Infinity; // part of it is beside or behind the camera
    corner.applyMatrix4(camera.projectionMatrix);
    xs.push((corner.x * width) / 2);
    ys.push((corner.y * height) / 2);
  }
  let area = 0;
  for (let i = 0; i < 4; i++) area += xs[i] * ys[(i + 1) % 4] - xs[(i + 1) % 4] * ys[i];
  return (Math.abs(area) / 2) * sitter.coverage;
}

/** Works out who is in the picture and how well, from a flat-colour drawing of the same frame. */
function measure(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, sitters: Sitter[], width: number, height: number) {
  mapTarget ??= new THREE.WebGLRenderTarget(width, height);
  mapTarget.setSize(width, height);
  if (mapPixels.length !== width * height * 4) mapPixels = new Uint8Array(width * height * 4);

  // swap every material for its flat one: dinosaurs in their own colour, everything else black
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    if (mesh.userData.notInFlat) {
      mesh.visible = false;
      hidden.push(mesh);
      return;
    }
    swapped.push([mesh, mesh.material]);
    mesh.material = mesh.userData.flat ?? black;
  });
  const background = scene.background;
  const shadows = renderer.shadowMap.autoUpdate;
  scene.background = blackClear;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(mapTarget);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(mapTarget, 0, 0, width, height, mapPixels);
  for (const [mesh, material] of swapped) mesh.material = material;
  for (const o of hidden) o.visible = true;
  scene.background = background;
  renderer.shadowMap.autoUpdate = shadows;

  interface Tally { count: number; near: number; sumX: number; sumY: number }
  const tallies = new Map<number, Tally>();
  const cx = width / 2, cy = height / 2, aim = Math.min(width, height) * AIM_RADIUS;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const code = mapPixels[(y * width + x) * 4];
      if (!code) continue;
      let t = tallies.get(code);
      if (!t) tallies.set(code, (t = { count: 0, near: 0, sumX: 0, sumY: 0 }));
      t.count++;
      t.sumX += x;
      t.sumY += y;
      if (Math.hypot(x - cx, y - cy) <= aim) t.near++;
    }
  }

  const seen: (PhotoSubject & { near: number })[] = [];
  for (const sitter of sitters) {
    const t = tallies.get(sitter.code);
    if (!t) continue;
    seen.push({
      dino: sitter.dino,
      pose: sitter.pose,
      frameShare: t.count / (width * height),
      visibleShare: Math.min(1, t.count / wholeSize(sitter, camera, width, height)),
      centreOffset: Math.min(1, Math.hypot(t.sumX / t.count - cx, t.sumY / t.count - cy) / Math.hypot(cx, cy)),
      near: t.near,
    });
  }

  // A sliver of tail at the edge of the frame is not a photo of a dinosaur: enough of the animal has to be in the
  // picture, or it has to be a proper close-up. Of those, the subject is whoever fills most of the middle of the
  // frame; failing that, the biggest.
  const fair = seen.filter((s) => s.frameShare >= SMALLEST_SUBJECT && (s.visibleShare >= ENOUGH_OF_IT || s.frameShare >= CLOSE_UP));
  const subject = fair.filter((s) => s.near > 0).sort((a, b) => b.near - a.near)[0] ?? fair.sort((a, b) => b.frameShare - a.frameShare)[0];
  const strip = ({ near: _near, ...rest }: PhotoSubject & { near: number }): PhotoSubject => rest;
  return { subject: subject && strip(subject), others: seen.filter((s) => s !== subject).map(strip) };
}

/**
 * Takes the photo and its measurements. Everything is drawn and read back before this returns, so the picture
 * and the measurements describe the same moment as the frame on screen.
 */
export function capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, sitters: Sitter[]): Shot {
  const [width, height] = sized(PHOTO_SIZE, camera.aspect);
  const image = takePicture(renderer, scene, camera, width, height);
  const measured = measure(renderer, scene, camera, sitters, ...sized(MAP_SIZE, camera.aspect));
  renderer.setRenderTarget(null);
  return { image, width, height, ...measured };
}
