// Art pipeline (ported from dino-ripper's scripts/art.mjs). Run through npm so the API key is loaded:
//
//   npm run art -- all                generate everything that is missing and can be made yet, then pack
//   npm run art -- gen rex-roar ...   generate (or regenerate) images by id, then pack
//   npm run art -- pack               convert art/raw/*.png into public/art/**/*.webp
//   npm run art -- sheet [prefix]     build a contact sheet in art/review/ (all images, or ids starting with prefix)
//   npm run art -- list               list every id
//
// Raw model output is kept in art/raw/ (git-ignored) so packing can be re-run for free.
// A dinosaur's other poses are redrawn from its standing pose, so run `all` again once the standing poses exist.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'art', 'raw');
const REFS = path.join(ROOT, 'art', 'refs');
const REVIEW = path.join(ROOT, 'art', 'review');
const OUT = path.join(ROOT, 'public', 'art');

const MODEL = process.env.ART_MODEL ?? 'gpt-image-2.6-sunburst';
const QUALITY = process.env.ART_QUALITY ?? 'high';
const CONCURRENCY = 6;

const SQUARE = '1024x1024';
const WIDE = '1536x1024';

// ---- the style (direction A from the style sheet: pen-and-marker stickers) ----------------------
const ORIGINAL =
  'An original design for a young child\'s dinosaur safari game. It does not resemble any character or artwork ' +
  'from an existing game, film or cartoon. Friendly, suitable for a young child.';
const PEN =
  'Style: bold, colourful pen-and-marker illustration, halfway between a child\'s drawing and a detailed picture-book ' +
  'illustration. Thick, confident black ink outlines with a slight hand-drawn wobble, bright saturated marker ' +
  'colours laid down slightly unevenly like real markers, pen hatching and cross-hatching for shading and ' +
  'texture, never smooth gradients. Chunky friendly proportions with a few detailed pen touches.';
const CUTOUT =
  'Centred with empty space all round, on a fully transparent background, with a thick, even, white die-cut ' +
  'sticker border all the way around the outline. No text, no letters, no background, no ground, no shadow, nothing else in the picture.';
const SIDE_ON = 'Full body, seen exactly side-on, facing right. Slightly big head and eyes, a friendly face.';
const SCENERY = 'In slightly cool, muted colours, a little less saturated than a character would be.';

