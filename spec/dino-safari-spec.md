# Dino Safari — spec

A Pokémon Snap–style photo safari for a young child. The camera rides a fixed track through a world built like a paper diorama. He taps to photograph dinosaurs, uses fruit and a drum to bring out special poses, and collects his real photos in a binder.

This spec covers the first build: **one level and the 10 headliner dinos**. Once that works and has been tested with him, the recipes at the end are how the game grows.

---

## Principles

1. **The photo is what he took.** Every photo is the real frame from the moment he tapped. It is never a stock image of the dino in that pose. (See "Photo fidelity", which is the most important section.)
2. **Nothing to fail.** The ride always moves forward and always finishes. Every photo of a dino earns at least one star.
3. **No reading.** All guidance comes through sound, animation and icons.
4. **Stand-alone game.** Dino Safari doesn't read from, write to, or share save data with any other dino game.
5. **No voice or microphone.** The game never asks for microphone permission, and voice never controls anything.

## Scope

### In the first build

- One level: a jungle route of about 2 minutes.
- The 10 headliner dinos from Dino Ripper, each with 4 poses.
- Two things to try: **fruit** to throw and a **drum** to bang.
- Tapping to take a photo, with true-to-frame capture.
- A review after the ride, with star ratings.
- A binder of real photos, sorted by dino, with a slot for each pose.
- Saving on the device, so the binder survives between sessions.

### Out of scope (for now)

- Any link to Dino King, Dino Kart, Dino Fighter or Dino Ripper: no shared saves, no unlocks, no imports at runtime.
- Microphone input, voice commands, or anything that listens.
- Extra levels, vehicles, night or weather versions, and random variation (see "Later").
- Accounts, networking or cloud sync.

---

## Cast

### Who's in it

The cast is the **10 headliners from Dino Ripper**: the double rare tier, ranked D1 to D10. D1 is the gold T. rex.

| Rank | Species | Dino Ripper card no. | Level 1 scene |
|---|---|---|---|
| D1 | T. rex | TBC | Scene 6 (finale) |
| D2 | TBC | TBC | TBC |
| D3 | TBC | TBC | TBC |
| D4 | TBC | TBC | TBC |
| D5 | TBC | TBC | TBC |
| D6 | TBC | TBC | TBC |
| D7 | TBC | TBC | TBC |
| D8 | TBC | TBC | TBC |
| D9 | TBC | TBC | TBC |
| D10 | TBC | TBC | TBC |

### Copy, don't link

The safari is drawn in its own style (see "Art direction"), so each headliner is **redrawn**. Its Dino Ripper card art is the reference for its colours, markings and personality. That way he recognises them as the same characters.

All of this happens when the game is built. Species names, card numbers and reference images are copied into this project's own data and art folders. At runtime, the game never loads anything from the Dino Ripper site or repo.

### Binder order

The binder is sorted by **Dino Ripper card number**, copied into `binderOrder` in this project's dino data. Within each dino, poses always appear in the same order: standing, special, eating, drum.

---

## Art direction

### Overall look: a paper diorama

The look is inspired by Paper Mario. Every dino, tree, rock and fern is a **flat cut-out illustration** standing in a real 3D space. The cut-outs have a thick white die-cut border, like a sticker. The flatness is part of the charm.

- **Why cut-outs:** gpt-image is reliable at single subjects on a transparent background, and much less reliable at consistent 3D-looking scenes or animation frames. Building everything from cut-outs plays to that strength.
- **Why a white border:** it hides imperfect edges from background removal, and it makes images from separate generations look like one set.
- **Why real 3D placement and not 2D parallax:** with real 3D, perspective, dinos hiding behind ferns, and turning the camera all work properly. Fake parallax breaks as soon as the camera turns.

### Illustration style

**Bold, colourful pen art that sits halfway between a simple child's drawing and a detailed illustration.**

| Element | Treatment |
|---|---|
| Outlines | Thick, confident black ink with a slight hand-drawn wobble, like a good felt-tip. Thinner lines inside for detail. |
| Colour | Bright, saturated marker colours, slightly uneven like real markers. Each dino keeps its palette from its Dino Ripper card. |
| Shapes | Friendly, chunky proportions (slightly big heads and eyes), but still clearly the right species. |
| Detail | Pen details on top of simple shapes: scales, spots, stripes, claws, friendly teeth. Enough to reward a close look. |
| Shading | Pen hatching and cross-hatching, never smooth gradients. |
| Edges | Thick white die-cut border around every cut-out. |

