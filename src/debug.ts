import type { FacetState, Screen } from "./game";
import {
  type State,
  cell,
  cellX,
  cellY,
  deal,
  initial,
  lastFall,
  legalSwap,
  parseToken,
  requestSwap,
  requireInt,
  stepHold,
  letters,
} from "./simulation";
import { pointer, targets } from "./controls";
import * as C from "./constants";
function points(n: number) {
  if (!Number.isFinite(n)) throw new RangeError(`Invalid points: ${n}`);
  return n;
}
function whole(n: number) {
  requireInt(n);
  return n;
}
function boardCell(s: State, col: number, row: number) {
  const p = cell(col, row);
  if (!s.board.cells[row * C.GRID_COLS + col])
    throw new Error("No board in play");
  return p;
}
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: State): FacetState => ({ ...initial(s.muted), assets: s.assets }),
  reconcile: (s: State): FacetState => ({ ...s }),
  snapshot: (s: State) => ({
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      cols: s.board.cols,
      rows: s.board.rows,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection ? { ...s.selection } : null,
    offer: s.offer ? { ...s.offer } : null,
    refusal: s.refusal
      ? { a: { ...s.refusal.a }, b: { ...s.refusal.b } }
      : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s.screen),
    muted: s.muted,
    simTime: s.simTime,
  }),
  setScreen: (s: State, screen: Screen): FacetState => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s: State, index: number): FacetState => ({
    ...s,
    menuIndex: whole(index),
  }),
  loadBoard: (s: State, rows: readonly string[]): FacetState => {
    if (rows.length !== C.GRID_ROWS) throw new Error("Board needs eight rows");
    const cells = rows.flatMap((line, row) => {
      const tokens = line.trim().split(/\s+/);
      if (tokens.length !== C.GRID_COLS)
        throw new Error("Board needs eight columns");
      return tokens.map((token, col) => parseToken(token, col, row));
    });
    return { ...s, board: { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells } };
  },
  dealBoard: (s: State): FacetState => ({
    ...s,
    board: deal(),
    visual: {
      swap: [],
      before: [],
      cleared: [],
      created: [],
      prismKind: null,
      openingTime: s.simTime,
    },
  }),
  clearBoard: (s: State): FacetState => ({
    ...s,
    board: { cols: 0, rows: 0, cells: [] },
  }),
  setGem: (s: State, col: number, row: number, token: string): FacetState => {
    boardCell(s, col, row);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g) =>
          g.col === col && g.row === row
            ? parseToken(token, col, row)
            : { ...g },
        ),
      },
    };
  },
  setRefillKinds: (s: State, col: number, kinds: string): FacetState => {
    requireInt(col, 0, C.GRID_COLS - 1);
    if ([...kinds].some((k) => !letters.includes(k)))
      throw new Error("Invalid refill kinds");
    return {
      ...s,
      refillKinds: s.refillKinds.map((k, i) => (i === col ? kinds : k)),
    };
  },
  clearRefillKinds: (s: State): FacetState => ({
    ...s,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  }),
  setScore: (s: State, n: number): FacetState => ({ ...s, score: points(n) }),
  setLevel: (s: State, n: number): FacetState => {
    requireInt(n, 1);
    return { ...s, level: n };
  },
  setLevelScore: (s: State, n: number): FacetState => ({
    ...s,
    levelScore: points(n),
  }),
  setBestChain: (s: State, n: number): FacetState => ({
    ...s,
    bestChain: whole(n),
  }),
  setBestMove: (s: State, n: number): FacetState => ({
    ...s,
    bestMove: points(n),
  }),
  setMoveScore: (s: State, n: number): FacetState => ({
    ...s,
    moveScore: points(n),
  }),
  setSelection: (s: State, col: number, row: number): FacetState => ({
    ...s,
    selection: cell(col, row),
  }),
  clearSelection: (s: State): FacetState => ({ ...s, selection: null }),
  setOffer: (s: State, col: number, row: number): FacetState => ({
    ...s,
    offer: cell(col, row),
  }),
  clearOffer: (s: State): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: State): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: State): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (
    s: State,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): FacetState => requestSwap(s, cell(colA, rowA), cell(colB, rowB)),
  pointerDown: (
    s: State,
    x: number,
    y: number,
    device: "mouse" | "pen" | "touch" = "mouse",
  ): FacetState => pointer(s, "down", x, y, device),
  pointerMove: (
    s: State,
    x: number,
    y: number,
    device: "mouse" | "pen" | "touch" = "mouse",
  ): FacetState => pointer(s, "move", x, y, device),
  pointerUp: (
    s: State,
    device: "mouse" | "pen" | "touch" = "mouse",
  ): FacetState => pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
export type FacetDebugApi = typeof debug;