// ---- dinosaurs ---------------------------------------------------------------------------------
// Each has four poses. The standing pose is drawn first, in the style of the approved T. rex sticker and with
// the colours of its Dino Ripper card (art/refs/<id>.webp); the other three are redrawn from the standing pose.
const EATING = 'head lowered right down to the ground, happily munching a big round red-orange fruit, cheeks full, eyes closed with pleasure';
export const DINOS = {
  trike: {
    species: 'Triceratops',
    special: 'rearing up proudly on its hind legs, both front feet lifted high in the air, head tossed back so its horns point at the sky',
    eating: EATING,
    drum: 'dancing: one front foot and the opposite back foot lifted, body wiggling, mouth wide open in a big laugh',
  },
  spino: {
    species: 'Spinosaurus, with a tall sail on its back and a long crocodile-like snout',
    special: 'bursting up out of a big splash of water with a wriggling fish held in its jaws; splash shapes and droplets cling around its legs and belly, joined to the sticker',
    eating: EATING,
    drum: 'jumping straight up in surprise, all feet off the ground, eyes wide, sail flared, mouth a small round O',
  },
  para: {
    species: 'Parasaurolophus, with a long curved crest sweeping back from its head',
    special: 'standing tall with its head thrown right back and its mouth wide open, trumpeting loudly at the sky',
    eating: EATING,
    drum: 'dancing on its hind legs, arms waving, tail swishing, laughing',
  },
  raptor: {
    species: 'Velociraptor, small, feathered, with a long stiff tail',
    special: 'in mid-air, pouncing forward in a playful leap with arms and claws stretched out in front and legs tucked, grinning, a couple of fern leaves stuck to its feathers',
    eating: 'crouched down, happily munching a big round red-orange fruit held between its hands, cheeks full, eyes closed with pleasure',
    drum: 'spinning in a dance on one leg, arms flung out, tail whirling, laughing',
  },
  dilo: {
    species: 'Dilophosaurus, slender, with two thin rounded crests along the top of its head',
    special: 'in a playful bow like a puppy: chest and chin low to the ground, bottom and tail high in the air, looking up with a cheeky grin',
    eating: EATING,
    drum: 'jumping straight up in surprise, all feet off the ground, eyes wide, arms out, mouth a small round O',
  },
  brachio: {
    species: 'Brachiosaurus, enormous, with a very long neck held high and long front legs',
    special: 'rearing up on its hind legs, front legs lifted, neck stretched straight up as high as it can go, with a leafy branch in its mouth',
    eating: 'its long neck curved all the way down to the ground, happily munching a big round red-orange fruit, cheeks full, eyes closed with pleasure',
    drum: 'swaying in a happy dance, neck bent in an S-curve, one front foot lifted, smiling with eyes closed',
  },
  stego: {
    species: 'Stegosaurus, with two rows of big plates along its back and four tail spikes',
    special: 'swinging its spiked tail high up over its back, plates standing tall, chest out, looking very proud',
    eating: EATING,
    drum: 'jumping straight up in surprise, all four feet off the ground, plates fanned out, eyes wide, mouth a small round O',
  },
  anky: {
    species: 'Ankylosaurus, low and wide, covered in armour plates with a big club on the end of its tail',
    special: 'smashing its club tail down hard, a few small chips of rock flying up from the club and joined to the sticker, with a determined grin',
    eating: EATING,
    drum: 'dancing up on its hind legs, front feet waving, club tail swinging in the air, laughing',
  },
  ptera: {
    species: 'Pteranodon, a flying reptile with a long toothless beak and a long crest on the back of its head',
    standing: 'perched upright on its feet with its wings folded at its sides',
    special: 'flying: wings spread as wide as they go, soaring, body level, beak pointing forward, feet tucked back',
    eating: 'bent forward with wings half open, happily pecking at a big round red-orange fruit on the ground, eyes closed with pleasure',
    drum: 'startled: flapping up off the ground with wings flung high, crest up, beak wide open in a squawk',
  },
  // --- level 2, the Volcano Mine
  pachy: {
    species: 'Pachycephalosaurus, with a thick domed skull ringed with small knobs',
    special: 'charging with its head down, butting its domed skull into a big cracked boulder; the boulder and a few flying chips of rock are joined to the sticker',
    eating: EATING,
    drum: 'jumping straight up in surprise, both feet off the ground, eyes wide, arms out, mouth a small round O',
  },
  carno: {
    species: 'Carnotaurus, with two short bull-like horns above its eyes and very tiny arms',
    special: 'roaring: head thrown back, jaws wide open, horns high, tiny arms stuck out, tail lashing',
    eating: EATING,
    drum: 'dancing: one leg lifted, tiny arms waggling, tail swinging, laughing with its eyes closed',
  },
  kentro: {
    species: 'Kentrosaurus, with small plates along its neck and long sharp spikes along its back, tail and shoulders',
    special: 'swinging its long spiked tail round in a wide proud sweep, spikes fanned out, chest puffed up',
    eating: EATING,
    drum: 'jumping straight up in surprise, all four feet off the ground, spikes bristling, eyes wide, mouth a small round O',
  },
  troodon: {
    species: 'Troodon, small, slim and feathered, with very big round eyes',
    special: 'crouched and gazing in delight at a small glowing blue crystal it holds up in both hands, its huge eyes shining',
    eating: 'crouched down, happily munching a big round red-orange fruit held between its hands, cheeks full, eyes closed with pleasure',
    drum: 'spinning in a dance on one leg, arms flung out, tail whirling, laughing',
  },
  dimorph: {
    species: 'Dimorphodon, a small flying reptile with a big deep head, a toothy grin and a long tail with a diamond tip',
    standing: 'perched upright on its feet with its wings folded at its sides',
    special: 'flying: wings spread as wide as they go, body level, head forward, tail streaming behind',
    eating: 'bent forward with wings half open, happily nibbling a big round red-orange fruit on the ground, eyes closed with pleasure',
    drum: 'startled: flapping up off the ground with wings flung high, tail curled, mouth wide open in a squeak',
  },
  utah: {
    species: 'Utahraptor, big, powerful and feathered, with a large curved claw on each foot',
    special: 'in mid-air, pouncing forward in a playful leap with arms and claws stretched out in front and legs tucked, grinning',
    eating: EATING,
    drum: 'spinning in a dance on one leg, arms flung out, tail whirling, laughing',
  },
  theri: {
    species: 'Therizinosaurus, tall and pot-bellied, with a long neck, a small head and enormously long claws on its hands',
    special: 'stretching up on tiptoe as tall as it can, both arms reaching high above its head, its enormous claws spread like fans',
    eating: 'bending down and holding a big round red-orange fruit delicately between its long claws, happily munching it, eyes closed with pleasure',
    drum: 'dancing: swaying with its long claws waving in the air, one foot lifted, laughing',
  },
  styraco: {
    species: 'Styracosaurus, with one tall nose horn and a frill crowned with long spikes',
    special: 'rearing up on its hind legs, front feet lifted, tossing its spiked frill proudly',
    eating: EATING,
    drum: 'jumping straight up in surprise, all four feet off the ground, frill spikes fanned out, eyes wide, mouth a small round O',
  },
  quetzal: {
    species: 'Quetzalcoatlus, a gigantic flying reptile as tall as a giraffe, with a very long neck and a huge pointed toothless beak',
    standing: 'standing tall on the ground on all fours, its wings folded up so that it walks on its wing-hands, neck held high',
    special: 'flying: enormous wings spread as wide as they go, soaring, neck stretched out, beak pointing forward, feet tucked back',
    eating: 'its long neck bent right down to the ground, happily pecking at a big round red-orange fruit, eyes closed with pleasure',
    drum: 'startled: wings flung half open, neck pulled back in an S, beak wide open in a squawk',
  },
  giga: {
    species: 'Giganotosaurus, a gigantic meat-eater with a long heavy skull and a bumpy ridge along its snout',
    special: 'roaring: leaning forward with its jaws open as wide as they go, head thrust forward and up, arms spread, tail high',
    eating: EATING,
    drum: 'dancing: one leg lifted, arms waving, tail swinging, laughing with its eyes closed',
  },
  rex: {
    species: 'Tyrannosaurus rex',
    special: 'roaring: leaning forward with its jaws open as wide as they go, head thrust forward and up, tiny arms spread, tail high',
    eating: EATING,
    drum: 'dancing: one leg lifted, tiny arms waving, tail swinging, laughing with its eyes closed',
  },
};
export const POSES = ['standing', 'special', 'eating', 'drum'];

