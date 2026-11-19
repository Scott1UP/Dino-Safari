# Dino-Safari

A photo safari on rails: ride through a paper-diorama jungle, photograph the dinosaurs, and fill the level's binder
with your own photos. The design is in `spec/dino-safari-spec.md`.

```sh
npm run dev      # run it locally (also served on the local network, for a tablet)
npm run build    # typecheck and build into dist/
npm run icons    # remake the icons and the link-preview picture
```

## Levels

Each level is one file in `src/data/levels/` (its route, scenes, cast, scenery and background life) and is listed in
`src/data/levels/index.ts`. Each has its own binder. The shared rules for what a level is are in `src/data/level.ts`.

- **Jungle Trail** (`jungle.ts`): the first level.
- **Volcano Mine** (`volcano.ts`): a mine cart ride with ten different dinosaurs.

## Art and sound

Both pipelines need the keys in `.env.local` and skip anything that already exists.

```sh
npm run art -- all          # generate missing artwork, then pack it into public/art/ (run twice: poses are redrawn from the standing pose)
npm run art -- gen <id...>  # regenerate named pictures
npm run art -- sheet        # contact sheet of everything, in art/review/
npm run audio -- sfx        # sound effects
npm run audio -- voice      # the guide's lines
npm run audio -- music      # the ride music: one piece, one take, and only if public/audio/music/ride.mp3 is missing
npm run audio -- voice-previews   # design a new guide voice: saves samples to audio-review/
npm run audio -- voice-save <n>   # keep sample n as the guide's voice
```

## Android / Fire tablet app

The game is wrapped as an Android app with [Capacitor](https://capacitorjs.com): the `android/` project is a thin
shell that shows the built web files full screen, offline, locked to landscape. Package ID
`com.scott1up.dinosafari`, Fire OS 7 or newer.

```sh
npm run android:apk    # builds the web app, copies it into android/, and produces a release APK
```

The APK lands in `android/app/build/outputs/apk/release/app-release.apk`. Building needs JDK 21 and the Android SDK
(`brew install openjdk@21` and `brew install --cask android-commandlinetools`, then
`sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"`), with the SDK path in
`android/local.properties` as `sdk.dir=...`.

Release builds are signed with the key named in `android/keystore.properties` (git-ignored, as is the `.jks` file
itself). Keep a backup of both: updates must be signed with the same key, or the tablet will refuse to install them
over the old app (and uninstalling to get round that would lose the binder's photos). Bump `versionCode` in
`android/app/build.gradle` for every new build you install over an old one.

The app needs a system WebView based on Chromium 105 or newer (the binder is laid out with container query units).

The launcher icons are made by `npm run icons`.
