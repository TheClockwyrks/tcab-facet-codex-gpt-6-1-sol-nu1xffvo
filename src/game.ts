import type { DeepReadonly } from "ts-essentials";
import type { Game } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import { initialize, update } from "./runtime";
import { render } from "./presentation";
import type { FacetDebugApi } from "./debug";
export type { FacetDebugApi } from "./debug";

export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly assets?: AssetBank;
  readonly visual?: VisualTransition;

  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];
}

/** Immutable visual projection of a resolved transaction, discarded by reset. */
export interface VisualTransition {
  readonly swap: readonly CellRef[];
  readonly before: readonly GemState[];
  readonly cleared: readonly { gem: GemState; wave: number }[];
  readonly created: readonly CellRef[];
  readonly prismKind: GemKind | "all" | null;
  readonly openingTime: number | null;
}
export interface AssetBank {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly systems: Readonly<Record<string, DeepReadonly<ParticleSystem>>>;
  readonly ladder: readonly AudioBuffer[];
  /** Decoded-tone playback resources; no simulation data is held in this graph. */
  readonly toneGraph?: {
    readonly context: AudioContext;
    readonly gain: GainNode;
  };
}
export const BACKGROUND = "#08131c";
export const game: Game<FacetState, FacetDebugApi> = {
  initialize,
  update,
  render,
};