const dinoImages = Object.fromEntries(
  Object.entries(DINOS).flatMap(([id, d]) => [
    [`${id}-standing`, {
      size: SQUARE, transparent: true, group: 'dino',
      refs: [path.join(RAW, 'rex-standing.png'), path.join(REFS, `${id}.webp`)],
      prompt:
        `Draw a new sticker in exactly the art style of the first image: the same pen-and-marker technique, outline ` +
        `weight, hatching, level of detail, friendly cartoon face and thick white die-cut border. The subject is a ` +
        `different animal: one ${d.species}, ${d.standing ?? 'standing on all its feet'}. Take its colour scheme and ` +
        `markings from the second image, a trading card of this character by another artist: copy only the colours ` +
        `and markings, not that card's drawing style, pose, background or frame. ${SIDE_ON} ${ORIGINAL} ${PEN} ${CUTOUT}`,
    }],
    ...['special', 'eating', 'drum'].map((pose) => [`${id}-${pose}`, {
      size: SQUARE, transparent: true, group: 'dino',
      refs: [path.join(RAW, `${id}-standing.png`)],
      prompt:
        `The same character as in this image, a ${d.species}: identical art style, colours, markings, face, proportions ` +
        `and thick white die-cut sticker border. Redraw it in a new pose: ${d[pose]}. Still the whole animal, seen ` +
        `side-on, facing right. ${PEN} ${CUTOUT}`,
    }]),
  ]),
);

