import type { DeepReadonly } from "ts-essentials";
import type {
  BoardState,
  CellRef,
  Cut,
  FacetState,
  GemKind,
  GemState,
} from "./game";
import * as C from "./constants";

export type State = DeepReadonly<FacetState>;
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const index = (p: CellRef) => p.row * C.GRID_COLS + p.col;
export const same = (a: CellRef | null, b: CellRef | null) =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export const lastFall = (s: State) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const stepHold = (s: State) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
export const letters = "RACJBSM";
export function requireInt(n: number, min = 0, max = Infinity): void {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new RangeError(`Invalid integer: ${n}`);
}
export function cell(col: number, row: number): CellRef {
  requireInt(col, 0, C.GRID_COLS - 1);
  requireInt(row, 0, C.GRID_ROWS - 1);
  return { col, row };
}
export function parseToken(token: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(token))
    throw new Error(`Invalid gem token: ${token}`);
  return {
    col,
    row,
    kind: token[0] === "X" ? null : C.GEM_KINDS[letters.indexOf(token[0])],
    cut:
      token[0] === "X"
        ? "prism"
        : token[2] === "b"
          ? "brilliant"
          : token[2] === "s"
            ? "star"
            : "plain",
    strain: Number(token[1]),
    fell: 0,
  };
}
export function initial(muted = false): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  };
}
interface Run {
  cells: number[];
  kind: GemKind;
  horizontal: boolean;
}
export function runs(board: DeepReadonly<BoardState>): Run[] {
  const found: Run[] = [];
  for (const horizontal of [true, false])
    for (let line = 0; line < (horizontal ? board.rows : board.cols); line++) {
      let start = 0;
      const limit = horizontal ? board.cols : board.rows;
      const at = (n: number) =>
        horizontal ? line * board.cols + n : n * board.cols + line;
      while (start < limit) {
        const kind = board.cells[at(start)]?.kind;
        let end = start + 1;
        while (
          end < limit &&
          kind !== null &&
          board.cells[at(end)]?.kind === kind
        )
          end++;
        if (kind && end - start >= C.MATCH_MIN)
          found.push({
            cells: Array.from({ length: end - start }, (_, i) => at(start + i)),
            kind,
            horizontal,
          });
        start = end;
      }
    }
  return found;
}
function exchanged(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): BoardState {
  const ia = index(a),
    ib = index(b);
  return {
    ...board,
    cells: board.cells.map((g, i) =>
      i === ia
        ? { ...board.cells[ib], ...a, fell: 0 }
        : i === ib
          ? { ...board.cells[ia], ...b, fell: 0 }
          : { ...g },
    ),
  };
}
export function productive(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): boolean {
  return (
    adjacent(a, b) &&
    !!board.cells[index(a)] &&
    !!board.cells[index(b)] &&
    (board.cells[index(a)].cut === "prism" ||
      board.cells[index(b)].cut === "prism" ||
      runs(exchanged(board, a, b)).length > 0)
  );
}
export function legalSwap(board: DeepReadonly<BoardState>): boolean {
  return board.cells.some((g) =>
    [cellNeighbor(g, 1, 0), cellNeighbor(g, 0, 1)].some(
      (p) => p && productive(board, g, p),
    ),
  );
}
function cellNeighbor(g: CellRef, dx: number, dy: number): CellRef | null {
  const col = g.col + dx,
    row = g.row + dy;
  return col >= 0 && col < C.GRID_COLS && row >= 0 && row < C.GRID_ROWS
    ? { col, row }
    : null;
}
const randomKind = () =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind: GemKind;
        do {
          kind = randomKind();
        } while (
          (col >= 2 &&
            cells[cells.length - 1]?.kind === kind &&
            cells[cells.length - 2]?.kind === kind) ||
          (row >= 2 &&
            cells[(row - 1) * C.GRID_COLS + col]?.kind === kind &&
            cells[(row - 2) * C.GRID_COLS + col]?.kind === kind)
        );
        cells.push({ col, row, kind, cut: "plain", strain: 0, fell: row + 1 });
      }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(board)) return board;
  }
}
export function requestSwap(s: State, a: CellRef, b: CellRef): FacetState {
  if (!s.board.cells[index(a)] || !s.board.cells[index(b)])
    throw new Error("Swap requires a board");
  if (s.phase !== "idle" || !productive(s.board, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  const ga = s.board.cells[index(a)],
    gb = s.board.cells[index(b)];
  const prismKind =
    ga.cut === "prism" && gb.cut === "prism"
      ? "all"
      : ga.cut === "prism"
        ? gb.kind
        : gb.cut === "prism"
          ? ga.kind
          : null;
  return {
    ...s,
    board: exchanged(s.board, a, b),
    phase: "swapping",
    swapTimer: 0,
    chainStep: 0,
    stepTimer: 0,
    moveScore: 0,
    refusal: null,
    visual: {
      swap: [a, b],
      before: s.board.cells.map((g) => ({ ...g })),
      cleared: [],
      created: [],
      prismKind,
      openingTime: null,
    },
  };
}
export interface StepEvents {
  flaw: boolean;
  cut: boolean;
  clear: boolean;
}
export function resolve(s: State): { state: FacetState; events: StepEvents } {
  const rr = s.chainStep === 1 && s.visual?.prismKind ? [] : runs(s.board);
  const wave = new Map<number, number>();
  if (s.chainStep === 1 && s.visual?.prismKind) {
    s.board.cells.forEach((g, i) => {
      if (
        s.visual?.prismKind === "all" ||
        g.kind === s.visual?.prismKind ||
        (g.cut === "prism" && s.visual?.swap.some((p) => index(p) === i))
      )
        wave.set(i, 0);
    });
  } else rr.forEach((r) => r.cells.forEach((i) => wave.set(i, 0)));
  const queue = [...wave.keys()];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = s.board.cells[i],
      w = wave.get(i)!;
    const add = (j: number) => {
      if (!wave.has(j)) {
        wave.set(j, w + 1);
        queue.push(j);
      }
    };
    for (const h of s.board.cells) {
      const dx = Math.abs(g.col - h.col),
        dy = Math.abs(g.row - h.row);
      if (
        (g.cut === "brilliant" && dx <= 1 && dy <= 1) ||
        (g.cut === "star" && (dx === 0 || dy === 0)) ||
        (h.strain === C.MAX_STRAIN && dx + dy === 1)
      )
        add(index(h));
    }
  }
  if (!wave.size)
    return {
      state: { ...s },
      events: { flaw: false, cut: false, clear: false },
    };
  const created = new Map<number, { kind: GemKind | null; cut: Cut }>();
  const rank: Record<Cut, number> = {
    plain: 0,
    brilliant: 1,
    star: 2,
    prism: 3,
  };
  const create = (i: number, kind: GemKind, cut: Cut) => {
    if (rank[cut] > rank[created.get(i)?.cut ?? "plain"])
      created.set(i, { kind: cut === "prism" ? null : kind, cut });
  };
  for (const r of rr) {
    if (r.cells.length >= 4) {
      const candidates = r.cells.filter((i) =>
        s.visual?.swap.some((p) => index(p) === i),
      );
      const i = candidates[0] ?? r.cells[Math.floor((r.cells.length - 1) / 2)];
      create(i, r.kind, r.cells.length >= 5 ? "prism" : "brilliant");
    }
    for (const other of rr)
      if (other.horizontal !== r.horizontal)
        for (const i of r.cells)
          if (other.cells.includes(i)) create(i, r.kind, "star");
  }
  let flaw = false;
  const cells: (GemState | null)[] = s.board.cells.map((g, i) => {
    if (wave.has(i)) return null;
    const strained = [...wave.keys()].some((j) =>
      adjacent(g, s.board.cells[j]),
    );
    const strain = strained ? Math.min(C.MAX_STRAIN, g.strain + 1) : g.strain;
    if (strain === C.MAX_STRAIN && g.strain < C.MAX_STRAIN) flaw = true;
    return { ...g, strain, fell: 0 };
  });
  const createdGems = new Set<GemState>();
  const arrivals: CellRef[] = [];
  for (const [i, cut] of created) {
    const gem = { ...s.board.cells[i], ...cut, strain: 0, fell: 0 };
    cells[i] = gem;
    createdGems.add(gem);
  }
  for (let col = 0; col < C.GRID_COLS; col++) {
    const survivors = cells.filter(
      (g): g is GemState => g !== null && g.col === col,
    );
    const empty = C.GRID_ROWS - survivors.length;
    for (let row = 0; row < C.GRID_ROWS; row++) {
      const g = survivors[row - empty];
      if (g && createdGems.has(g)) arrivals.push({ col, row });
      cells[row * C.GRID_COLS + col] = g
        ? { ...g, row, fell: row - g.row }
        : {
            col,
            row,
            kind:
              C.GEM_KINDS[letters.indexOf(s.refillKinds[col][row])] ??
              randomKind(),
            cut: "plain",
            strain: 0,
            fell: row + 1,
          };
    }
  }
  const points = [...wave.keys()].reduce(
    (sum, i) =>
      sum +
      (s.board.cells[i].strain === C.MAX_STRAIN
        ? C.FLAWED_SCORE
        : C.BASE_SCORE) *
        Math.min(s.chainStep, C.MAX_MULTIPLIER),
    0,
  );
  return {
    state: {
      ...s,
      board: { ...s.board, cells: cells as GemState[] },
      stepTimer: 0,
      score: s.score + points,
      levelScore: s.levelScore + points,
      moveScore: s.moveScore + points,
      bestChain: Math.max(s.bestChain, s.chainStep),
      lastCleared: wave.size,
      lastPoints: points,
      lastWaves: Math.max(...wave.values()),
      visual: {
        swap: s.visual?.swap ?? [],
        before: s.board.cells.map((g) => ({ ...g })),
        cleared: [...wave].map(([i, w]) => ({
          gem: { ...s.board.cells[i] },
          wave: w,
        })),
        created: arrivals,
        prismKind: null,
        openingTime: null,
      },
    },
    events: { flaw, cut: created.size > 0, clear: true },
  };
}
/** Spend all elapsed time, including remainder across swap/step boundaries. */
export function advance(
  s: State,
  dt: number,
  onEvent: (name: string, rung?: number) => void = () => {},
): FacetState {
  let next: FacetState = { ...s };
  let left = dt;
  if (s.screen !== "playing") return next;
  while (left > 0 && next.phase !== "idle") {
    if (next.phase === "swapping") {
      const take = Math.min(left, Math.max(0, C.SWAP_SECONDS - next.swapTimer));
      left -= take;
      next = { ...next, swapTimer: next.swapTimer + take };
      if (next.swapTimer + 1e-10 >= C.SWAP_SECONDS) {
        const result = resolve({
          ...next,
          phase: "resolving",
          swapTimer: 0,
          chainStep: 1,
        });
        next = result.state;
        for (const [k, v] of Object.entries(result.events))
          if (v) onEvent(C.CUES[k as keyof StepEvents], next.chainStep);
      }
    } else {
      const take = Math.min(left, Math.max(0, stepHold(next) - next.stepTimer));
      left -= take;
      const landAt =
        next.lastWaves * C.WAVE_SECONDS +
        lastFall(next) * C.FALL_SECONDS_PER_ROW;
      if (
        next.stepTimer < landAt &&
        next.stepTimer + take >= landAt &&
        lastFall(next) > C.LAND_MIN_ROWS
      )
        onEvent(C.CUES.land);
      next = { ...next, stepTimer: next.stepTimer + take };
      if (next.stepTimer + 1e-10 >= stepHold(next)) {
        if (runs(next.board).length) {
          const result = resolve({
            ...next,
            chainStep: next.chainStep + 1,
            stepTimer: 0,
          });
          next = result.state;
          for (const [k, v] of Object.entries(result.events))
            if (v) onEvent(C.CUES[k as keyof StepEvents], next.chainStep);
        } else {
          next = {
            ...next,
            phase: "idle",
            chainStep: 0,
            stepTimer: 0,
            bestMove: Math.max(next.bestMove, next.moveScore),
          };
          if (next.levelScore >= C.LEVEL_TARGET_STEP * next.level) {
            next = {
              ...next,
              screen: "levelclear",
              menuIndex: 0,
              armedTarget: null,
            };
            onEvent(C.CUES.levelUp);
          } else if (!legalSwap(next.board)) {
            next = {
              ...next,
              screen: "gameover",
              menuIndex: 0,
              armedTarget: null,
            };
            onEvent(C.CUES.gameOver);
          }
        }
      }
    }
  }
  return next;
}
