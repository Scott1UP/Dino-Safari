// The world the cut-outs stand in, built for whichever level is being played: camera, sky and far layers, haze,
// the ground and the sun. The renderer is made once and shared by every level.

import * as THREE from 'three';
import { groundHeight, level, mountainHeight, railHeight, railX, roofHeight, smooth, tile, tunnelAt } from '../data/level';

/** Direction from the ground towards the sun: behind the scenery and to the left, so shadows fall towards the track. */
const SUN = new THREE.Vector3(-0.35, 1, -0.55).normalize();

const SHADOW_MAP = 1024;
/** Half the width of the square of ground, centred ahead of the camera, that gets shadows. */
const SHADOW_REACH = 42;
/** How dark a shadow is: the share of full brightness left in the shade. */
const SHADE = 0.66;
/** How much light the ground keeps inside a tunnel, and the colour of the gloom in there. */
const UNDERGROUND = 0.42;
const GLOOM = new THREE.Color(0x1c1226);

/** How far underground a spot is: 0 in the open, 1 well inside a tunnel and within its walls. */
function underground(s: number, side: number): number {
  const t = tunnelAt(s);
  return t ? t.inside * (1 - smooth(t.halfWidth, t.halfWidth + 3, Math.abs(side))) : 0;
}

/** Metres of world covered by one repeat of a ground tile. */
const TILE = 7;


export interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Keeps the sky and the shadowed patch of ground with the camera, and the river flowing. Call once a frame. */
  update(time: number): void;
  /** Low graphics draws at the screen's plain resolution with a smaller shadow map. */
  setLowGraphics(low: boolean): void;
  /** Frees everything the level put on the graphics card. */
  dispose(): void;
}

const textures = new THREE.TextureLoader();

export async function loadTexture(url: string): Promise<THREE.Texture> {
  const texture = await textures.loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

async function loadTile(url: string): Promise<THREE.Texture> {
  const texture = await loadTexture(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Average colour of one row of a picture (0 = top, 1 = bottom). */
function rowColour(image: CanvasImageSource, row: number): THREE.Color {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, 8, 32);
  const px = ctx.getImageData(0, Math.min(31, Math.floor(row * 32)), 8, 1).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) {
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
  }
  return new THREE.Color().setRGB(r / 2040, g / 2040, b / 2040, THREE.SRGBColorSpace);
}

/**
 * A strip of ground that follows the track: from `from` to `to` along it and between two side offsets.
 * It is tiled in world units, lies `lift` above the land (or level at `y`), and can fade in and out at its ends.
 */
function ribbon(o: { from: number; to: number; near: number; far: number; lift?: number; y?: number; fade?: number; across?: boolean }): THREE.BufferGeometry {
  const along = Math.ceil((o.to - o.from) / 2), across = Math.max(1, Math.ceil((o.far - o.near) / 2.5));
  const position: number[] = [], uv: number[] = [], colour: number[] = [], index: number[] = [];
  for (let i = 0; i <= along; i++) {
    const s = o.from + ((o.to - o.from) * i) / along;
    for (let j = 0; j <= across; j++) {
      const side = o.near + ((o.far - o.near) * j) / across;
      const x = railX(s) + side;
      position.push(x, o.y ?? groundHeight(x, -s) + (o.lift ?? 0), -s);
      // `across` fits one tile across the strip's width, for rails; otherwise it is tiled in world metres
      uv.push(o.across ? (side - o.near) / (o.far - o.near) : side / TILE, s / (o.across ? o.far - o.near : TILE));
      const edge = o.fade ? smooth(0, o.fade, s - o.from) * smooth(0, o.fade, o.to - s) * smooth(0, o.fade, side - o.near) * smooth(0, o.fade, o.far - side) : 1;
      // the ground is dimmer underground
      const light = 1 - (1 - UNDERGROUND) * underground(s, side);
      colour.push(light, light, light, edge);
    }
  }
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j, b = a + 1, c = a + across + 1, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 4));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