// ---- scenery -----------------------------------------------------------------------------------
// [id, what it is, tallest size in pixels once packed]
const TREE = 640, PROP = 448;
const SCENERY_LIST = [
  ['tree', 'One tall prehistoric jungle tree with a thick trunk and a wide leafy canopy.', TREE],
  ['palm', 'One tall prehistoric palm tree with a slim, slightly curved, ringed trunk and a crown of long drooping fronds.', TREE],
  ['conifer', 'One very tall monkey-puzzle conifer tree with a straight trunk and tiers of spiky upturned branches.', TREE],
  ['treefern', 'One tree fern: a shaggy, fibrous trunk topped with an umbrella of huge arching fern fronds.', TREE],
  ['vinetree', 'One old twisted jungle tree with a gnarled trunk, big buttress roots and long vines hanging from its branches.', TREE],
  ['fruittree', 'One round bushy tree heavy with big round red-orange fruits among its leaves.', TREE],
  ['ginkgo', 'One ginkgo tree with a pale trunk and a tall cloud of small fan-shaped yellow-green leaves.', TREE],
  ['deadtree', 'One bare, scorched dead tree with a few broken branches, grey and charcoal.', TREE],
  ['fern', 'One big clump of prehistoric fern fronds fanning upwards and outwards from the ground.', PROP],
  ['fern2', 'One low, wide, bushy fern with broad curling fronds and a few unfurling fiddleheads.', PROP],
  ['horsetail', 'One clump of tall, thin, jointed horsetail stalks with whorls of needle leaves.', PROP],
  ['bigleaf', 'One plant with a few huge heart-shaped elephant-ear leaves on thick stalks.', PROP],
  ['flowers', 'One bushy clump of prehistoric magnolia-like flowers, pink and cream, with glossy leaves.', PROP],
  ['mushrooms', 'One cluster of chunky toadstools of different heights, with spotted caps.', PROP],
  ['grass', 'One tuft of tall wild grass with a few seed heads.', PROP],
  ['cycad', 'One short cycad: a fat pineapple-patterned trunk with a rosette of stiff feathery leaves.', PROP],
  ['reeds', 'One clump of tall river reeds and brown cattails.', PROP],
  ['bush', 'One round leafy bush dotted with small blue berries.', PROP],
  ['rock', 'One large mossy boulder with a couple of smaller rocks at its foot, in cool greys with patches of moss.', PROP],
  ['rockstack', 'One tall stack of three big balanced boulders, the top one flat, in warm sandy greys.', TREE],
  ['flatrock', 'One low, wide, flat slab of rock with a little moss and a few pebbles.', PROP],
  ['spire', 'One tall, pointed, jagged rock spire with cracks, in sandy greys.', TREE],
  ['lavarock', 'One craggy black volcanic rock with glowing orange cracks.', PROP],
  ['vent', 'One small cone-shaped mound of dark volcanic rock with a puff of white steam rising from the hole in its top.', PROP],
  ['log', 'One fallen, hollow, mossy tree log lying on its side, with a couple of small mushrooms on it.', PROP],
  ['stump', 'One old tree stump with roots, rings on top and a fern growing from it.', PROP],
  ['bones', 'The big curved rib bones and backbone of a long-dead dinosaur, half buried, clean and sun-bleached, not scary.', PROP],
  ['skull', 'One big fossil dinosaur skull with horns resting on the ground, sun-bleached, friendly and not scary.', PROP],
  ['nest', 'One nest of woven twigs and leaves holding three large speckled dinosaur eggs.', PROP],
  ['gate', 'One wooden safari park entrance arch: two thick timber posts joined across the top by a beam, roofed with a thatch of palm leaves, with a lantern hanging from each side. A big open gap in the middle to pass through. No sign, no words.', TREE],
  ['signpost', 'One rustic wooden signpost with a single arrow-shaped board pointing right, carved with a simple picture of a camera. No words.', PROP],
  ['fence', 'One short stretch of rustic fence: three wooden posts joined by two sagging ropes.', PROP],
  // small life that moves about in the background; none of it is a dinosaur to collect
  ['bird', 'One small prehistoric bird in flight, seen side-on, facing right, wings raised mid-flap, with blue and white feathers and a short tail fan.', 256],
  ['dragonfly', 'One giant prehistoric dragonfly in flight, seen side-on, facing right, with a long turquoise body and four clear veined wings.', 192],
  ['butterfly', 'One butterfly with open orange and yellow patterned wings, seen from the side in flight, facing right.', 160],
  ['cloud', 'One puffy white cumulus cloud with a flat bottom, shaded with a little pale blue pen hatching.', 448],
  ['smoke', 'One round, billowing puff of pale grey smoke.', 256],
];

// Level 2, the Volcano Mine: its own kit, on top of the rocks, vents and dead trees it shares with level 1.
const SCENERY_LIST_2 = [
  ['crystal-blue', 'One tall cluster of big glowing blue and turquoise crystals growing out of dark rock.', TREE],
  ['crystal-pink', 'One wide cluster of big glowing pink and purple crystals growing out of dark rock.', TREE],
  ['crystal-small', 'One small clump of glowing yellow and orange crystal shards.', PROP],
  ['stalagmite', 'One tall, pointed stalagmite of banded brown and ochre rock with two smaller ones at its foot.', TREE],
  ['basalt', 'One tall cluster of dark hexagonal basalt columns of different heights.', TREE],
  ['lavafall', 'One tall black cliff with a bright orange waterfall of lava pouring down its middle into a glowing pool.', TREE],
  ['geyser', 'One erupting geyser: a mound of pale mineral rock with a tall column of white steam and water shooting up.', TREE],
  ['emberbush', 'One scrubby bush with dark twisted branches and bright orange and red leaves, like embers.', PROP],
  ['firefern', 'One clump of fern fronds in deep red and orange.', PROP],
  ['ashshrub', 'One dry, spiky grey shrub dusted with pale ash.', PROP],
  ['glowshroom', 'One cluster of mushrooms with softly glowing blue-green caps.', PROP],
  ['obsidian', 'One jagged, glossy black shard of volcanic glass with sharp shiny edges.', PROP],
  ['minecart', 'One old wooden mine cart with iron bands and wheels, heaped with glowing crystals.', PROP],
  ['minegate', 'One mine entrance: a square doorway of thick timber beams, two posts and a crossbeam with diagonal braces, a lantern hanging from the beam and rocks piled at the foot of each post. A big open gap in the middle to pass through. No sign, no words.', TREE],
  ['lantern', 'One wooden post with an old oil lantern hanging from an iron hook, glowing warm yellow.', PROP],
  ['barrels', 'Two wooden barrels and a wooden crate stacked together, with a pickaxe and a shovel leaning against them.', PROP],
  ['buffer', 'One wooden railway buffer stop: a short heavy timber frame across the end of a track, painted with red and white stripes.', PROP],
  ['ember', 'One small glowing orange ember spark with a little flame-shaped tail.', 128],
  ['ashcloud', 'One heavy, dark grey and purple cloud of volcanic ash with a glowing orange underside.', PROP],
];

