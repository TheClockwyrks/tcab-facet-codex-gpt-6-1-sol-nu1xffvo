/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game } from "./game";
import { cellX, cellY } from "./simulation";
import {
  CUES,
  LAYOUT,
  STAGE_W,
  STAGE_H,
  SWAP_SECONDS,
  REFUSAL_SECONDS,
} from "./constants";
class SilentAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  async decodeAudioData(_data: ArrayBuffer) {
    return {
      length: 64,
      numberOfChannels: 2,
      sampleRate: 44100,
      getChannelData: () => new Float32Array(64),
    };
  }
}
const eventTarget = new EventTarget();
const surface = {
  cssWidth: () => STAGE_W,
  cssHeight: () => STAGE_H,
  dpr: () => 1,
  events: () => eventTarget,
};
function engine() {
  return createEngine({
    canvas: createCanvas(STAGE_W, STAGE_H) as unknown as HTMLCanvasElement,
    width: STAGE_W,
    height: STAGE_H,
    game,
    clock: new ConstantClock(10),
    surface,
    layout: LAYOUT,
  });
}
beforeEach(() => {
  vi.stubGlobal("AudioContext", SilentAudioContext);
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "fetch",
    async (path: string) =>
      new Response(
        await readFile(new URL(`../public/${path}`, import.meta.url)),
      ),
  );
});
afterEach(() => vi.unstubAllGlobals());
const quiet = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => `${"RACJBSM"[(c + r * 2) % 7]}0`).join(
    " ",
  ),
);
describe("engine integration with shipped assets", () => {
  it("awaits the full asset set, registers diagnostics, draws and advances counted frames", async () => {
    const e = engine();
    const loaded: string[] = [];
    const played: string[] = [];
    e.events.on("asset:loaded", (v) => loaded.push(v.path));
    e.events.on("cue:played", (v) => played.push(v.cue));
    await e.initialize();
    expect(loaded.filter((p) => p.endsWith(".png"))).toHaveLength(89);
    expect(e.debug.version).toBe(1);
    expect(e.diagnostics().map((d) => d.name)).toContain("legalSwap");
    await e.advance(1);
    expect(e.state.simTime).toBeCloseTo(0.01);
    expect(e.frame().count).toBe(1);
    e.apply((s) => e.debug.pointerDown(s, 640, 424));
    e.apply((s) => e.debug.pointerUp(s));
    expect(e.state.screen).toBe("playing");
    await e.advance(80);
    e.apply((s) => e.debug.loadBoard(s, quiet));
    e.apply((s) => e.debug.setGem(s, 0, 0, "R0"));
    e.apply((s) => e.debug.setGem(s, 1, 0, "R0"));
    e.apply((s) => e.debug.setGem(s, 2, 0, "A0"));
    e.apply((s) => e.debug.setGem(s, 2, 1, "R0"));
    e.apply((s) => e.debug.requestSwap(s, 2, 0, 2, 1));
    expect(played).not.toContain(CUES.swap);
    await e.advance(Math.round(SWAP_SECONDS * 100));
    expect(e.state.lastCleared).toBe(3);
    expect(played).toContain(CUES.clear);
    expect(
      played.every((cue) =>
        Object.values(CUES).includes(cue as (typeof CUES)[keyof typeof CUES]),
      ),
    ).toBe(true);
    expect(e.debug.snapshot(e.state).score).toBe(30);
    e.apply((s) => e.debug.setScreen(s, "paused"));
    const timer = e.state.stepTimer;
    await e.advance(20);
    expect(e.state.stepTimer).toBe(timer);
    expect(e.state.simTime).toBeCloseTo(1.19);
    e.apply((s) => e.debug.reset(s));
    expect(e.state.board.cells).toHaveLength(0);
    e.destroy();
  });
  it("uses real input samples for selection, swap refusal, aging and menu keys", async () => {
    const e = engine();
    await e.initialize();
    e.apply((s) => e.debug.setScreen(e.debug.loadBoard(s, quiet), "playing"));
    const send = (type: string, x: number, y: number) => {
      const event = new Event(type);
      Object.assign(event, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
      eventTarget.dispatchEvent(event);
    };
    const played: string[] = [];
    e.events.on("cue:played", (v) => played.push(v.cue));
    send("pointerdown", cellX(0), cellY(0));
    await e.advance(1);
    expect(e.state.selection).toEqual({ col: 0, row: 0 });
    expect(played).toContain(CUES.select);
    send("pointermove", cellX(1), cellY(0));
    send("pointerup", cellX(1), cellY(0));
    await e.advance(1);
    expect(e.state.refusal).not.toBeNull();
    expect(played).toContain(CUES.refuse);
    await e.advance(Math.ceil(REFUSAL_SECONDS * 100));
    expect(e.state.refusal).toBeNull();
    const key = new Event("keydown");
    Object.assign(key, { code: "Escape", repeat: false });
    eventTarget.dispatchEvent(key);
    await e.advance(1);
    expect(e.state.screen).toBe("paused");
    const mute = new Event("keydown");
    Object.assign(mute, { code: "KeyM", repeat: false });
    eventTarget.dispatchEvent(mute);
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    e.destroy();
  });
  it("renders every screen and records live drawing with sprite resources", async () => {
    const e = engine();
    await e.initialize();
    e.startRecording();
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      e.apply((s) => e.debug.setScreen(e.debug.dealBoard(s), screen));
      await e.advance(1);
    }
    const capture = e.stopRecording();
    expect(capture.frames).toHaveLength(6);
    expect(capture.frames[0].ops.length).toBeGreaterThan(0);
    e.destroy();
  });
});
