// Makes the app's icons and its link-preview picture from art that is already in the project.
//
//   npm run icons
//
//   public/favicon.ico            16, 32 and 48 pixel browser tab icon
//   public/icon-192.png           home-screen icons for Android (see public/manifest.webmanifest)
//   public/icon-512.png
//   public/icon-maskable-512.png  the same, filling the whole square so Android can cut its own shape
//   public/apple-touch-icon.png   home-screen icon for iPhones and iPads
//   public/og.jpg                 the picture shown when a link to the app is shared
//   android/app/src/main/res/mipmap-*/   launcher icons for the Android app
//
// The icon is the Dino Safari logo, as large as it will go, on the jungle's grass. At tab-icon size the
// logo would be a smudge, so the favicon is just the logo's dinosaur with its camera.
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const art = (name) => join(pub, 'art', `${name}.webp`);
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const grass = await sharp(art('levels/level-1/ground/grass')).png().toBuffer();
const logo = await sharp(art('ui/logo')).trim().png().toBuffer();
// the dinosaur peeking over the top of the logo, with its camera
const logoSize = await sharp(logo).metadata();
const mascot = await sharp(logo)
  .extract({ left: Math.round(logoSize.width * 0.24), top: 0, width: Math.round(logoSize.width * 0.6), height: Math.round(logoSize.height * 0.41) })
  .trim()
  .png()
  .toBuffer();

/** The logo or its dinosaur, fitted inside a square `side` pixels across. */
const mark = (which, side) => sharp(which === 'mascot' ? mascot : logo).resize({ width: side, height: side, fit: 'inside' }).png().toBuffer();

/** A square of grass, darkened towards the edges. */
async function tile(size) {
  const shade = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs><radialGradient id="v" cx="50%" cy="50%" r="72%">
        <stop offset="0.45" stop-color="#0b2a12" stop-opacity="0"/><stop offset="1" stop-color="#0b2a12" stop-opacity="0.6"/>
      </radialGradient></defs>
      <rect width="${size}" height="${size}" fill="url(#v)"/>
    </svg>`,
  );
  return sharp(grass).resize(size, size).composite([{ input: shade }]).png().toBuffer();
}

/**
 * A square icon: the logo (or, for `which: 'mascot'`, its dinosaur) on a tile of grass.
 * `corner` rounds the tile (as a fraction of its size); `fill` is how much of the tile's width the mark may take.
 */
async function icon(size, { corner = 0, fill = 0.9, which = 'logo' } = {}) {
  const top = await mark(which, Math.round(size * fill));
  const m = await sharp(top).metadata();
  const left = Math.round((size - m.width) / 2);
  const y = Math.round((size - m.height) / 2);
  const flat = await sharp(await tile(size)).composite([{ input: top, left, top: y }]).png().toBuffer();
  if (!corner) return flat;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * corner}" fill="#fff"/></svg>`,
  );
  return sharp(flat).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** An .ico file holding the given PNG pictures (each one square, and smaller than 256 pixels). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, n) => {
    const at = 6 + 16 * n;
    header.writeUInt8(size, at);
    header.writeUInt8(size, at + 1);
    header.writeUInt16LE(1, at + 4); // colour planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

async function write(name, data) {
  await writeFile(join(pub, name), data);
  console.log(`wrote public/${name}`);
}

// The tab icon is a rounded tile with the dinosaur nearly filling it, so it still reads at 16 pixels.
const tab = { corner: 0.22, fill: 0.94, which: 'mascot' };
await write('favicon.ico', ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await icon(size, tab) })))));
await write('icon-192.png', await icon(192, { corner: 0.22 }));
await write('icon-512.png', await icon(512, { corner: 0.22 }));
// Android may crop a maskable icon to a circle 80% of its width, so the logo stays inside that.
await write('icon-maskable-512.png', await icon(512, { fill: 0.68 }));
// iOS rounds the corners itself, and shows black wherever an icon is see-through.
await write('apple-touch-icon.png', await icon(180));

// The Android app's launcher icons, one set for each screen density, if the Android project is there.
// Newer Android builds the icon from two layers, a background and a foreground, each 108 units square,
// and cuts its own shape out of the middle 72: so the background is the grass and the foreground is the
// logo, kept well inside. The other two pictures are whole icons, for older launchers.
const res = join(root, 'android/app/src/main/res');
if (existsSync(res)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [density, scale] of Object.entries(densities)) {
    const size = 48 * scale;
    const full = 108 * scale;
    const top = await mark('logo', Math.round(full * 0.58));
    const m = await sharp(top).metadata();
    const y = Math.round((full - m.height) / 2);
    const x = Math.round((full - m.width) / 2);
    const files = {
      'ic_launcher.png': await icon(size, { corner: 0.22 }),
      'ic_launcher_round.png': await icon(size, { corner: 0.5, fill: 0.74 }),
      'ic_launcher_background.png': await tile(full),
      'ic_launcher_foreground.png': await sharp(top)
        .extend({ top: y, bottom: full - m.height - y, left: x, right: full - m.width - x, background: CLEAR })
        .png()
        .toBuffer(),
    };
    for (const [name, data] of Object.entries(files)) {
      await writeFile(join(res, `mipmap-${density}`, name), data);
      console.log(`wrote android/app/src/main/res/mipmap-${density}/${name}`);
    }
  }
}

// The link preview, kept simple: the two levels' pictures side by side, dimmed, with the logo over them.
const OG_W = 1200;
const OG_H = 630;
const halves = ['ui/card-level-1', 'ui/card-level-2'];
const backdrop = await sharp({ create: { width: OG_W, height: OG_H, channels: 3, background: '#1d4a2b' } })
  .composite(
    await Promise.all(
      halves.map(async (id, i) => ({ input: await sharp(art(id)).resize(OG_W / 2, OG_H, { fit: 'cover' }).toBuffer(), left: (i * OG_W) / 2, top: 0 })),
    ),
  )
  .png()
  .toBuffer();
const dim = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
    <defs><radialGradient id="d" cx="50%" cy="50%" r="65%">
      <stop offset="0" stop-color="#0d2416" stop-opacity="0.62"/><stop offset="1" stop-color="#0d2416" stop-opacity="0.25"/>
    </radialGradient></defs>
    <rect width="${OG_W}" height="${OG_H}" fill="url(#d)"/>
  </svg>`,
);
const title = await sharp(logo).resize(OG_W - 420, OG_H - 110, { fit: 'inside' }).png().toBuffer();
const t = await sharp(title).metadata();
await write(
  'og.jpg',
  await sharp(backdrop)
    .composite([{ input: dim }, { input: title, left: Math.round((OG_W - t.width) / 2), top: Math.round((OG_H - t.height) / 2) }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer(),
);