const sceneryEntry = (level) => ([id, subject, size]) => [id, {
  size: SQUARE, transparent: true, group: 'scenery', tall: size, level,
  prompt: `${subject} The whole thing, front-on. ${SCENERY} ${PEN} ${CUTOUT}`,
}];
const sceneryImages = Object.fromEntries([...SCENERY_LIST.map(sceneryEntry(1)), ...SCENERY_LIST_2.map(sceneryEntry(2))]);

const LOOSE =
  'Style: a loose pen-and-marker drawing: thin wobbly ink lines, far fewer lines than a foreground drawing, pale, cool, ' +
  'slightly washed-out marker colours with a little hatching. Far away and hazy.';
const STRIP =
  'One long, low, wide shape that stretches across the whole width of the image and sits in its lower half, on a fully ' +
  'transparent background, with a white die-cut sticker border. No text, no animals, nothing else in the picture.';

const otherImages = {
  // --- far layers
  sky: {
    size: WIDE, group: 'far',
    prompt:
      'A wide panoramic backdrop for a prehistoric jungle: a big pale blue sky with a few simple clouds filling the top ' +
      'two thirds, and along the bottom third rolling distant jungle hills with one small smoking volcano on the horizon. ' +
      'No animals, no dinosaurs, nothing in the foreground, no text, no border: the picture fills the whole image edge ' +
      `to edge. ${LOOSE}`,
  },
  'far-jungle': { size: WIDE, transparent: true, group: 'far', prompt: `A distant ridge of dense jungle treetops, with a few taller palms and conifers poking up. ${STRIP} ${LOOSE}` },
  'far-hills': { size: WIDE, transparent: true, group: 'far', prompt: `A distant range of rounded, forested hills with a rocky cliff face and a thin waterfall. ${STRIP} ${LOOSE}` },
  'far-herd': { size: WIDE, transparent: true, group: 'far', prompt: `A distant herd of five long-necked sauropod dinosaurs of different sizes walking in a line, seen side-on, facing right, as simple pale grey-blue shapes with very little detail, like animals seen far away through haze. One long, low group that stretches across the width of the image, on a fully transparent background, with a white die-cut sticker border. No text, no ground, nothing else in the picture. ${LOOSE}` },
  volcano: {
    size: WIDE, transparent: true, group: 'far',
    prompt:
      'One great cone-shaped volcano with a glowing crater, two bright streams of orange lava running down its dark ' +
      'slopes and a big plume of grey smoke curling up from the top. The whole mountain, on a fully transparent background, ' +
      `with a white die-cut sticker border. No text, no animals, nothing else in the picture. ${SCENERY} ${PEN}`,
  },

  // --- level 2's far layers
  'l2-sky': {
    size: WIDE, group: 'far', level: 2,
    prompt:
      'A wide panoramic backdrop for a volcanic land at dusk: a big glowing sky that fades from deep purple at the top ' +
      'through pink to warm orange near the bottom, with long streaks of dark ash cloud, filling the top two thirds, and ' +
      'along the bottom third a distant range of dark jagged mountains and volcanoes, two of them with a faint orange glow ' +
      'at the top. No animals, no dinosaurs, nothing in the foreground, no text, no border: the picture fills the whole ' +
      `image edge to edge. ${LOOSE}`,
  },
  'l2-far-crags': { size: WIDE, transparent: true, group: 'far', level: 2, prompt: `A distant ridge of dark, jagged volcanic crags and rock spires, with thin threads of orange lava in the cracks. ${STRIP} ${LOOSE}` },
  'l2-far-cones': { size: WIDE, transparent: true, group: 'far', level: 2, prompt: `A distant row of three smoking volcano cones of different sizes, dark purple-grey, with glowing tops. ${STRIP} ${LOOSE}` },

  // --- things to play with, and the title
  fruit: { size: SQUARE, transparent: true, group: 'ui', tall: 256, prompt: `One big, round, juicy prehistoric fruit, red-orange with a few spots and one green leaf on its stalk. ${PEN} ${CUTOUT}` },
  drum: { size: SQUARE, transparent: true, group: 'ui', tall: 256, prompt: `One chunky hand drum made from a hollow log with an animal-hide skin laced on with cord, and two wooden drumsticks crossed in front of it. ${PEN} ${CUTOUT}` },
  logo: {
    size: WIDE, transparent: true, group: 'ui', tall: 640,
    prompt:
      'A game logo that reads exactly "DINO SAFARI" on two lines, "DINO" above "SAFARI". Big, chunky, hand-drawn ' +
      'felt-tip bubble letters, coloured in with bright orange and yellow marker and pen hatching, with thick wobbly ' +
      'black ink outlines. A small smiling green dinosaur peeks over the top of the letters holding a camera. The ' +
      'text reads exactly DINO SAFARI and nothing else. Flat, front-on, centred, on a fully transparent background, ' +
      'with a thick white die-cut sticker border around the whole logo. The whole logo, including all of the bottom ' +
      'row of letters and the white border beneath them, fits well inside the image with a clear empty margin on ' +
      'every side; nothing touches or runs off any edge. No other text, no ground, no shadow.',
  },

  // A picture of each level, for the cards where a level is chosen and for its binder's pages. Drawn from the
  // level's own stickers, so it shows the real place.
  'card-level-1': {
    size: WIDE, group: 'ui', width: 900,
    refs: [path.join(RAW, 'rex-standing.png'), path.join(RAW, 'tree.png'), path.join(RAW, 'fern.png'), path.join(RAW, 'sky.png')],
    prompt:
      'One wide scene made from these pictures, in exactly their pen-and-marker style, like a paper diorama: a sandy ' +
      'track winds away through a bright green jungle of the trees and ferns shown, under the pale blue sky shown, ' +
      'with a river on the right and a small smoking volcano far off. The red and orange Tyrannosaurus rex shown ' +
      'stands beside the track, friendly, as a sticker with its white border. Bright daylight. The scene fills the ' +
      'whole image edge to edge. No text, no letters, no border, no people, no vehicles.',
  },
  'card-level-2': {
    size: WIDE, group: 'ui', width: 900,
    refs: [path.join(RAW, 'giga-standing.png'), path.join(RAW, 'crystal-blue.png'), path.join(RAW, 'lavafall.png'), path.join(RAW, 'l2-sky.png')],
    prompt:
      'One wide scene made from these pictures, in exactly their pen-and-marker style, like a paper diorama: a mine ' +
      'railway track runs away into the dark mouth of a rocky mine tunnel framed with timber beams, past big glowing ' +
      'blue crystals like the ones shown and a river of orange lava with a lava fall like the one shown, under the ' +
      'purple and orange dusk sky shown, with a great volcano behind. The green and orange Giganotosaurus shown ' +
      'stands beside the track, friendly, as a sticker with its white border. The scene fills the whole image edge ' +
      'to edge. No text, no letters, no border, no people.',
  },

  // the binder's front cover; the logo and the level's name are put on top of it in the browser
  cover: {
    size: SQUARE, group: 'ui', width: 900,
    prompt:
      'A flat, front-on surface texture filling the whole image edge to edge: the front cover of an explorer\'s ' +
      'field binder, in sturdy olive-green canvas with tan leather edging, a line of cream stitching all the way ' +
      'round near the edges and small brass corner protectors. The middle of the cover is plain canvas, left empty. ' +
      'Soft, even studio light, realistic materials. No text, no letters, no numbers, no emblem, no badge, no strap.',
  },

  // The mine cart's track. It is drawn running straight up the image, so that it follows the route when it is
  // laid along it; it repeats up and down only.
  'l2-ground-rails': {
    size: SQUARE, group: 'ground', level: 2,
    prompt:
      'A seamless repeating texture, seen from straight above, flat and evenly lit: a narrow mine railway track running ' +
      'straight up the middle of the image from the bottom edge to the top edge. Two parallel dark iron rails, evenly ' +
      'spaced, laid on thick wooden sleepers that cross them at regular gaps, on a bed of dark gravel that fills the ' +
      'rest of the image. The rails and the gravel run off the top and bottom edges so that the image can be tiled ' +
      `upwards. No shadows, no border. In slightly muted colours. ${PEN} No text.`,
  },

  // --- ground: repeating tiles, seen from straight above
  ...Object.fromEntries(
    [
      ['ground-grass', 'jungle grass: fresh green marker with many short pen strokes for blades of grass, a few tiny tufts, clover leaves and the odd tiny flower'],
      ['ground-dirt', 'a sandy dirt track: warm tan marker with pen hatching, small pebbles, a few cracks and faint tyre-less wheel ruts'],
      ['ground-water', 'calm river water: blue and turquoise marker with curling pen-drawn ripples and a few white highlights'],
      ['ground-ash', 'dark volcanic ground: charcoal grey and deep brown marker with cracks, pen cross-hatching and small black stones'],
      ['l2-ground-lava', 'molten lava: bright orange and yellow marker with swirling darker red crust, pen-drawn ripples and small glowing bubbles', 2],
      ['l2-ground-cave', 'the rough rock wall of a mine tunnel: dark grey-brown and purple stone with cracks, chisel marks, heavy pen cross-hatching and a few tiny glints of crystal', 2],
      ['l2-ground-stone', 'the floor of a rocky canyon: warm red-brown and grey stone slabs with cracks, pen hatching, grit and small pebbles', 2],
    ].map(([id, what, level]) => [id, {
      size: SQUARE, group: 'ground', level: level ?? 1,
      prompt:
        `A seamless repeating texture, seen from straight above, flat and evenly lit: ${what}. The detail is small ` +
        `and spread evenly over the whole image with no large features, no focal point, no shadows and no border; it ` +
        `runs off every edge so that the image can be tiled. In slightly muted colours. ${PEN} No text.`,
    }]),
  ),
};

