import { describe, expect, it } from "vitest";
import { debug } from "./debug";
import {
  advance,
  cellX,
  cellY,
  deal,
  initial,
  lastFall,
  legalSwap,
  runs,
  resolve,
  stepHold,
} from "./simulation";
import { action, pointer, targets } from "./controls";
import * as C from "./constants";
import type { FacetState } from "./game";
const quiet = Array.from({ length: C.GRID_ROWS }, (_, row) =>
  Array.from(
    { length: C.GRID_COLS },
    (_, col) => `${"RACJBSM"[(col + row * 2) % 7]}0`,
  ).join(" "),
);
function posed(): FacetState {
  return debug.setScreen(debug.loadBoard(initial(), quiet), "playing");
}
function set(s: FacetState, col: number, row: number, token: string) {
  return debug.setGem(s, col, row, token);
}
function resolving(s: FacetState) {
  return resolve({ ...s, phase: "resolving", chainStep: 1 });
}
function match3() {
  let s = posed();
  s = set(s, 0, 0, "R0");
  s = set(s, 1, 0, "R0");
  s = set(s, 2, 0, "A0");
  s = set(s, 2, 1, "R0");
  return s;
}
describe("opening and notation", () => {
  it("initializes every declared resting field", () => {
    const s = debug.snapshot(initial());
    expect(s.board).toEqual({ cols: 0, rows: 0, cells: [] });
    expect(s.targets.map((t) => t.id)).toEqual(["menu-0", "menu-1"]);
    expect(s.refillKinds).toEqual(Array(8).fill(""));
    expect(s.simTime).toBe(0);
  });
  it("deals productive, run-free boards with incoming journeys", () => {
    for (let i = 0; i < 20; i++) {
      const board = deal();
      expect(runs(board)).toHaveLength(0);
      expect(legalSwap(board)).toBe(true);
      expect(
        board.cells.every(
          (g) => g.cut === "plain" && g.strain === 0 && g.fell >= g.row + 1,
        ),
      ).toBe(true);
    }
  });
  it("roundtrips all cuts and strain states with no side effects", () => {
    let s = posed();
    s = debug.setSelection(s, 7, 7);
    s = set(s, 0, 0, "X3");
    s = set(s, 1, 0, "M2s");
    s = set(s, 2, 0, "S1b");
    const snap = debug.snapshot(s);
    expect(snap.board.cells[0]).toMatchObject({
      kind: null,
      cut: "prism",
      strain: 3,
      fell: 0,
      x: cellX(0),
      y: cellY(0),
    });
    expect(snap.selection).toEqual({ col: 7, row: 7 });
    expect(debug.reconcile(s)).toEqual(s);
  });
  it("rejects every invalid domain loudly", () => {
    const s = posed();
    for (const call of [
      () => debug.setGem(s, 8, 0, "R0"),
      () => debug.setGem(s, 0, 0, "X0b"),
      () => debug.loadBoard(s, ["R0"]),
      () => debug.loadBoard(s, Array(8).fill("R0")),
      () => debug.setLevel(s, 0),
      () => debug.setMenuIndex(s, -1),
      () => debug.setRefillKinds(s, 0, "X"),
      () => debug.setScore(s, NaN),
      () => debug.requestSwap(initial(), 0, 0, 1, 0),
    ])
      expect(call).toThrow();
  });
});
describe("move acceptance and temporal resolution", () => {
  it("refuses nonadjacent and unproductive moves without touching board", () => {
    const s = posed();
    for (const b of [
      { col: 2, row: 0 },
      { col: 1, row: 0 },
    ]) {
      const n = debug.requestSwap(s, 0, 0, b.col, b.row);
      expect(n.board).toBe(s.board);
      expect(n.refusal).toMatchObject({ a: { col: 0, row: 0 }, b, timer: 0 });
    }
  });
  it("exchanges at once but scores only after the swap span", () => {
    const old = match3();
    const s = debug.requestSwap(old, 2, 0, 2, 1);
    expect(s.phase).toBe("swapping");
    expect(s.chainStep).toBe(0);
    expect(s.score).toBe(0);
    expect(s.board.cells[2].kind).toBe("ruby");
    expect(old.board.cells[2].kind).toBe("amber");
    const before = advance(s, C.SWAP_SECONDS - 0.001);
    expect(before.score).toBe(0);
    const after = advance(before, 0.001);
    expect(after.phase).toBe("resolving");
    expect(after.lastCleared).toBe(3);
    expect(after.score).toBe(30);
    expect(after.swapTimer).toBe(0);
  });
  it("refuses while busy and keeps named selection intact", () => {
    let s = debug.setSelection(match3(), 4, 4);
    s = debug.setOffer(s, 5, 4);
    s = debug.requestSwap(s, 2, 0, 2, 1);
    const n = debug.requestSwap(s, 2, 0, 2, 1);
    expect(n.phase).toBe("swapping");
    expect(n.board).toBe(s.board);
    expect(n.selection).toEqual({ col: 4, row: 4 });
    expect(n.offer).toEqual({ col: 5, row: 4 });
  });
  it("retains fell on coming to rest and measures best moves then", () => {
    let s = match3();
    for (let c = 0; c < 8; c++)
      s = debug.setRefillKinds(
        s,
        c,
        Array.from(
          { length: 8 },
          (_, r) => "RACJBSM"[(c + r * 2 + 3) % 7],
        ).join(""),
      );
    s = advance(debug.requestSwap(s, 2, 0, 2, 1), C.SWAP_SECONDS);
    expect(lastFall(s)).toBeGreaterThan(0);
    const n = advance(s, stepHold(s));
    expect(n.phase).toBe("idle");
    expect(n.board.cells.map((g) => g.fell)).toEqual(
      s.board.cells.map((g) => g.fell),
    );
    expect(n.bestMove).toBe(n.moveScore);
    expect(n.chainStep).toBe(0);
    expect(n.stepTimer).toBe(0);
  });
  it("integrates equally across different frame divisions", () => {
    let s = match3();
    for (let c = 0; c < 8; c++)
      s = debug.setRefillKinds(
        s,
        c,
        Array.from(
          { length: 8 },
          (_, r) => "RACJBSM"[(c + r * 2 + 3) % 7],
        ).join(""),
      );
    s = debug.requestSwap(s, 2, 0, 2, 1);
    const a = advance(s, 0.31);
    let b = s;
    for (let i = 0; i < 31; i++) b = advance(b, 0.01);
    expect(a.board).toEqual(b.board);
    expect(a.score).toBe(b.score);
    expect(a.phase).toBe(b.phase);
    expect(a.stepTimer).toBeCloseTo(b.stepTimer, 9);
  });
  it("stops gameplay time while paused", () => {
    const s = action(debug.requestSwap(match3(), 2, 0, 2, 1), "pause");
    const n = advance(s, 20);
    expect(n).toEqual(s);
    expect(action(n, "pause").phase).toBe("swapping");
  });
});
describe("clear closure, pressure, cuts and gravity", () => {
  it("expands through flawed neighbors in minimal waves and doubles their value", () => {
    let s = posed();
    for (let c = 0; c < 3; c++) s = set(s, c, 0, "R0");
    s = set(s, 2, 1, "J3");
    s = set(s, 3, 1, "B3");
    s = set(s, 4, 1, "S2");
    const { state: n, events } = resolving(s);
    expect(n.lastCleared).toBe(5);
    expect(n.lastWaves).toBe(2);
    expect(n.lastPoints).toBe(70);
    expect(events.flaw).toBe(true);
    expect(
      n.visual?.cleared.find((c) => c.gem.col === 3 && c.gem.row === 1)?.wave,
    ).toBe(2);
    expect(
      n.board.cells.find(
        (g) => g.kind === "sapphire" && g.col === 4 && g.strain === 3,
      ),
    ).toBeDefined();
  });
  it("raises strain once even against several cleared neighbors", () => {
    let s = posed();
    for (let c = 0; c < 3; c++) s = set(s, c, 1, "R0");
    for (let r = 0; r < 3; r++) s = set(s, 0, r, "R0");
    s = set(s, 1, 0, "A1");
    const n = resolving(s).state;
    expect(
      n.board.cells.find(
        (g) => g.col === 1 && g.kind === "amber" && g.strain === 2,
      ),
    ).toBeDefined();
  });
  it("brilliants take the surrounding eight, recursively", () => {
    let s = posed();
    for (let c = 2; c < 5; c++) s = set(s, c, 3, c === 3 ? "R0b" : "R0");
    s = set(s, 4, 4, "J0b");
    const n = resolving(s).state;
    expect(n.lastCleared).toBe(15);
    expect(n.lastWaves).toBe(2);
  });
  it("stars clear a complete row and column", () => {
    let s = posed();
    for (let c = 2; c < 5; c++) s = set(s, c, 3, c === 3 ? "R0s" : "R0");
    const n = resolving(s).state;
    expect(n.lastCleared).toBe(15);
    expect(n.lastWaves).toBe(1);
  });
  it("four creates a brilliant at the central lower index without swap", () => {
    let s = posed();
    for (let c = 1; c < 5; c++) s = set(s, c, 4, "J0");
    const n = resolving(s).state;
    expect(n.board.cells.find((g) => g.cut === "brilliant")).toMatchObject({
      col: 2,
      kind: "jade",
      strain: 0,
    });
  });
  it("five creates a kindless prism at a swapped cell", () => {
    let s = posed();
    for (let c = 1; c < 6; c++) s = set(s, c, 4, "J0");
    const n = resolving({
      ...s,
      visual: {
        swap: [
          { col: 4, row: 4 },
          { col: 4, row: 5 },
        ],
        before: [],
        cleared: [],
        created: [],
        prismKind: null,
        openingTime: null,
      },
    }).state;
    expect(n.board.cells.find((g) => g.cut === "prism")).toMatchObject({
      col: 4,
      kind: null,
      strain: 0,
    });
  });
  it("crossing runs create stars and priority favors prisms", () => {
    let s = posed();
    for (let c = 1; c < 4; c++) s = set(s, c, 3, "J0");
    for (let r = 2; r < 5; r++) s = set(s, 2, r, "J0");
    expect(resolving(s).state.board.cells.some((g) => g.cut === "star")).toBe(
      true,
    );
    for (let c = 0; c < 5; c++) s = set(s, c, 3, "J0");
    const n = resolving(s).state;
    expect(n.board.cells.some((g) => g.cut === "prism")).toBe(true);
    expect(n.board.cells.some((g) => g.cut === "star")).toBe(false);
  });
  it("a prism swap clears the prism and its partner's kind", () => {
    const s = set(posed(), 0, 0, "X0");
    const count = s.board.cells.filter(
      (g) => g.kind === s.board.cells[1].kind,
    ).length;
    const n = advance(debug.requestSwap(s, 0, 0, 1, 0), C.SWAP_SECONDS);
    expect(n.lastCleared).toBe(count + 1);
    expect(n.visual?.created).toHaveLength(0);
  });
  it("two prisms take every cell, ignoring maximal runs", () => {
    let s = set(posed(), 0, 0, "X0");
    s = set(s, 1, 0, "X0");
    const n = advance(debug.requestSwap(s, 0, 0, 1, 0), C.SWAP_SECONDS);
    expect(n.lastCleared).toBe(C.GRID_COLS * C.GRID_ROWS);
    expect(n.lastPoints).toBe(640);
    expect(n.board.cells.every((g) => g.fell >= g.row + 1)).toBe(true);
  });
  it("honors column refill by destination row and preserves poses", () => {
    let s = posed();
    for (let c = 0; c < 3; c++) s = set(s, c, 4, "R0");
    for (let c = 0; c < 3; c++) s = debug.setRefillKinds(s, c, "M");
    const n = resolving(s).state;
    for (let c = 0; c < 3; c++) {
      expect(n.board.cells[c].kind).toBe("amethyst");
      expect(n.board.cells[4 * 8 + c].fell).toBe(1);
    }
    expect(n.refillKinds).toEqual(s.refillKinds);
  });
  it("caps the multiplier at eight", () => {
    let s = posed();
    for (let c = 0; c < 3; c++) s = set(s, c, 0, "R3");
    const n = resolve({ ...s, chainStep: 20, phase: "resolving" }).state;
    expect(n.lastPoints).toBe(480);
    expect(n.bestChain).toBe(20);
  });
});
describe("screens, menus, pointer and debug poses", () => {
  it("works every target by a press and release and cancels off-target", () => {
    let s = initial();
    const t = targets("title")[0];
    s = pointer(s, "down", t.x + 20, t.y + 20, "touch");
    expect(s.armedTarget).toBe(t.id);
    s = pointer(s, "up", 0, 0, "touch");
    expect(s.screen).toBe("title");
    s = pointer(s, "down", 640, 424);
    s = pointer(s, "up", 640, 424);
    expect(s.screen).toBe("playing");
    const pause = targets("playing")[0];
    s = pointer(s, "down", pause.x + 10, pause.y + 10);
    s = pointer(s, "up", pause.x + 10, pause.y + 10);
    expect(s.screen).toBe("paused");
  });
  it("offers on drag, withdraws at origin, plays only on release", () => {
    let s = match3();
    s = debug.pointerDown(s, cellX(2), cellY(0), "pen");
    s = debug.pointerMove(s, cellX(2), cellY(1), "pen");
    expect(s.offer).toEqual({ col: 2, row: 1 });
    expect(s.phase).toBe("idle");
    s = debug.pointerMove(s, cellX(2), cellY(0));
    expect(s.offer).toBeNull();
    s = debug.pointerUp(s);
    expect(s.selection).toEqual({ col: 2, row: 0 });
    s = debug.pointerDown(s, cellX(2), cellY(1));
    s = debug.pointerUp(s);
    expect(s.phase).toBe("swapping");
    expect(s.selection).toBeNull();
    expect(s.offer).toBeNull();
  });
  it("keeps an offer through irrelevant movement and breaks ties in reading order", () => {
    let s = posed();
    s = debug.pointerDown(s, cellX(0) + C.GEM_HIT_R, cellY(0));
    expect(s.selection).toEqual({ col: 0, row: 0 });
    s = debug.pointerMove(s, cellX(1), cellY(0));
    s = debug.pointerMove(s, 1200, 680);
    expect(s.offer).toEqual({ col: 1, row: 0 });
    s = debug.pointerDown(s, 10, 10);
    expect(s.selection).toBeNull();
    expect(s.offer).toBeNull();
  });
  it("wraps menus, returns to help choice, and abandons a round on quit", () => {
    let s = action(initial(), "up");
    expect(s.menuIndex).toBe(1);
    s = action(s, "confirm");
    expect(s.screen).toBe("howto");
    s = action(s, "back");
    expect(s.menuIndex).toBe(1);
    s = action(s, "down");
    s = action(s, "confirm");
    s = debug.setScore(s, 123);
    s = action(s, "pause");
    s = action(s, "down");
    s = action(s, "confirm");
    expect(s.screen).toBe("title");
    expect(s.board.cells).toHaveLength(0);
    expect(s.score).toBe(123);
    s = action(s, "confirm");
    expect(s.score).toBe(0);
  });
  it("gives every screen large separated targets wholly within stage", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      const ts = targets(screen);
      for (const t of ts) {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        expect(t.x + t.w).toBeLessThanOrEqual(C.STAGE_W);
        expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
      }
      if (ts.length === 2)
        expect(ts[0].y + ts[0].h).toBeLessThanOrEqual(ts[1].y);
    }
  });
  it("completes levels before dead-board evaluation, continues with a fresh board", () => {
    let s = match3();
    for (let c = 0; c < 8; c++)
      s = debug.setRefillKinds(
        s,
        c,
        Array.from(
          { length: 8 },
          (_, r) => "RACJBSM"[(c + r * 2 + 3) % 7],
        ).join(""),
      );
    s = debug.setLevelScore(s, C.LEVEL_TARGET_STEP);
    s = advance(debug.requestSwap(s, 2, 0, 2, 1), 2);
    expect(s.screen).toBe("levelclear");
    const score = s.score;
    s = action(s, "confirm");
    expect(s.level).toBe(2);
    expect(s.levelScore).toBe(0);
    expect(s.score).toBe(score);
    expect(s.bestChain).toBe(0);
    expect(runs(s.board)).toHaveLength(0);
  });
  it("clear/reset operations touch only their specified fields", () => {
    let s = debug.setSelection(posed(), 2, 2);
    s = debug.setOffer(s, 3, 2);
    s = debug.setMoveScore(s, 200);
    s = debug.setBestMove(s, 900);
    s = debug.setBestChain(s, 7);
    s = debug.setRefillKinds(s, 4, "RAC");
    expect(debug.clearSelection(s).offer).toEqual(s.offer);
    expect(debug.clearOffer(s).selection).toEqual(s.selection);
    expect(debug.clearBoard(s).bestMove).toBe(900);
    expect(debug.clearRefillKinds(s).refillKinds).toEqual(Array(8).fill(""));
    expect(debug.clearChain(s).board).toBe(s.board);
    expect(debug.reset({ ...s, muted: true })).toMatchObject({
      ...initial(true),
    });
  });
});

