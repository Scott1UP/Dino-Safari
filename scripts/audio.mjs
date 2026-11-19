// Sound pipeline (ElevenLabs). Run through npm so the API key is loaded:
//
//   npm run audio -- sfx            generate any missing sound effects
//   npm run audio -- voice          generate any missing guide voice lines
//   npm run audio -- level          raise any quiet sound effects to full volume (needs ffmpeg)
//   npm run audio -- music          generate the ride music: ONE piece, ONE take, and only if it is missing
//   npm run audio -- redo <id...>   delete and regenerate named effects or voice lines (never music)
//
// Everything is written straight to public/audio/. Files that already exist are left alone, so nothing is ever
// generated twice by accident. Music is expensive: it is never part of any other command, and there is no loop
// of takes. To replace the music, delete public/audio/music/ride.mp3 yourself and run `music` again.

import { mkdir, writeFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'audio');
const API = 'https://api.elevenlabs.io/v1';
const FORMAT = 'output_format=mp3_44100_128';

/** A take whose loudest moment is quieter than this (in dB) is a dud. */
const QUIETEST_TAKE = -32;

const CUTE = 'Cartoon, friendly and funny, for a young child, not scary.';

/** id: [what it sounds like, seconds, loops?] */
export const SFX = {
  // --- camera and things to play with
  shutter: ['A crisp camera shutter click followed by a quick film-wind whirr.', 1],
  // one hit: the game plays it three times in a row
  drum: ['One loud, punchy hit on a big tribal hide drum: boom. Close, dry and powerful. Only the drum, nothing else.', 1.6],
  zoom: ['A short, smooth camera lens zoom motor whirr.', 0.6],
  throw: ['A quick soft whoosh of something being thrown.', 0.6],
  bounce: ['A soft, bouncy thud of a fruit landing on grass.', 0.5],
  munch: [`A dinosaur happily munching juicy fruit: crunchy, slurpy chewing and a contented gulp. ${CUTE}`, 2.5],
  pop: ['A small, soft bubble pop.', 0.5],
  // --- review and binder
  star: ['One bright, sparkly chime ding.', 0.8],
  stamp: ['A rubber stamp thump followed by a sparkly, magical twinkle.', 1.5],
  keep: ['A photo sliding into a plastic sleeve, then a soft happy ding.', 1],
  bin: ['A sheet of paper being scrunched up and tossed.', 0.9],
  page: ['A thick binder page being turned.', 0.7],
  tada: ['A short, happy ta-da on xylophone and ukulele.', 2.5],
  // --- the world
  jungle: ['Calm prehistoric jungle ambience: soft insects, gentle wind in big leaves, a few distant hoots and chirps. No music.', 12, true],
  river: ['A gentle river babbling over stones. No music.', 8, true],
  rustle: ['Something moving through ferns and leaves: a quick rustle.', 1.2],
  splash: ['A big, fun splash of something large jumping in water.', 1.5],
  stomp: ['One very heavy, deep footstep thud that shakes the ground.', 0.9],
  rumble: ['A low volcano rumble, deep and rolling.', 3],
  flap: ['Big leathery wings flapping three times.', 1.3],
  // --- dinosaur calls
  'call-trike': [`A Triceratops call: a short, happy, snorty bellow. ${CUTE}`, 1.5],
  'call-spino': [`A Spinosaurus call: a deep, gurgly, crocodile-like grumble. ${CUTE}`, 1.8],
  'call-para': [`A Parasaurolophus call: a long, musical, trombone-like honk. ${CUTE}`, 2],
  'call-raptor': [`A Velociraptor call: quick, excited, bird-like chirps and a squeak. ${CUTE}`, 1.2],
  'call-dilo': [`A Dilophosaurus call: a playful, warbling hoot. ${CUTE}`, 1.3],
  'call-brachio': [`A Brachiosaurus call: a long, low, gentle, whale-like moo. ${CUTE}`, 2.5],
  'call-stego': [`A Stegosaurus call: a low, sleepy, rumbling grunt. ${CUTE}`, 1.5],
  'call-anky': [`An Ankylosaurus call: a gruff, snuffly snort and a huff. ${CUTE}`, 1.3],
  'call-ptera': [`A Pteranodon call: a loud, funny, seagull-like squawk. ${CUTE}`, 1.2],
  'call-rex': [`A Tyrannosaurus rex call: a short, rumbly growl ending in a friendly huff. ${CUTE}`, 1.5],
  // --- level 2, the Volcano Mine
  cart: ['A wooden mine cart rolling along iron rails: a steady clatter and rattle of wheels, with a gentle squeak. No music.', 8, true],
  lava: ['Thick lava slowly bubbling and glooping, with a low hiss. No music.', 8, true],
  geyser: ['A geyser erupting: a rushing whoosh of steam and water shooting up, then pattering down.', 2.5],
  chime: ['A soft, sparkling chime, like crystals ringing.', 1.5],
  'call-pachy': [`A Pachycephalosaurus call: a short, bold, goat-like bleat and a snort. ${CUTE}`, 1.3],
  'call-carno': [`A Carnotaurus call: a gruff, bull-like snorting bellow. ${CUTE}`, 1.6],
  'call-kentro': [`A Kentrosaurus call: a low, grumbly, rattling grunt. ${CUTE}`, 1.4],
  'call-troodon': [`A Troodon call: a quick, curious, owl-like hoot and a chirp. ${CUTE}`, 1.2],
  'call-dimorph': [`A Dimorphodon call: a small, squeaky, bat-like chitter. ${CUTE}`, 1.1],
  'call-utah': [`A Utahraptor call: an excited, raspy, bird-like screech. ${CUTE}`, 1.3],
  'call-theri': [`A Therizinosaurus call: a long, soft, goose-like honk. ${CUTE}`, 1.8],
  'call-styraco': [`A Styracosaurus call: a deep, snorty, rhino-like bellow. ${CUTE}`, 1.5],
  'call-quetzal': [`A Quetzalcoatlus call: a huge, echoing, crane-like trumpet. ${CUTE}`, 1.8],
  'call-giga': [`A Giganotosaurus call: a very deep, rumbling growl ending in a friendly huff. ${CUTE}`, 1.8],
  roar: ['A huge Tyrannosaurus rex roar: mighty and thrilling, but cartoonish and fun rather than frightening.', 3],
};

