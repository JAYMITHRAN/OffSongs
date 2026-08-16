# OffSongs — React Native / Expo scaffold

This is a source-code scaffold, not a built app. It ports everything the web
prototype did into real native code:

- **Real device folder access** — `expo-media-library` scans the phone's actual
  audio library (no re-picking files every time).
- **Real ID3 tags + embedded artwork** — a small pure-JS ID3v2 parser
  (`src/id3.js`) reads title/artist/album/genre/artwork directly from each
  file's tag bytes via `expo-file-system`, without extra native dependencies.
- **Real background playback + lock-screen/notification/Bluetooth controls** —
  `react-native-track-player`, which is the standard native module for this
  (this is genuinely not achievable with a browser).
- **The same recommendation engine** (`src/engine.js`) — ported line-for-line
  from the web version: candidate scoring, exploration bonus, recency/skip
  penalties, weighted-random selection. Not `shuffle()`, not a fixed sequence.
- **The same local persistence model** (`src/store.js`) — stats, history,
  playlists, favorites — via `AsyncStorage` instead of the browser's
  key-value storage.

## What I could not do in this sandbox

I don't have the Android SDK, Gradle, or a signing toolchain available here,
so **I can't hand you a finished `.apk` directly**. This scaffold gets you to
one command away from that. I also haven't been able to run a full
`npm install` + native build in this environment to verify every dependency
resolves cleanly — I syntax-checked every file, but the first real build is
where native-module issues (if any) will surface. That's normal for a fresh
RN project and usually a quick fix.

## Getting an actual APK (pick one path)

### Path A — EAS Build (cloud build, no Android Studio needed, easiest)
```bash
npm install
npm install -g eas-cli
eas login                      # free Expo account
eas build:configure
eas build -p android --profile preview
```
This builds in Expo's cloud and gives you a download link for a real,
installable `.apk` (the `preview` profile in `eas.json` is already set to
`buildType: apk` rather than an app bundle).

### Path B — Local build with Android Studio
```bash
npm install
npx expo prebuild            # generates the native android/ project
cd android
./gradlew assembleRelease    # or open android/ in Android Studio directly
```

## Known things to check on first build

- **`react-native-track-player` + Expo's New Architecture**: this library's
  compatibility with Expo's new architecture has been a moving target across
  recent SDKs. `app.json` already sets `"newArchEnabled": false` as the safer
  default. If the build still fails on the native player module, check
  https://github.com/doublesymmetry/react-native-track-player for the current
  compatibility notes against whatever Expo SDK version you land on — the
  library and Expo both ship fast, so check versions at build time rather
  than trusting the ones pinned here.
- **Permissions**: Android 13+ uses `READ_MEDIA_AUDIO` instead of the older
  `READ_EXTERNAL_STORAGE`; both are declared in `app.json` for coverage
  across OS versions.
- **App icon/splash**: `assets/icon.png` referenced in `app.json` doesn't
  exist yet — drop in a real icon before building, or Expo will use a
  placeholder.
- **Package name**: `com.offsongs.player` is a placeholder — change it in
  `app.json` before publishing anywhere.

## What's simplified vs. the full PRD

- Playlist creation currently uses a plain input prompt on iOS/Android
  system dialogs are inconsistent — swap in a proper modal `TextInput` for
  production polish (the `Sheet` component already gives you a place to put
  one).
- Fonts fall back to system fonts (`src/theme.js` has a note on wiring up
  the same Space Grotesk / Inter / JetBrains Mono pairing via
  `@expo-google-fonts/*` + `expo-font`'s `useFonts()`).
- BPM/energy/mood scoring factors from PRD section 7 are stubbed at 0 since
  no audio-analysis library is wired in yet — genre, artist, album,
  preference, completion, favorite, exploration, recency, and skip-rate
  factors are all live.

## Project layout
```
App.js                     screen routing + wiring
index.js                   entry point, registers TrackPlayer service
src/
  theme.js                 design tokens (same palette as the web version)
  id3.js                   ID3v2 tag + artwork parser
  library.js               MediaLibrary scanning + tag enrichment
  engine.js                recommendation engine (ported from web app)
  store.js                 AsyncStorage-backed local DB
  player.js                react-native-track-player wrapper + queue logic
  playbackService.js       lock-screen/notification event handlers
  components/              ArtThumb, SongRow, MiniPlayer, Waveform, Sheet
  screens/                 LibraryScreen, NowPlayingScreen
```