export const IMAGES = { ...dinoImages, ...sceneryImages, ...otherImages };

const exists = (p) => access(p).then(() => true, () => false);

async function openai(endpoint, body) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set (put it in .env.local)');
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
    body: isForm ? body : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json.error?.message ?? JSON.stringify(json)}`);
  return Buffer.from(json.data[0].b64_json, 'base64');
}

async function gen(id) {
  const spec = IMAGES[id];
  if (!spec) throw new Error(`unknown image id "${id}"`);
  const prompt = spec.prompt.replace(/\s+/g, ' ');
  const background = spec.transparent ? 'transparent' : 'opaque';
  let png;
  if (spec.refs) {
    const form = new FormData();
    form.set('model', MODEL);
    form.set('prompt', prompt);
    form.set('size', spec.size);
    form.set('quality', QUALITY);
    form.set('background', background);
    form.set('output_format', 'png');
    for (const ref of spec.refs) {
      // every reference goes up as a PNG, whatever it is stored as
      form.append('image[]', new Blob([await sharp(ref).png().toBuffer()], { type: 'image/png' }), `${path.parse(ref).name}.png`);
    }
    console.log(`[${id}] drawing from ${spec.refs.length} reference(s) with ${MODEL}...`);
    png = await openai('images/edits', form);
  } else {
    console.log(`[${id}] generating with ${MODEL}...`);
    png = await openai('images/generations', { model: MODEL, prompt, size: spec.size, quality: QUALITY, background, output_format: 'png' });
  }
  await mkdir(RAW, { recursive: true });
  await writeFile(path.join(RAW, `${id}.png`), png);
  console.log(`[${id}] wrote art/raw/${id}.png`);
}

async function pool(ids) {
  const queue = [...ids];
  const failed = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          await gen(id);
        } catch (err) {
          console.error(`[${id}] FAILED: ${err.message}`);
          failed.push(id);
        }
      }
    }),
  );
  return failed;
}

// ---- pack for the game -------------------------------------------------------------------------
const HAZE = '#b7d3e0';

/** Makes a picture repeat without seams: each edge is cross-faded into what lies beyond the opposite edge. */
async function seamless(file, size) {
  const band = Math.round(size * 0.18);
  const full = size + band;
  let img = await sharp(file).resize(full, full).removeAlpha().png().toBuffer();
  for (const across of [true, false]) {
    const w = across ? band : full, h = across ? full : band;
    const strip = await sharp(img).extract(across ? { left: size, top: 0, width: band, height: full } : { left: 0, top: size, width: full, height: band }).toBuffer();
    const ramp = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" ` +
      `x2="${across ? 1 : 0}" y2="${across ? 0 : 1}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/>` +
      `</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`);
    const mask = await sharp(ramp).extractChannel(0).toBuffer();
    const faded = await sharp(strip).joinChannel(mask).png().toBuffer();
    img = await sharp(img).composite([{ input: faded, left: 0, top: 0 }]).png().toBuffer();
  }
  return sharp(img).extract({ left: 0, top: 0, width: size, height: size });
}

