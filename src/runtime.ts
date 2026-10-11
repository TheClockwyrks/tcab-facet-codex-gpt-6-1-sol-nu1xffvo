import type { InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import type { AssetBank, FacetState } from "./game";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import { debug } from "./debug";
import { action, pointer } from "./controls";
import {
  advance,
  initial,
  lastFall,
  legalSwap,
  type State,
} from "./simulation";
import * as C from "./constants";
export async function initialize(
  api: InitApi<FacetState>,
): Promise<[FacetState, typeof debug]> {
  for (const name of C.ACTIONS)
    api.input.register(name, { keys: [...C.BINDINGS[name]] });
  const paths = [
    ...C.GEM_KINDS.flatMap((kind) =>
      Array.from(
        { length: C.MAX_STRAIN + 1 },
        (_, i) => `gems/${kind}-${i}.png`,
      ),
    ),
    ...Array.from(
      { length: C.MAX_STRAIN + 1 },
      (_, i) => `gems/prism-${i}.png`,
    ),
    "gems/brilliant.png",
    "gems/star.png",
    "gems/board-frame.png",
    ...C.GEM_KINDS.flatMap((kind) =>
      Array.from({ length: 6 }, (_, i) => `gems/break/${kind}/${i}.png`),
    ),
    ...Array.from({ length: 12 }, (_, i) => `gems/prism-turn/${i}.png`),
  ];
  const images: Record<string, ImageBitmap> = {};
  const systems: Record<string, ParticleSystem> = {};
  const jobs: Promise<unknown>[] = [
    ...paths.map(async (path) => {
      images[path] = await api.assets.loadImage(path);
    }),
    ...["clear", "flawed", "cut", "aura"].map(async (key) => {
      systems[key] = JSON.parse(
        await (await api.assets.load(`fx/${key}.json`)).text(),
      ) as ParticleSystem;
    }),
    ...Object.values(C.CUES).map((name) =>
      api.audio.load(name, `audio/${name === "clear" ? "shatter" : name}.wav`),
    ),
    ...["title", "play"].map((name) =>
      api.audio.load(`music-${name}`, `audio/${name}.wav`),
    ),
  ];
  const ladder = await Promise.all(
    Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
      api.assets.loadAudio(`audio/chain-${i + 1}.wav`),
    ),
  );
  await Promise.all([
    ...jobs,
    api.assets.load("audio/title.mid"),
    api.assets.load("audio/play.mid"),
  ]);
  // The bus exposes one file per cue. The ladder is a sampled layer of clear,
  // rather than eight additional cue events; its unlock follows the engine.
  let toneGraph: AssetBank["toneGraph"];
  if (typeof AudioContext !== "undefined") {
    const context = new AudioContext();
    if (typeof context.createGain === "function") {
      const gain = context.createGain();
      gain.connect(context.destination);
      toneGraph = { context, gain };
      api.events.on("audio:unlocked", () => {
        void context.resume().catch(() => undefined);
      });
    }
  }
  const assets: AssetBank = { images, systems, ladder, toneGraph };
  for (const key of [
    "screen",
    "phase",
    "score",
    "level",
    "levelScore",
    "chainStep",
    "lastCleared",
    "lastPoints",
    "lastWaves",
    "bestMove",
    "bestChain",
  ] as const)
    api.diagnostics.register(key, (s) => s[key]);
  api.diagnostics.register("board", (s) => `${s.board.cols} × ${s.board.rows}`);
  api.diagnostics.register("target", (s) => C.LEVEL_TARGET_STEP * s.level);
  api.diagnostics.register("multiplier", (s) =>
    Math.min(s.chainStep, C.MAX_MULTIPLIER),
  );
  api.diagnostics.register("lastFall", lastFall);
  api.diagnostics.register("selection", (s) =>
    s.selection ? `${s.selection.col},${s.selection.row}` : "none",
  );
  api.diagnostics.register("offer", (s) =>
    s.offer ? `${s.offer.col},${s.offer.row}` : "none",
  );
  api.diagnostics.register("legalSwap", (s) => legalSwap(s.board));
  api.diagnostics.register(
    "pointer",
    (s) =>
      `${s.pointer.x.toFixed(0)}, ${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
  );
  return [{ ...initial(), assets }, debug];
}
export function update(s: State, api: UpdateApi, dt: number): FacetState {
  const events = new Set<string>();
  let clearRung = 1;
  let next: FacetState = { ...s, simTime: s.simTime + dt };
  const actions = Object.fromEntries(
    C.ACTIONS.map((k) => [k, api.input.pressed(k)]),
  );
  if (actions.mute) api.audio.setMuted(!api.audio.muted());
  for (const k of ["up", "down", "confirm", "back", "pause"])
    if (actions[k]) next = action(next, k);
  for (const sample of api.input.pointerSamples())
    if (
      sample.primary &&
      (sample.button === null || sample.button === "primary")
    ) {
      const before = next;
      next = pointer(next, sample.type, sample.x, sample.y, sample.device);
      if (
        next.selection &&
        (!before.selection ||
          next.selection.col !== before.selection.col ||
          next.selection.row !== before.selection.row)
      )
        events.add(C.CUES.select);
      if (next.phase === "swapping" && before.phase !== "swapping")
        events.add(C.CUES.swap);
      if (next.refusal !== before.refusal && next.refusal)
        events.add(C.CUES.refuse);
    }
  if (next.screen !== "playing" && next.visual?.openingTime != null) {
    next = {
      ...next,
      visual: { ...next.visual, openingTime: next.visual.openingTime + dt },
    };
  }
  const p = api.input.pointer();
  next = {
    ...next,
    pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
    muted: api.audio.muted(),
  };
  if (next.screen === "playing") {
    if (next.refusal)
      next = {
        ...next,
        refusal:
          next.refusal.timer + dt >= C.REFUSAL_SECONDS
            ? null
            : { ...next.refusal, timer: next.refusal.timer + dt },
      };
    next = advance(next, dt, (name, rung) => {
      events.add(name);
      if (name === C.CUES.clear) clearRung = rung ?? 1;
    });
  }
  const toneGraph = next.assets?.toneGraph;
  toneGraph?.gain.gain.setValueAtTime(
    next.muted ? 0 : 1,
    toneGraph.context.currentTime,
  );
  for (const cue of events) {
    api.audio.play(cue);
    if (cue === C.CUES.clear && toneGraph?.context.state === "running") {
      const source = toneGraph.context.createBufferSource();
      source.buffer = next.assets?.ladder[
        Math.max(1, Math.min(clearRung, C.MAX_MULTIPLIER)) - 1
      ] as AudioBuffer;
      source.connect(toneGraph.gain as GainNode);
      source.onended = () => source.disconnect();
      source.start();
    }
  }
  const theme =
      next.screen === "title" || next.screen === "howto" ? "title" : "play",
    other = theme === "title" ? "play" : "title";
  api.audio.stop(`music-${other}`);
  api.audio.loop(`music-${theme}`);
  return next;
}