it("ends a round with no legal swap and prioritizes a completed level", () => {
  const ending = {
    ...posed(),
    phase: "resolving" as const,
    chainStep: 1,
    moveScore: 90,
  };
  expect(legalSwap(ending.board)).toBe(false);
  const events: string[] = [];
  const n = advance(ending, C.STEP_SECONDS, (name) => events.push(name));
  expect(n.screen).toBe("gameover");
  expect(n.bestMove).toBe(90);
  expect(events).toEqual([C.CUES.gameOver]);
  const level = advance(
    { ...ending, levelScore: C.LEVEL_TARGET_STEP },
    C.STEP_SECONDS,
  );
  expect(level.screen).toBe("levelclear");
  expect(action(n, "back").board).toEqual(n.board);
  expect(action(n, "confirm").score).toBe(0);
});

it("poses numeric scores exactly without restricting them to reachable play values", () => {
  const s = posed();
  expect(debug.setScore(s, -12.5).score).toBe(-12.5);
  expect(debug.setLevelScore(s, -1).levelScore).toBe(-1);
  expect(debug.setBestMove(s, 0.5).bestMove).toBe(0.5);
  expect(() => debug.setBestChain(s, 0.5)).toThrow();
  expect(() => debug.setMenuIndex(s, 0.5)).toThrow();
  expect(action(debug.setMenuIndex(initial(), 99), "confirm").screen).toBe(
    "title",
  );
});