/** Where each packed picture goes, relative to public/art. */
function destination(id, spec) {
  const level = `levels/level-${spec.level ?? 1}`;
  const name = id.replace(/^l\d-/, '');
  if (spec.group === 'dino') return `dinos/${id.replace('-', '/')}`;
  if (spec.group === 'scenery') return `${level}/props/${name}`;
  if (spec.group === 'far') return `${level}/far/${name}`;
  if (spec.group === 'ground') return `${level}/ground/${name.replace('ground-', '')}`;
  return `ui/${id}`;
}

async function pack() {
  for (const [id, spec] of Object.entries(IMAGES)) {
    const src = path.join(RAW, `${id}.png`);
    if (!(await exists(src))) continue;
    const out = path.join(OUT, `${destination(id, spec)}.webp`);
    await mkdir(path.dirname(out), { recursive: true });
    let img;
    if (spec.group === 'ground') {
      img = await seamless(src, 512);
    } else if (spec.group === 'far' && spec.transparent) {
      // far layers sit back: washed towards the haze and a little soft
      const { data, info } = await sharp(src).trim().resize({ width: 1280 }).png().toBuffer({ resolveWithObject: true });
      const wash = { create: { width: info.width, height: info.height, channels: 4, background: HAZE } };
      const veil = await sharp(wash).ensureAlpha(0.3).png().toBuffer();
      img = sharp(await sharp(data).composite([{ input: veil, blend: 'atop' }]).png().toBuffer()).blur(0.8);
    } else if (spec.transparent) {
      // cut-outs are trimmed to their outline, so the bottom edge of the picture is the feet
      img = sharp(src).trim().resize({ height: spec.tall ?? 640, withoutEnlargement: true });
    } else {
      img = sharp(src).resize({ width: spec.width ?? 1536 });
    }
    await img.webp({ quality: 84 }).toFile(out);
  }
  console.log('packed public/art');
}