/** What the guide says. Nothing in the game needs reading, so these carry all the teaching. */
export const VOICE = {
  welcome: 'Welcome to Dino Safari! Let\'s go and find some dinosaurs!',
  'teach-look': 'Slide your finger to look around.',
  'teach-photo': 'Look, a Triceratops! Press the big red button to take a photo!',
  river: 'Ooh, listen! Something is splashing in the river!',
  ferns: 'Shh... I think something is hiding in the ferns.',
  'teach-fruit': 'They look hungry! Drag a fruit out and throw it to them!',
  'teach-drum': 'It\'s very quiet up here. Bang the drum, and see who comes out!',
  finale: 'Uh oh. Can you feel that? Something big is coming!',
  rex: 'It\'s a T. rex! Quick, take a photo!',
  'ride-end': 'What a ride! Let\'s look at your photos.',
  great: 'Great shot!',
  wow: 'Wow! That one is amazing!',
  new: 'A new one for your binder!',
  choose: 'Which one do you want to keep?',
  none: 'No dinosaurs this time. Let\'s ride again!',
  complete: 'You found every single one! You are a dinosaur expert!',
  'name-trike': 'Triceratops!',
  'name-spino': 'Spinosaurus!',
  'name-para': 'Parasaurolophus!',
  'name-raptor': 'Velociraptor!',
  'name-dilo': 'Dilophosaurus!',
  'name-brachio': 'Brachiosaurus!',
  'name-stego': 'Stegosaurus!',
  'name-anky': 'Ankylosaurus!',
  'name-ptera': 'Pteranodon!',
  'name-rex': 'Tyrannosaurus rex!',
  // --- level 2, the Volcano Mine
  'l2-welcome': 'Welcome to the Volcano Mine! Hold on tight to the mine cart!',
  'l2-first': 'Look! A Pachycephalosaurus, bashing the rocks with its head!',
  'l2-lava': 'Careful! That river is hot, glowing lava.',
  'l2-drop': 'Here comes a big drop! Wheee!',
  'l2-crystals': 'Look at all the crystals. It\'s very quiet. Bang the drum, and see who is hiding!',
  'l2-springs': 'Hot springs! The dinosaurs here look hungry. Throw them some fruit!',
  'l2-rim': 'Look up! Something enormous is flying over the crater.',
  'l2-finale': 'The ground is shaking. Here comes a Gigantosaurus!',
  'name-pachy': 'Pachycephalosaurus!',
  'name-carno': 'Carnotaurus!',
  'name-kentro': 'Kentrosaurus!',
  'name-troodon': 'Troodon!',
  'name-dimorph': 'Dimorphodon!',
  'name-utah': 'Utahraptor!',
  'name-theri': 'Therizinosaurus!',
  'name-styraco': 'Styracosaurus!',
  'name-quetzal': 'Quetzalcoatlus!',
  'name-giga': 'Gigantosaurus!',
};