Making sure dinos stand out:

- Scenery uses slightly cooler, less saturated colours than the dinos.
- Dinos get the thickest outlines in the scene.
- The sky backdrop and far layers are drawn more loosely, with fewer lines, so they sit back.

### Selling the depth

| Technique | Implementation | Why |
|---|---|---|
| Shadows | A soft dark ellipse on the ground under every dino and large prop. It shrinks and fades as a dino hops. | Without it, cut-outs look like they're floating. This is the single biggest factor. |
| Haze | `scene.fog` set to the sky colour | Far cut-outs fade towards the sky, which reads as distance. |
| Soft far layers | Far-layer art is blurred slightly before export | Fakes depth of field at no runtime cost. |
| Close foreground | Ferns and branches placed near the track | They sweep past the lens quickly, which gives the strongest sense of movement. |

### Animation without animation frames

We don't generate walk cycles. Each dino is a **cardboard puppet**: one image per pose, brought to life with movement.

- **Hop-walk:** dinos move in small hops (short bounces) instead of walking.
- **Breathing:** a slow squash and stretch of a few per cent while standing still.
- **Paper flip:** to turn around, the image squashes to zero width and springs back mirrored.
- **Pose pop:** switching pose does a quick squash for about 120 ms, so the image change isn't noticeable.
- All dino art faces **right**. The engine mirrors it to face left.

---

## Core loop

**Ride → spot → snap → try things → review → binder → ride again**

1. **Ride:** the camera moves along the track by itself for about 2 minutes. He can look around, but he can't stop or steer.
2. **Spot:** dinos appear on cue as the camera reaches them, standing, walking in or peeking out.
3. **Snap:** he taps a dino to take a photo.
4. **Try things:** fruit and the drum make dinos switch into poses he can't get otherwise.
5. **Review:** after the ride, the guide shows his best shots and rates each with 1–3 stars.
6. **Binder:** new poses fill their slots with his real photos. Empty slots show silhouettes of the poses still to find.
7. **Ride again** to fill the gaps.

---

## Controls and interaction

Built for a small child on a tablet held in landscape.

| Action | Gesture | Notes |
|---|---|---|
| Look around | Drag anywhere in the scene | Limited to ±35° left and right and ±10° up and down. Eases back to the ride's guided direction about 1.5 s after he lets go. |
| Take a photo | Tap the scene | A touch counts as a tap if the finger moves less than 10 px and lifts within 300 ms. Anything else counts as looking around. 0.6 s cooldown between photos. |
| Throw fruit | Drag from the fruit button into the scene and let go | The fruit arcs from the camera to the ground under where his finger lifted. |
| Bang the drum | Tap the drum button | Sends out a visible ring. Dinos within range react. 3 s cooldown. |
| Pause (parents) | Press and hold the pause button for 2 s | Opens parent settings. The hold stops him pausing by accident. |

**Why fruit is a drag and not tap-then-throw:** tapping the scene must always take a photo. If he tapped the fruit button and then tapped the scene, the game would need a "throwing mode", and small children lose track of modes. Dragging out of the button is a separate gesture, so there's never a mode to remember.

Interface rules:

- Buttons are at least 64 pt (Apple's minimum is 44 pt, and small fingers need more) and sit in the bottom corners, where his thumbs reach.
- Icons only. No text the child needs to read.
- The shutter flash and the photo sliding out appear **after** the photo is captured, so they never end up in it.

### Guided attention

The ride steers his view the way a theme-park dark ride does. Each scene has look targets on the track, and when he isn't dragging, the camera turns gently towards the action. Each scene also announces itself with a sound cue (rustling, splashing, a footstep).

---

## Things to try

### Fruit

- Unlimited fruit, with a 1 s cooldown.
- The fruit bounces on landing, stays for 8 s, then pops away.
- The nearest dino within 6 m that isn't busy hops over and plays its **eating** pose for 3 s. Only one dino eats each fruit.
- Fruit that lands out of reach is simply missed. Nothing goes wrong.

### Drum

- Tapping the button plays a boom and sends a ring outwards.
- Every dino within 15 m plays its **drum** pose for 2.5 s. That might be a dance, a roar or a startled jump, depending on the dino.
- In some scenes, the drum brings a hidden dino out (set in that scene's script).

### Poses (4 per dino in the first build)

| Pose | How he gets it |
|---|---|
| Standing | The default. Shown whenever a dino isn't doing anything else. |
| Special | A scripted moment in that dino's scene (such as splashing, stretching or peeking out). It only happens at one point on the route, so timing matters. |
| Eating | Fruit lands nearby. |
| Drum | The drum is banged within range. |

---

## Photo fidelity

**Rule: a photo is exactly the frame that was showing on screen at the moment of the tap.** It shows the same camera position, the same direction, every dino and prop in its current pose and place, and anything partly hiding a dino. Nothing is cleaned up, redrawn or swapped for a stock picture of the pose.

### What that means in practice

- A dino half-hidden behind a fern is half-hidden in the photo.
- A dino cut off by the edge of the frame is cut off in the photo.
- Other dinos, fruit in the air and drum rings in the world all appear in the photo.
- A tap on empty scenery still takes a real photo. It just has no subject, so it can't go in the binder.
- The binder only ever shows his photos. The only images he didn't take are the silhouettes in empty slots, and those look obviously different from photos.
- Interface elements (buttons, flash, film counter) never appear in photos.

### What the game must never do

- Move, zoom or re-aim the camera to frame the dino before or during capture.
- Crop the photo to the subject.
- Re-pose, reposition or hide anything for the photo.
- Replace the photo with a rendered "ideal" of the dino or pose.
- Add filters or edits to the stored image. Polaroid frames, stars and "New!" stamps are drawn around it when shown, never added to the image itself.

### Fixed 4:3 viewfinder

The game always shows the scene in a **4:3 frame**, with bars at the sides if the screen is wider, and photos are 4:3 too.

**Why:** if the screen and the photo had different shapes, the photo would have to be cropped or would show more than he saw. A matching frame means what he sees is exactly what he gets.

### How capture works

Everything happens in **the same tick** as the tap, before the next animation frame moves anything:

1. **Picture pass:** render the scene with the current camera into a `WebGLRenderTarget` at 1200 × 900.
2. **Read the pixels:** read them back with `readRenderTargetPixels` and **flip the rows**, because WebGL counts rows from the bottom-left. Draw them to a canvas and encode as WebP (or JPEG if WebP isn't supported).
3. **Who-is-where pass:** render the same frame again at 240 × 180, with every dino and prop drawn in its own unique flat colour, cutting along each image's transparent edges as before. Read it back.
4. **Measure:** from the who-is-where image, work out each dino's visible pixel count, bounding box and centre.
5. **How much is hidden:** for each dino in frame, render it alone at the same small size. Its visible pixels divided by its pixels when alone gives how much of it can be seen.
6. **Subject:** the subject is the dino under the tap. Search the who-is-where image within a 24 px radius of the tap to allow for small fingers. If several dinos are there, the one with the most pixels near the tap wins. If none, the photo has no subject.
7. **Save** the image and the measurements together as one photo record.

**Why all in one tick:** the photo and its measurements must describe the same moment. If an animation frame ran between passes, a hopping dino would be in a slightly different place in each.

**Why re-render for the photo instead of copying the screen:** WebGL clears the screen canvas after showing it, so copying it later gives a blank image. The workaround (`preserveDrawingBuffer: true`) slows down every frame. Re-rendering the identical scene, camera and state gives the same content at a fixed photo size, whatever the device.

**Why measure with a who-is-where image instead of bounding boxes:** that image follows the exact shape of each cut-out, so "how much of the dino can you see" matches the actual photo. A box around a T. rex is mostly empty space.

---

## Scoring

Scoring is worked out only from the measurements saved with the photo, so it's based on what's actually in the frame.

| Factor | Measure | Effect |
|---|---|---|
| Size | Subject's visible pixels as a share of the frame | Bigger is better, up to a cap |
| Centring | Distance from the subject's centre to the frame centre | Closer is better |
| Visibility | Visible share of the subject | Less hidden is better |
| Pose | Special, eating or drum pose | Bonus |
| Company | Other dinos clearly visible in frame | Small bonus |

Points become stars:

- **1 star:** any photo with a subject. He never gets zero for a photo of a dino.
- **2 stars:** good.
- **3 stars:** great.

The thresholds are tuned while testing with him. The points total is kept for tie-breaks and never shown.

---

## Review and binder

### Review after the ride

1. The guide presents one photo for each dino-and-pose captured this ride: **his highest-scoring real photo** of it.
2. Each photo appears as a Polaroid with its stars, a sound and a short guide voice clip.
3. Tapping a photo shows his other shots of the same dino and pose from this ride.
4. A pose he has never captured before gets a "New!" stamp and flies into the binder.
5. If the binder already has a photo for that pose, the old and new photos appear side by side and **he taps the one to keep**.
6. Photos with no subject are discarded when the review ends. (Open decision: keep them in a parent-only roll.)

### Binder

- One page per dino, in `binderOrder`.
- Each page has 4 pose slots in the fixed order: standing, special, eating, drum.
- A filled slot shows **his photo**, tap to view full screen.
- An empty slot shows the pose as a dark silhouette.
- A dino he has never photographed shows as a silhouette page, with no name.
- A simple counter for each page and the whole binder, shown as icons and not numbers to read.

---

## Level 1: jungle route

About 2 minutes, all in daytime, 6 scenes, 10 dinos. Species placements are filled in once the cast table is complete. The finale is fixed.

| # | Scene | Dinos | What happens |
|---|---|---|---|
| 1 | Entrance glade | 1 | An easy close-up. The guide teaches "tap to take a photo" (by voice, with the scene briefly pulsing). |
| 2 | Riverbank | 2 | Dinos drinking. One splashes (special pose) as the camera passes. |
| 3 | Fern tunnel | 2 | Foreground ferns sweep past. One dino peeks out from the ferns (special pose). |
| 4 | Fruit grove | 2 | The guide teaches fruit (the button pulses). Dinos come to eat. |
| 5 | Rocky ridge | 2 | The guide teaches the drum. One dino only comes out when the drum is banged. |
| 6 | Volcano finale | 1 (D1) | The T. rex reveal: it stomps in, roars (special pose), and the ride ends. |

The camera slows down in each scene and speeds up between them (see `speedZones`).

### Asset list for level 1

- Sky backdrop: 1 wide panoramic image.
- Far hills: 3–4 strips.
- Mid-layer trees: 6–8 cut-outs.
- Foreground: 8–10 cut-outs (ferns, branches, rocks, logs).
- Ground texture: 1 repeating tile in the same pen style.
- Interactive props: fruit (1–2 varieties) and the drum ring effect.
- Dinos: 10 × 4 poses = 40 cut-outs.

---

## Technical design

### Stack

- **Vite + TypeScript + Three.js.**
- Deployed to its own Netlify site, separate from the other dino games, so it never shares their storage.
- Installable to the home screen (web app manifest) for full screen and safer storage (see "Storage").

### Rendering

| Decision | Choice | Why |
|---|---|---|
| Cut-out mesh | `PlaneGeometry` with `MeshBasicMaterial` (unlit) | Flat illustrations don't need lighting. Unlit keeps the colours exactly as drawn. |
| Transparency | `alphaTest` (hard cut-out), not alpha blending | Three.js sorts blended objects by their centre distance, which gets overlapping cut-outs wrong. A hard cut-out writes depth for each pixel, so overlaps are always correct. The white border gives a clean hard edge anyway. |
| Facing | Rotate around the vertical (Y) axis only, every frame | Fully camera-facing cut-outs would tilt back when the camera looks up or down, making dinos lean. Turning around Y only keeps feet on the ground. |
| Feet | Each pose has an anchor point at the feet. The mesh is offset so the anchor sits on the ground. | Poses have different outlines, so without anchors a dino would jump up or down when its pose changes. |
| Fog | `THREE.Fog` set to the sky colour | Gives the haze effect, and `MeshBasicMaterial` supports it. |
| Texture size | Dinos at most 1024 px tall, props at most 1024 px, backdrop at most 4096 px wide. WebP. Mipmaps on. | Keeps tablet GPU memory comfortable. |

### Camera on the track

- The track is a `CatmullRomCurve3` (a smooth curve) through the level's points.
- The position comes from `curve.getPointAt(u)`, **not** `getPoint(t)`. **Why:** `getPointAt` measures by distance along the track, so the speed is even. `getPoint` speeds up and slows down wherever the points are spaced unevenly.
- `u` moves forward at a rate set by the level's `speedZones`.
- The default view looks along the track, blended towards the current look target. His drag adds an offset within the limits, then eases back.

### Dino behaviour

Each dino runs a small script of steps. A step does one thing (`enter`, `idle`, `hopTo`, `special`, `exit`), and reactions override the current step, then return to it:

- `onFruit`: if a fruit lands within 6 m and the dino isn't busy, hop to it and eat.
- `onDrum`: if within 15 m, play the drum pose.

Scripts start when the camera passes the dino's `triggerU`. The special pose runs at a set point on the track (`specialAtU`), so it's a timing challenge.

### Storage

- Photos (image files) and records go in **IndexedDB**. Use a small wrapper such as `idb`.
- **Why not localStorage:** it only holds text, it's capped at about 5 MB, and it slows the game down while saving. A few dozen WebP photos at 1200 × 900 would fill it quickly.
- Call `navigator.storage.persist()` on first run.
- **Why install to the home screen:** Safari on iPhone and iPad can delete a website's stored data if the site isn't used for 7 days. Web apps added to the home screen are exempt, so installing protects the binder.
- Parent settings include **reset binder**.

### Project structure

```
dino-safari/
  public/
    art/dinos/<dinoId>/<poseId>.webp
    art/levels/<levelId>/{sky,far,mid,fore,ground}/...
    audio/{ui,dinos,guide,music}/...
  src/
    data/dinos.ts
    data/levels/level-1.ts
    engine/{scene,rail,cutouts,behaviours,interactions}.ts
    capture/{capture,id-pass,scoring}.ts
    ui/{hud,review,binder,parent}.ts
    storage/db.ts
```

### Data model

```ts
type DinoId = string;            // e.g. "trex"
type PoseId = 'standing' | 'special' | 'eating' | 'drum';

interface Dino {
  id: DinoId;
  name: string;                  // spoken by the guide
  binderOrder: number;           // Dino Ripper card number, copied in
  headlinerRank: number;         // 1–10
  heightMetres: number;          // size in the world
  poses: Record<PoseId, PoseArt>;
  sounds: Partial<Record<PoseId, string>>;
}

interface PoseArt {
  sprite: string;                // path to transparent WebP
  anchor: [number, number];      // feet position in the image, 0–1
}

interface Level {
  id: string;
  name: string;
  rail: [number, number, number][];
  speedZones: { fromU: number; toU: number; speed: number }[];
  lookTargets: { atU: number; target: [number, number, number] }[];
  sky: string;
  fog: { colour: string; near: number; far: number };
  ground: { texture: string; repeat: number };
  props: PropPlacement[];
  spawns: Spawn[];
}

interface PropPlacement {
  sprite: string;
  position: [number, number, number];
  scale: number;
  mirror?: boolean;
  tint?: string;
  layer: 'far' | 'mid' | 'fore';
}

interface Spawn {
  dino: DinoId;
  triggerU: number;              // when the script starts
  position: [number, number, number];
  steps: BehaviourStep[];
  specialAtU?: number;           // when the special pose fires
  hiddenUntilDrum?: boolean;
}

type BehaviourStep =
  | { do: 'enter'; from: [number, number, number] }
  | { do: 'idle'; seconds: number }
  | { do: 'hopTo'; to: [number, number, number] }
  | { do: 'special' }
  | { do: 'exit'; to: [number, number, number] };

interface PhotoSubject {
  dino: DinoId;
  pose: PoseId;
  frameShare: number;            // visible pixels ÷ frame pixels
  visibleShare: number;          // visible pixels ÷ pixels when drawn alone
  centreOffset: number;          // 0 = centred, 1 = at the edge
}

interface Photo {
  id: string;
  takenAt: number;
  levelId: string;
  image: Blob;                   // the real frame, unedited
  width: 1200;
  height: 900;
  subject?: PhotoSubject;
  others: PhotoSubject[];        // other dinos in frame
  points: number;
  stars: 0 | 1 | 2 | 3;          // 0 only when there's no subject
}

interface BinderSlot {
  dino: DinoId;
  pose: PoseId;
  photoId?: string;
}
```

---

## Asset recipe

### Lock the style first

1. Generate drafts until there are **3–4 approved style references**: a dino, a tree, a fern and a rock in the target pen style.
2. Attach these to every later generation as references.
3. Write down the exact base prompt and keep it in the repo (`art/STYLE.md`).

### Base prompt (starting point, tune during style lock)

> Bold, colourful pen-and-marker illustration of **[subject]**, halfway between a child's drawing and a detailed picture-book illustration. Thick, confident black ink outlines with a slight hand-drawn wobble, bright saturated marker colours, pen hatching for shading and texture, chunky friendly proportions with a few detailed touches (scales, spots, claws). Full body, side view facing right, centred, on a transparent background, with a thick white die-cut sticker border around the outline. No text, no background, no ground, no shadow.

### Adding a dino

1. Collect its Dino Ripper card art as the **reference for colours and markings**. It is a reference only, not the style.
2. Generate the **standing** pose with the style references and card art attached.
3. Generate **special**, **eating** and **drum** as edits of the standing pose ("same character, same colours and markings, now …"), so they stay on-model.
4. Check the art faces right, the white border is whole, and the outline reads clearly at a small size.
5. Trim the empty space around it, export WebP no taller than 1024 px, and record the feet anchor for each pose.
6. Add an entry to `data/dinos.ts`, with `binderOrder` copied from the card number.
7. Add sounds for each pose.
8. Place it in a level (see below).

### Adding a level

1. Choose a setting and draw the track as points. Mark the scenes where the camera slows.
2. Generate a **prop kit** for the setting: a sky backdrop, 3–4 far strips, 6–8 mid cut-outs, 8–10 foreground cut-outs and a ground tile.
3. Lay out the props along the track, reusing them with different sizes, mirroring and tints.
4. Plan 5–6 scenes, each with one clear idea (a special-pose moment, a fruit spot, a drum secret).
5. Add the dino spawns and scripts, with look targets aimed at each scene.
6. Ride it as an adult first: check that every pose can be photographed in one or two rides.

---

## Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Tech spike | One cut-out dino with a shadow on a ground plane, the camera on a track, drag to look, tap to capture, and the photo shown back. Checked on his tablet for style and frame rate. |
| M1 | Level 1 world | The full level 1 scenery placed, with fog and the 6 scenes staged with look targets. |
| M2 | First dinos | 3 headliners with all 4 poses, behaviour scripts, fruit and drum working. |
| M3 | Photos and scoring | The full capture process, scoring and stars, and saving to IndexedDB. |
| M4 | Review and binder | The review flow, the keep-old-or-new choice, and binder pages with silhouettes. |
| M5 | Full cast | All 10 headliners in place, and level 1 complete. |
| M6 | Polish and play test | Sounds, music, guide voice clips and parent settings. Then a session with him, and tuning based on how it goes. |

---

## Acceptance checklist

### Photo fidelity

- [ ] Debug mode shows each captured photo over the frozen frame at 50% opacity, and they line up exactly.
- [ ] A dino partly hidden by a fern is equally hidden in the photo.
- [ ] A dino cut off by the frame edge is cut off in the photo.
- [ ] Two dinos in frame both appear in the photo.
- [ ] Interface elements (buttons, flash, counters) never appear in a photo.
- [ ] The camera doesn't move, zoom or re-aim when a photo is taken.
- [ ] The stored image file is unedited. Frames and stamps appear only when the photo is displayed.
- [ ] The binder never shows an image he didn't take, other than silhouettes in empty slots.

### Interaction

- [ ] A drag never takes a photo, and a tap never moves the view.
- [ ] Dragging out of the fruit button throws fruit, and tapping the scene always takes a photo.
- [ ] Every pose of every dino in level 1 can be photographed within two rides.
- [ ] A photo of a dino always earns at least 1 star.
- [ ] Nothing in the game needs reading.

### Boundaries

- [ ] The game never asks for microphone permission.
- [ ] At runtime the game makes no network requests except for its own files.
- [ ] No storage keys or data are shared with any other dino game.

### Storage

- [ ] The binder survives closing the tab, restarting the device, and a week away (when installed to the home screen).
- [ ] Reset binder in parent settings clears all photos and slots.

---

## Decisions left open

1. **The guide:** who it is (ranger, palaeontologist, a friendly creature) and whose voice: recorded clips or text-to-speech. Either way, the clips are made outside the game, so the game itself never uses the mic.
2. **Photos without a subject:** delete them after the review (current default), or keep them in a parent-only roll.
3. **Photos per ride:** unlimited with a 0.6 s cooldown (current default), or a set number of shots per ride to encourage choosing.
4. **Target device:** which tablet he uses, which sets the frame rate and texture budget.
5. **Tilt to look:** an optional way to look around by tilting the tablet (iOS needs a permission prompt for this). Could follow in a later version.
6. **Old or new photo:** he picks between them (current default), or the game keeps the higher score automatically.

## Later

These are for after the first build has been tested with him, using the recipes above:

- More levels, each with its own vehicle (a raft on the river, a hot-air balloon among the pterodactyls, a mine cart through the volcano).
- Night and weather versions of existing levels (re-tinted layers, a new sky, fireflies, a few different dinos).
- More of the Dino Ripper cast beyond the headliners.
- Light random variation in which dinos appear, and a rare golden variant.
- A fifth, secret pose for each dino (for example, fruit and then the drum).
- Parent option to save a photo to the device.