/** Builds the world of the level being played (see `useLevel`). */
export async function buildWorld(renderer: THREE.WebGLRenderer): Promise<World> {
  const LAND = { width: 260, from: -70, to: level.length + 150 };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.3, 1200);
  camera.rotation.order = 'YXZ';

  const [skyMap, ground, path, backdropMap, ...rest] = await Promise.all([
    loadTexture(level.sky), loadTile(level.ground), loadTile(level.path.tile), loadTexture(level.backdrop.sprite),
    ...level.far.map((f) => loadTexture(f)),
    ...level.overlays.map((o) => loadTile(o.tile)),
    ...(level.channel ? [loadTile(level.channel.tile)] : []),
  ]);
  const farMaps = rest.slice(0, level.far.length);
  const overlayMaps = rest.slice(level.far.length, level.far.length + level.overlays.length);
  const channelMap = level.channel ? rest[rest.length - 1] : undefined;

  // --- sky: one picture wrapped round a wide drum that travels with the camera
  skyMap.wrapS = THREE.MirroredRepeatWrapping;
  skyMap.repeat.x = 6;
  const image = skyMap.image as HTMLImageElement;
  const radius = 700;
  const drumHeight = ((2 * Math.PI * radius) / skyMap.repeat.x) * (image.height / image.width);
  const sky = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, drumHeight, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.position.y = drumHeight / 2 - 26;
  sky.renderOrder = -2;
  scene.add(sky);
  scene.background = rowColour(image, 0);
  // haze: far cut-outs fade towards the colour of the sky just above the hills
  const openFog = rowColour(image, 0.62);
  const fog = new THREE.Fog(openFog.clone(), 45, 170);
  scene.fog = fog;

  // --- far layers: hazy ridges either side of the route and the volcano at its end. They do not fade with the haze.
  const farPlane = (map: THREE.Texture, width: number) => {
    const img = map.image as HTMLImageElement;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * img.height) / img.width).translate(0, (width * img.height) / img.width / 2, 0),
      new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, fog: false, side: THREE.DoubleSide }),
    );
    mesh.renderOrder = -1;
    scene.add(mesh);
    return mesh;
  };
  let n = 0;
  for (let s = -80; s < level.length + 200; s += 150) {
    for (const side of [-1, 1]) {
      const strip = farPlane(farMaps[n++ % farMaps.length], 210);
      strip.position.set(railX(s) + side * (125 + (n % 3) * 14), -6, -s - (side > 0 ? 60 : 0));
      strip.rotation.y = (-side * Math.PI) / 2;
    }
  }
  farPlane(backdropMap, level.backdrop.width).position.set(railX(level.length) + level.backdrop.side, -8, -(level.length + level.backdrop.beyond));

  // --- the land
  const length = LAND.to - LAND.from;
  const geometry = new THREE.PlaneGeometry(LAND.width, length, 86, Math.round(length / 3));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -(LAND.from + LAND.to) / 2);
  const at = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < at.count; i++) {
    at.setY(i, groundHeight(at.getX(i), at.getZ(i)));
    uv.setXY(i, at.getX(i) / TILE, -at.getZ(i) / TILE);
  }
  // the land is dimmer underground
  const shade = new Float32Array(at.count * 3);
  for (let i = 0; i < at.count; i++) {
    const s = -at.getZ(i);
    shade.fill(1 - (1 - UNDERGROUND) * underground(s, at.getX(i) - railX(s)), i * 3, i * 3 + 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  geometry.computeVertexNormals();
  const land = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: ground, vertexColors: true }));
  land.receiveShadow = true;
  scene.add(land);

  const layer = (geometry: THREE.BufferGeometry, map: THREE.Texture, order: number, fades = false) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
      map, vertexColors: true, transparent: fades, depthWrite: !fades,
      polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order,
    }));
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    scene.add(mesh);
    return mesh;
  };
  // other ground laid over stretches of the route, fading in and out
  for (const [i, o] of level.overlays.entries()) {
    layer(ribbon({ from: o.from, to: Math.min(o.to, LAND.to - 2), near: -110, far: 110, lift: 0.02, fade: 16 }), overlayMaps[i], 1, true);
  }
  // the track: a dark pen line with the path, or the rails, on top
  const ink = new THREE.Mesh(
    ribbon({ from: LAND.from + 2, to: LAND.to - 2, near: -2.5, far: 2.5, lift: 0.03 }),
    new THREE.MeshBasicMaterial({ color: 0x33291a, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  ink.renderOrder = 2;
  scene.add(ink);
  layer(ribbon({ from: LAND.from + 2, to: LAND.to - 2, near: -2.25, far: 2.25, lift: 0.05, across: level.path.across }), path, 3);
  // the river, of water or lava: a level sheet lying in its bed
  const ch = level.channel;
  if (ch && channelMap) {
    const [near, farEdge] = ch.side > 0 ? [ch.near - 1, ch.far + 2] : [-(ch.far + 2), -(ch.near - 1)];
    const sheet = layer(ribbon({ from: ch.from, to: ch.to, near, far: farEdge, y: ch.surface }), channelMap, 0);
    // lava is not shaded or shadowed: it glows
    if (ch.glows) (sheet as THREE.Mesh).material = new THREE.MeshBasicMaterial({ map: channelMap });
  }

  // --- tunnels and caverns: a real roof of rock over stretches of the route
  let rock: THREE.Texture | undefined;
  if (level.tunnels.length) {
    rock = await loadTile(tile(2, 'cave'));
    const stone = new THREE.MeshLambertMaterial({ map: rock, side: THREE.DoubleSide, color: 0x8f8794 });
    // the outside of the mountain is the same rock in daylight
    const hillside = new THREE.MeshLambertMaterial({ map: rock, side: THREE.DoubleSide, color: 0xd9cfdc });
    const ARCH = 18;
    for (const t of level.tunnels) {
      const from = t.shape[0][0], to = t.shape[t.shape.length - 1][0];
      // The shell: an arch over the track, swelling and narrowing along its length. Its feet go well below the
      // ground, so no gap shows where the land rises and falls.
      const position: number[] = [], uvs: number[] = [], index: number[] = [];
      const rings = Math.ceil((to - from) / 2);
      for (let i = 0; i <= rings; i++) {
        const s = from + ((to - from) * i) / rings;
        const here = tunnelAt(s)!;
        const cx = railX(s), base = railHeight(s);
        const girth = (Math.PI * (here.halfWidth + here.height)) / 2;
        for (let j = 0; j <= ARCH + 2; j++) {
          // the first and last points are the feet, straight down from the ends of the arch
          const a = (Math.PI * Math.min(ARCH, Math.max(0, j - 1))) / ARCH;
          const foot = j === 0 || j === ARCH + 2;
          position.push(cx - Math.cos(a) * here.halfWidth, base + (foot ? -6 : Math.sin(a) * here.height), -s);
          uvs.push((girth * (j - 1)) / ARCH / TILE + (foot ? (j ? 6 : -6) / TILE : 0), s / TILE);
        }
      }
      const across = ARCH + 3;
      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < across - 1; j++) {
          const a = i * across + j, b = a + 1, c = a + across, d = c + 1;
          index.push(a, c, b, b, c, d);
        }
      }
      const shell = new THREE.BufferGeometry();
      shell.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      shell.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      shell.setIndex(index);
      shell.computeVertexNormals();
      scene.add(new THREE.Mesh(shell, stone));

      // The mountain the tunnel runs through. It is a real hillside over the whole underground stretch, and a
      // cutting through it leads the track to each mouth, where a rock face rises from the arch.
      const columns: number[] = [];
      for (let side = -130; side <= 130; side += Math.abs(side) < 32 ? 0.8 : 6) columns.push(side);
      // rows of the hillside: outside before the mouth, inside between the mouths, outside after. The rows at
      // each mouth come twice, once for each side of the rock face.
      const rows: { s: number; inside: boolean }[] = [];
      for (let s = from - 24; s < from; s += 3) rows.push({ s, inside: false });
      rows.push({ s: from - 0.01, inside: false });
      for (let s = from; s < to; s += 3) rows.push({ s, inside: true });
      rows.push({ s: to, inside: true }, { s: to + 0.01, inside: false });
      for (let s = to + 3; s <= to + 24; s += 3) rows.push({ s, inside: false });

      const hill: number[] = [], hillUv: number[] = [], hillIndex: number[] = [];
      const heights: number[] = [];
      for (const row of rows) {
        const mouth = tunnelAt(row.inside ? row.s : row.s < from ? from : to)!;
        const atMouth = !row.inside && (Math.abs(row.s - from) < 0.1 || Math.abs(row.s - to) < 0.1);
        for (const side of columns) {
          const x = railX(row.s) + side;
          const rise = mountainHeight(row.s, side);
          // right at a mouth, the bottom edge of the rock face follows the arch
          const y = atMouth && Math.abs(side) < mouth.halfWidth ? railHeight(row.s) + roofHeight(mouth, side) : groundHeight(x, -row.s) + rise;
          hill.push(x, y, -row.s);
          hillUv.push(x / TILE, (row.s + y) / TILE);
          heights.push(rise);
        }
      }
      const wide = columns.length;
      for (let i = 0; i < rows.length - 1; i++) {
        const a0 = rows[i], a1 = rows[i + 1];
        // the strip of ground running up to a mouth is left open across the track, or it would block the way in
        const approach = (!a0.inside && !a1.inside) && (Math.abs(a1.s - from) < 0.1 || Math.abs(a0.s - to) < 0.1);
        const mouth = tunnelAt(Math.abs(a1.s - from) < 4 ? from : to)!;
        for (let j = 0; j < wide - 1; j++) {
          const a = i * wide + j, b = a + 1, c = a + wide, d = c + 1;
          if (approach && Math.abs(columns[j]) < mouth.halfWidth + 0.5 && Math.abs(columns[j + 1]) < mouth.halfWidth + 0.5) continue;
          // where the mountain has run out, the land itself shows
          if (Math.max(heights[a], heights[b], heights[c], heights[d]) < 0.06) continue;
          hillIndex.push(a, b, c, b, d, c);
        }
      }
      const mountain = new THREE.BufferGeometry();
      mountain.setAttribute('position', new THREE.Float32BufferAttribute(hill, 3));
      mountain.setAttribute('uv', new THREE.Float32BufferAttribute(hillUv, 2));
      mountain.setIndex(hillIndex);
      mountain.computeVertexNormals();
      const side = new THREE.Mesh(mountain, hillside);
      side.receiveShadow = true;
      scene.add(side);
    }
  }

  // --- light. Only the ground is lit; cut-outs are unlit so their colours stay as drawn.
  // Flat ground in full sun comes out at the picture's own colours, and in shade at SHADE of them.
  scene.add(new THREE.AmbientLight(0xffffff, SHADE * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, ((1 - SHADE) * Math.PI) / SUN.y);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const box = sun.shadow.camera;
  box.left = box.bottom = -SHADOW_REACH;
  box.right = box.top = SHADOW_REACH;
  box.near = 1;
  box.far = 240;
  box.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  // The shadowed square moves in whole shadow-map pixels, so shadow edges don't shimmer as the camera rides along.
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN).normalize();
  const up = new THREE.Vector3().crossVectors(SUN, right).normalize();
  const texel = (SHADOW_REACH * 2) / SHADOW_MAP;
  const ahead = new THREE.Vector3();
  const centre = new THREE.Vector3();

  const update = (time: number) => {
    // underground the haze turns to gloom, and closes in: more so the darker the tunnel
    const t = tunnelAt(-camera.position.z);
    const deep = t ? t.inside : 0, dark = t ? t.dark : 0;
    fog.color.lerpColors(openFog, GLOOM, deep);
    fog.near = THREE.MathUtils.lerp(45, THREE.MathUtils.lerp(16, 7, dark), deep);
    fog.far = THREE.MathUtils.lerp(170, THREE.MathUtils.lerp(95, 52, dark), deep);
    sky.position.x = camera.position.x;
    sky.position.z = camera.position.z;
    channelMap?.offset.set(Math.sin(time * 0.3) * 0.03, time * (level.channel?.glows ? 0.012 : 0.035));
    camera.getWorldDirection(ahead);
    centre.copy(camera.position).addScaledVector(ahead.setY(0).normalize(), SHADOW_REACH * 0.7);
    const r = Math.round(centre.dot(right) / texel) * texel;
    const u = Math.round(centre.dot(up) / texel) * texel;
    sun.target.position.copy(right).multiplyScalar(r).addScaledVector(up, u).addScaledVector(SUN, centre.dot(SUN));
    sun.position.copy(sun.target.position).addScaledVector(SUN, 120);
  };

  const setLowGraphics = (low: boolean) => {
    renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2));
    const size = low ? SHADOW_MAP / 2 : SHADOW_MAP;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      // the old shadow map is thrown away, and a new one is made at the new size
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };

  const dispose = () => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // (cut-outs share one geometry and their pictures' materials, which are freed with the pictures)
      if (!mesh.userData.flat) {
        mesh.geometry.dispose();
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
      }
    });
    for (const map of [skyMap, ground, path, backdropMap, ...rest]) map.dispose();
    rock?.dispose();
    sun.shadow.map?.dispose();
  };

  return { scene, camera, update, setLowGraphics, dispose };
}