// ---- contact sheet -----------------------------------------------------------------------------
async function sheet(prefix = '') {
  const ids = [];
  for (const id of Object.keys(IMAGES)) if (id.startsWith(prefix) && (await exists(path.join(RAW, `${id}.png`)))) ids.push(id);
  const TILE = 300, GAP = 10, LABEL = 26, COLS = 8;
  const rows = Math.ceil(ids.length / COLS);
  const W = GAP + COLS * (TILE + GAP), H = GAP + rows * (TILE + LABEL + GAP);
  const layers = [];
  for (const [i, id] of ids.entries()) {
    const x = GAP + (i % COLS) * (TILE + GAP), y = GAP + Math.floor(i / COLS) * (TILE + LABEL + GAP);
    const label = `<rect width="${TILE}" height="${TILE + LABEL}" rx="10" fill="#6f9fb8"/><text x="${TILE / 2}" y="${TILE + 19}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#fff">${id}</text>`;
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE + LABEL}">${label}</svg>`), left: x, top: y });
    let img = sharp(path.join(RAW, `${id}.png`));
    if (IMAGES[id].transparent) img = img.trim();
    const buf = await img.resize({ width: TILE - 16, height: TILE - 16, fit: 'inside' }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    layers.push({ input: buf, left: x + Math.round((TILE - meta.width) / 2), top: y + Math.round((TILE - meta.height) / 2) });
  }
  await mkdir(REVIEW, { recursive: true });
  const out = path.join(REVIEW, `sheet-${prefix || 'all'}.jpg`);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#2b3a42' } }).composite(layers).jpeg({ quality: 86 }).toFile(out);
  console.log(`wrote ${path.relative(ROOT, out)}`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'list') {
  console.log(Object.keys(IMAGES).join('\n'));
} else if (cmd === 'gen') {
  const failed = await pool(args);
  await pack();
  if (failed.length) process.exitCode = 1;
} else if (cmd === 'sheet') {
  await sheet(args[0]);
} else if (cmd === 'pack') {
  await pack();
} else if (cmd === 'all') {
  const missing = [];
  for (const [id, spec] of Object.entries(IMAGES)) {
    if (await exists(path.join(RAW, `${id}.png`))) continue;
    const ready = await Promise.all((spec.refs ?? []).map(exists));
    if (ready.every(Boolean)) missing.push(id);
    else console.log(`[${id}] waiting for its reference picture`);
  }
  const failed = await pool(missing);
  await pack();
  if (failed.length) {
    console.error(`failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
} else {
  console.log('usage: npm run art -- all | gen <id...> | pack | sheet [prefix] | list');
}
