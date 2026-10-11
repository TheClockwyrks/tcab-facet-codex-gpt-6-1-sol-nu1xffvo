# Facet

A browser puzzle of cut stones and accumulating pressure. Swap neighboring gems into lines of three or more. Each clear strains the stones beside it; a flawed stone joins any clear that touches it and scores double. Build a fault line, then set it off.

Four in a line earns a brilliant that clears its surrounding ring. Five earns a kindless prism that takes every stone of the kind it trades with. Intersecting lines earn a star that clears its row and column. Cascades multiply points up to ×8. Reach each level's target to continue on a fresh board; the round ends when no productive swap remains.

## Run

Requires Node.js 22.12+ (or 24+) and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. To build the complete static site:

```sh
npm run build
npm run preview
```

Serve `dist/` from any static host, at the origin root or a subdirectory. All assets ship locally. The production build only type-checks and bundles committed files; it needs no asset-generation tools, backend, credentials, or network services.

## Controls

- Mouse, pen, or touch: hold a gem, drag onto an orthogonal neighbor, release. Alternatively, tap one stone, then press and release its neighbor. Returning to the original stone withdraws the offer.
- Pointer targets operate every menu. Press and release inside the same button to choose it.
- ↑ / ↓: choose a menu item. Enter / Space: accept.
- Esc / P: pause or resume. Esc: return from instructions or the finished round.
- M: mute all sound and music. Backtick: engine diagnostics.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests cover match acceptance, closure waves, strain, scoring, cut creation, gravity, deterministic refill poses, timing, menus, pointer transactions, and the actual Simple 2D engine over a Node canvas. Audio decoding is stubbed in Node tests; the browser plays the committed WAVs.

## Assets and showcase

All art and audio are original productions for Facet. `public/assets/` contains 32 stone sprites, two cut overlays, the forged bench frame, 42 break frames, 12 prism-turn frames, four live particle systems, eight ascending chain tones, eight event cues, a sampled glass shatter, and two sequenced music pieces with MIDI scores.

`scripts/produce-assets.py` documents the one-time production using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. Those tools are optional authoring tools and are never called by installation or build.

`showcase/` holds screenshots, a three-second engine recording of live play, and the player-facing description. To recapture using a running development server on port 5173, run `node scripts/capture-showcase.mjs` with the project-local Playwright installed.

The simulation, controls, debugging poses, asset initialization, and presentation live in separate modules under `src/`. Game transitions are immutable; rendering reads state and projects the timed visual transaction without changing the simulation. The engine owns input, clocks, canvas fitting, audio unlock, cue playback, diagnostics, and recording.
