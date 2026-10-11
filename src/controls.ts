import type { CellRef, FacetState, PointerDevice, Screen } from "./game";
import type { State } from "./simulation";
import {
  adjacent,
  cellX,
  cellY,
  deal,
  initial,
  requestSwap,
  same,
} from "./simulation";
import * as C from "./constants";
export interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export function targets(screen: Screen): Target[] {
  if (screen === "playing")
    return [
      {
        id: "pause",
        x: 1056,
        y: 38,
        w: C.TARGET_MIN_W + 32,
        h: C.TARGET_MIN_H,
      },
    ];
  if (screen === "howto")
    return [{ id: "back", x: 1060, y: 598, w: 144, h: C.TARGET_MIN_H }];
  const y = screen === "title" ? 388 : 420;
  return [0, 1].map((i) => ({
    id: `menu-${i}`,
    x: 480,
    y: y + i * 90,
    w: 320,
    h: C.TARGET_MIN_H,
  }));
}
export function show(s: State, screen: Screen, index = 0): FacetState {
  return { ...s, screen, menuIndex: index, armedTarget: null };
}
export function freshRound(s: State): FacetState {
  return {
    ...initial(s.muted),
    assets: s.assets,
    screen: "playing",
    simTime: s.simTime,
    pointer: s.pointer,
    board: deal(),
    visual: {
      swap: [],
      before: [],
      cleared: [],
      created: [],
      prismKind: null,
      openingTime: s.simTime,
    },
  };
}
export function choose(s: State): FacetState {
  if (s.menuIndex !== 0 && s.menuIndex !== 1) return { ...s };
  if (s.screen === "title")
    return s.menuIndex === 0 ? freshRound(s) : show(s, "howto");
  if (s.screen === "paused" && s.menuIndex === 0) return show(s, "playing");
  if (s.screen === "gameover" && s.menuIndex === 0) return freshRound(s);
  if (s.screen === "levelclear" && s.menuIndex === 0)
    return {
      ...show(s, "playing"),
      level: s.level + 1,
      levelScore: 0,
      bestMove: 0,
      bestChain: 0,
      selection: null,
      offer: null,
      board: deal(),
      visual: {
        swap: [],
        before: [],
        cleared: [],
        created: [],
        prismKind: null,
        openingTime: s.simTime,
      },
    };
  if (["paused", "levelclear", "gameover"].includes(s.screen))
    return {
      ...show(s, "title"),
      board: { cols: 0, rows: 0, cells: [] },
      phase: "idle",
      chainStep: 0,
      swapTimer: 0,
      stepTimer: 0,
      selection: null,
      offer: null,
      refusal: null,
      visual: undefined,
    };
  return { ...s };
}
export function action(s: State, name: string): FacetState {
  if (name === "pause" && s.screen === "playing") return show(s, "paused");
  if (name === "pause" && s.screen === "paused") return show(s, "playing");
  if (name === "back" && s.screen === "howto") return show(s, "title", 1);
  if (name === "back" && s.screen === "gameover") return show(s, "title");
  if (["title", "paused", "levelclear", "gameover"].includes(s.screen)) {
    if (name === "up" || name === "down")
      return {
        ...s,
        menuIndex: (s.menuIndex + (name === "up" ? -1 : 1) + 2) % 2,
      };
    if (name === "confirm") return choose(s);
  }
  return { ...s };
}
export function hitCell(s: State, x: number, y: number): CellRef | null {
  let closest: CellRef | null = null,
    best = C.GEM_HIT_R ** 2;
  for (const g of s.board.cells) {
    const distance = (cellX(g.col) - x) ** 2 + (cellY(g.row) - y) ** 2;
    if (distance <= best && (distance < best || !closest)) {
      closest = { col: g.col, row: g.row };
      best = distance;
    }
  }
  return closest;
}
export function pointer(
  s: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): FacetState {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !["mouse", "pen", "touch"].includes(device)
  )
    throw new Error("Invalid pointer");
  const down = type === "down" ? true : type === "up" ? false : s.pointer.down;
  let next: FacetState = { ...s, pointer: { x, y, down, device } };
  const target = targets(s.screen).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target?.id.startsWith("menu-") && (!s.pointer.down || type === "down"))
    next = { ...next, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") next = { ...next, armedTarget: target?.id ?? null };
  if (type === "up") {
    next = { ...next, armedTarget: null };
    if (target && s.armedTarget === target.id)
      return target.id === "pause"
        ? action(next, "pause")
        : target.id === "back"
          ? action(next, "back")
          : choose(next);
    if (s.armedTarget) return next;
  }
  if (s.screen !== "playing" || target || s.armedTarget) return next;
  const hit = hitCell(s, x, y);
  if (type === "down") {
    if (!hit) return { ...next, selection: null, offer: null };
    if (
      !s.selection ||
      (!same(s.selection, hit) && !adjacent(s.selection, hit))
    )
      return { ...next, selection: hit, offer: null };
    return { ...next, offer: same(s.selection, hit) ? null : hit };
  }
  if (type === "move" && down && s.selection && hit) {
    if (same(s.selection, hit)) return { ...next, offer: null };
    if (adjacent(s.selection, hit)) return { ...next, offer: hit };
  }
  if (type === "up" && s.selection && s.offer)
    return {
      ...requestSwap(next, s.selection, s.offer),
      selection: null,
      offer: null,
    };
  return next;
}