/** The one piece of music. */
export const MUSIC = {
  id: 'ride',
  seconds: 60,
  prompt:
    'A gentle, cheerful, bouncy adventure tune for a young child\'s dinosaur safari ride: marimba and ukulele melody, ' +
    'soft hand percussion and shakers, pizzicato bass, a little wooden flute. Warm, curious and playful, never loud or ' +
    'tense, at a relaxed walking pace of about 100 beats a minute. Instrumental. It is one steady section that can ' +
    'loop: it starts and ends on the same simple phrase, with no intro build-up and no big ending.',
};

const exists = (p) => access(p).then(() => true, () => false);

async function eleven(endpoint, body) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set (put it in .env.local)');
  const res = await fetch(`${API}/${endpoint}${endpoint.includes('?') ? '&' : '?'}${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function each(folder, entries, make) {
  await mkdir(path.join(OUT, folder), { recursive: true });
  let failed = 0;
  const queue = Object.entries(entries);
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [id, entry] = next;
      const file = path.join(OUT, folder, `${id}.mp3`);
      if (await exists(file)) continue;
      try {
        await writeFile(file, await make(entry));
        console.log(`[${folder}/${id}] written`);
      } catch (err) {
        failed++;
        console.error(`[${folder}/${id}] FAILED: ${err.message}`);
      }
    }
  }));
  if (failed) process.exitCode = 1;
}

/** The loudest moment of a sound, in dB below full volume (needs ffmpeg). */
async function peakOf(buffer) {
  const { spawnSync } = await import('node:child_process');
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', 'pipe:0', '-af', 'volumedetect', '-f', 'null', '-'], { input: buffer }).stderr.toString();
  return Number(/max_volume: (-?[\d.]+) dB/.exec(probe)?.[1] ?? 0);
}

/**
 * The generator sometimes hands back near-silence. Turning that up only makes hiss, so a quiet take is thrown
 * away and asked for again, up to three times.
 */
const sfx = (only = SFX) =>
  each('sfx', only, async ([text, seconds, loop]) => {
    let take, peak;
    for (let attempt = 1; attempt <= 3; attempt++) {
      take = await eleven('sound-generation', { text, duration_seconds: seconds, prompt_influence: 0.5, ...(loop ? { loop: true } : {}) });
      peak = await peakOf(take);
      if (peak > QUIETEST_TAKE) return take;
      console.log(`  a take peaked at ${peak} dB: too quiet, asking again (${attempt}/3)`);
    }
    throw new Error(`three takes in a row were near-silent (last peaked at ${peak} dB)`);
  });

const voice = (only = VOICE) => {
  const id = process.env.ELEVENLABS_VOICE_ID;
  if (!id) throw new Error('ELEVENLABS_VOICE_ID is not set (put it in .env.local)');
  const model = process.env.ELEVENLABS_MODEL_ID;
  return each('voice', only, (text) => eleven(`text-to-speech/${id}`, model ? { text, model_id: model } : { text }));
};

async function music() {
  const file = path.join(OUT, 'music', `${MUSIC.id}.mp3`);
  if (await exists(file)) {
    console.log('The ride music already exists; not generating it again. Delete the file first if you really want a new one.');
    return;
  }
  console.log(`Generating 1 piece of music, ${MUSIC.seconds} seconds, 1 take...`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await eleven('music', { prompt: MUSIC.prompt, music_length_ms: MUSIC.seconds * 1000, force_instrumental: true }));
  console.log(`[music/${MUSIC.id}] written`);
}

// ---- designing the guide's voice ---------------------------------------------------------------
// `voice-previews` asks ElevenLabs to design a few candidate voices from a description and saves a sample of each
// to audio-review/. `voice-save <n>` keeps candidate n as a voice on the account and puts its id in .env.local.
const GUIDE_VOICE = {
  name: 'Dino Safari Guide',
  description:
    'An elderly English gentleman who narrates nature documentaries. A soft, warm, slightly breathy voice with ' +
    'received pronunciation, speaking in a hushed, unhurried, awestruck way, as if whispering so as not to disturb ' +
    'the animals, with gentle rises of delight and wonder. Kind and grandfatherly. Studio quality.',
  sample:
    'And here, in the quiet of the jungle, we find something truly remarkable. A Triceratops! Press the big red ' +
    'button to take a photo. Wonderful. Now, listen... something very large is splashing about in the river.',
};
const REVIEW = path.join(ROOT, 'audio-review');

async function voicePreviews() {
  const key = process.env.ELEVENLABS_API_KEY;
  const res = await fetch(`${API}/text-to-voice/design`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ voice_description: GUIDE_VOICE.description, text: GUIDE_VOICE.sample }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const { previews } = await res.json();
  await mkdir(REVIEW, { recursive: true });
  const kept = [];
  for (const [i, p] of previews.entries()) {
    await writeFile(path.join(REVIEW, `guide-voice-${i + 1}.mp3`), Buffer.from(p.audio_base_64, 'base64'));
    kept.push(p.generated_voice_id);
  }
  await writeFile(path.join(REVIEW, 'guide-voice-previews.json'), JSON.stringify(kept, null, 2) + '\n');
  console.log(`wrote ${previews.length} previews to audio-review/guide-voice-<n>.mp3`);
}

async function voiceSave(n) {
  const { readFile } = await import('node:fs/promises');
  const ids = JSON.parse(await readFile(path.join(REVIEW, 'guide-voice-previews.json'), 'utf8'));
  const generated = ids[Number(n) - 1];
  if (!generated) throw new Error(`there is no preview ${n}`);
  const res = await fetch(`${API}/text-to-voice`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ voice_name: GUIDE_VOICE.name, voice_description: GUIDE_VOICE.description, generated_voice_id: generated }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const { voice_id } = await res.json();
  const envPath = path.join(ROOT, '.env.local');
  const env = await readFile(envPath, 'utf8');
  await writeFile(envPath, env.replace(/^ELEVENLABS_VOICE_ID=.*$/m, `ELEVENLABS_VOICE_ID=${voice_id}`));
  console.log('saved the voice and put its id in .env.local; delete public/audio/voice/ and run `voice` to re-record the lines');
}

/** Brings every quiet effect up so its loudest moment is near full volume (needs ffmpeg). */
async function level() {
  const { execFileSync, spawnSync } = await import('node:child_process');
  const { rename } = await import('node:fs/promises');
  for (const id of Object.keys(SFX)) {
    const file = path.join(OUT, 'sfx', `${id}.mp3`);
    if (!(await exists(file))) continue;
    const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']).stderr.toString();
    const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(probe)?.[1] ?? 0);
    if (peak > -3) continue;
    if (peak < QUIETEST_TAKE) {
      console.log(`[sfx/${id}] peaks at ${peak} dB: a dud, not raised. Run: npm run audio -- redo ${id}`);
      continue;
    }
    const louder = file.replace('.mp3', '.loud.mp3');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-af', `volume=${-1 - peak}dB`, '-b:a', '128k', louder]);
    await rename(louder, file);
    console.log(`[sfx/${id}] raised by ${(-1 - peak).toFixed(1)} dB`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'voice-previews') {
  await voicePreviews();
} else if (cmd === 'voice-save') {
  await voiceSave(args[0]);
} else if (cmd === 'sfx') {
  await sfx();
} else if (cmd === 'voice') {
  await voice();
} else if (cmd === 'level') {
  await level();
} else if (cmd === 'music') {
  await music();
} else if (cmd === 'redo') {
  for (const id of args) {
    const folder = id in SFX ? 'sfx' : id in VOICE ? 'voice' : null;
    if (!folder) throw new Error(`"${id}" is not a sound effect or a voice line`);
    await rm(path.join(OUT, folder, `${id}.mp3`), { force: true });
  }
  await sfx(Object.fromEntries(args.filter((id) => id in SFX).map((id) => [id, SFX[id]])));
  await voice(Object.fromEntries(args.filter((id) => id in VOICE).map((id) => [id, VOICE[id]])));
} else {
  console.log('usage: npm run audio -- sfx | voice | music | redo <id...> | voice-previews | voice-save <n>');
}
