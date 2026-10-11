import type { RenderApi } from "@clockwyrks/simple-2d";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import type { GemState } from "./game";
import { cellX, cellY, same, type State } from "./simulation";
import { targets } from "./controls";
import * as C from "./constants";
const INK = "#e5ede9",
  MUTED = "#8ba5ad",
  GOLD = "#e4c18a",
  MINT = "#8cebd4";
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 18,
  color = INK,
  align: CanvasTextAlign = "left",
  font = "sans-serif",
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function rule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color = "#2b414a",
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#10232c";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#35505a";
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function sprite(
  s: State,
  ctx: CanvasRenderingContext2D,
  path: string,
  x: number,
  y: number,
  size = 64,
) {
  const image = s.assets?.images[path];
  if (image) ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
}
/** A pure visual projection: replay an authored simulator to the state's elapsed age. */
function particles(
  s: State,
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  if (age < 0 || age > (name === "aura" ? 1.2 : 1.1)) return;
  const authored = s.assets?.systems[name];
  if (!authored) return;
  const sim = new ParticleSimulator(authored as ParticleSystem, { seed });
  for (let t = 0; t < age; t += 1 / 30)
    sim.step(Math.min(1 / 30, age - t) * 1000);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = `rgb(${p.color.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)).join(",")})`;
    const px = x + p.position[0],
      py = y - p.position[1],
      r = p.size * 1.4;
    ctx.beginPath();
    ctx.moveTo(px, py - r * 2);
    ctx.lineTo(px + r, py);
    ctx.lineTo(px, py + r * 2);
    ctx.lineTo(px - r, py);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function gem(
  s: State,
  ctx: CanvasRenderingContext2D,
  g: GemState,
  x: number,
  y: number,
) {
  const stone = g.kind ?? "prism";
  sprite(s, ctx, `gems/${stone}-${g.strain}.png`, x, y);
  if (g.cut === "prism") {
    ctx.globalAlpha = 0.6;
    sprite(
      s,
      ctx,
      `gems/prism-turn/${Math.floor(s.simTime * 9) % 12}.png`,
      x,
      y,
    );
    ctx.globalAlpha = 1;
  } else if (g.cut !== "plain") sprite(s, ctx, `gems/${g.cut}.png`, x, y);
  if (g.cut !== "plain")
    particles(
      s,
      ctx,
      "aura",
      x,
      y,
      (s.simTime + g.col * 0.17 + g.row * 0.13) % 1.2,
      17 + g.col + g.row * 8,
    );
}
function backdrop(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createRadialGradient(
    C.STAGE_CX,
    C.STAGE_CY,
    60,
    C.STAGE_CX,
    C.STAGE_CY,
    750,
  );
  gradient.addColorStop(0, "#18343d");
  gradient.addColorStop(0.55, "#0e202a");
  gradient.addColorStop(1, "#071019");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#183039";
  ctx.lineWidth = 1;
  for (let x = -600; x < C.STAGE_W; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 720, 720);
    ctx.stroke();
  }
  for (let x = 0; x < 2000; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 720, 720);
    ctx.stroke();
  }
  rule(ctx, 48, 32, 1184);
  rule(ctx, 48, 688, 1184);
  text(ctx, "THE LAPIDARY COLLECTION", 52, 710, 11, MUTED);
  text(ctx, "01 / FACET", 1228, 710, 11, MUTED, "right");
}
function board(s: State, ctx: CanvasRenderingContext2D) {
  sprite(s, ctx, "gems/board-frame.png", C.BOARD_CX, C.BOARD_CY, 624);
  ctx.save();
  ctx.beginPath();
  ctx.rect(352, 108, 576, 576);
  ctx.clip();
  const shatter = s.lastWaves * C.WAVE_SECONDS;
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    if (s.phase === "swapping" && s.visual?.swap.length === 2) {
      const [a, b] = s.visual.swap;
      const other = same(g, a) ? b : same(g, b) ? a : null;
      if (other) {
        const t = s.swapTimer / C.SWAP_SECONDS,
          e = t * t * (3 - 2 * t);
        x = cellX(other.col) + (x - cellX(other.col)) * e;
        y = cellY(other.row) + (y - cellY(other.row)) * e;
      }
    } else if (s.phase === "idle" && s.selection && s.offer) {
      const other = same(g, s.selection)
        ? s.offer
        : same(g, s.offer)
          ? s.selection
          : null;
      if (other) {
        x = cellX(other.col);
        y = cellY(other.row);
      }
    }
    let fallAge: number | null = null;
    if (s.phase === "resolving") fallAge = Math.max(0, s.stepTimer - shatter);
    else if (
      s.visual?.openingTime !== null &&
      s.visual?.openingTime !== undefined
    )
      fallAge = s.simTime - s.visual.openingTime;
    if (fallAge !== null && g.fell) {
      const duration = g.fell * C.FALL_SECONDS_PER_ROW,
        t = Math.min(1, fallAge / duration);
      y -= g.fell * C.CELL_PITCH * (1 - t * t);
    }
    if (s.phase === "resolving" && s.stepTimer < shatter) {
      // At each wave only the old stone remains until its own fracture starts.
      const old = s.visual?.before.find((old) => same(old, g));
      const cleared = s.visual?.cleared.find((c) => same(c.gem, g));
      if (old && !cleared) {
        gem(s, ctx, old, cellX(old.col), cellY(old.row));
        continue;
      }
      if (cleared) continue;
    }
    gem(s, ctx, g, x, y);
  }
  if (s.phase === "resolving")
    for (const { gem: g, wave } of s.visual?.cleared ?? []) {
      const age = s.stepTimer - wave * C.WAVE_SECONDS;
      if (age < 0) {
        gem(s, ctx, g, cellX(g.col), cellY(g.row));
        continue;
      }
      if (age < 0.3 && g.kind)
        sprite(
          s,
          ctx,
          `gems/break/${g.kind}/${Math.min(5, Math.floor(age / 0.05))}.png`,
          cellX(g.col),
          cellY(g.row),
        );
      particles(
        s,
        ctx,
        g.strain === C.MAX_STRAIN ? "flawed" : "clear",
        cellX(g.col),
        cellY(g.row),
        age,
        Math.floor(s.score + g.col * 17 + g.row * 31),
      );
    }
  if (s.phase === "resolving")
    for (const p of s.visual?.created ?? [])
      particles(
        s,
        ctx,
        "cut",
        cellX(p.col),
        cellY(p.row),
        s.stepTimer -
          shatter -
          (s.board.cells[p.row * C.GRID_COLS + p.col]?.fell ?? 0) *
            C.FALL_SECONDS_PER_ROW,
        239 + p.col,
      );
  ctx.restore();
  if (s.selection) {
    ctx.strokeStyle = MINT;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      cellX(s.selection.col) - 33,
      cellY(s.selection.row) - 33,
      66,
      66,
    );
  }
  if (s.offer) {
    ctx.strokeStyle = GOLD;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(cellX(s.offer.col) - 33, cellY(s.offer.row) - 33, 66, 66);
    ctx.setLineDash([]);
  }
  if (s.refusal)
    for (const p of [s.refusal.a, s.refusal.b]) {
      ctx.strokeStyle = "#f78586";
      ctx.lineWidth = 3;
      ctx.strokeRect(cellX(p.col) - 33, cellY(p.row) - 33, 66, 66);
    }
}
function button(
  ctx: CanvasRenderingContext2D,
  t: { x: number; y: number; w: number; h: number },
  label: string,
  active: boolean,
) {
  panel(ctx, t.x, t.y, t.w, t.h);
  if (active) {
    ctx.fillStyle = "#213d42";
    ctx.fillRect(t.x + 1, t.y + 1, t.w - 2, t.h - 2);
    ctx.fillStyle = GOLD;
    ctx.fillRect(t.x, t.y, 3, t.h);
  }
  text(
    ctx,
    label,
    t.x + t.w / 2,
    t.y + t.h / 2 + 7,
    20,
    active ? "#fff1d5" : MUTED,
    "center",
  );
  if (active) text(ctx, "›", t.x + 26, t.y + t.h / 2 + 8, 28, GOLD);
}
function hud(s: State, ctx: CanvasRenderingContext2D) {
  text(ctx, C.TITLE_TEXT, 56, 88, 38, GOLD, "left", "Georgia");
  text(ctx, "PRESSURE / PATIENCE / PAYOFF", 57, 111, 10, MUTED);
  text(ctx, C.HUD_SCORE_LABEL, 354, 48, 12, MUTED);
  text(ctx, s.score.toLocaleString(), 354, 87, 34);
  text(
    ctx,
    `${C.HUD_LEVEL_LABEL}  ${String(s.level).padStart(2, "0")}`,
    690,
    48,
    12,
    GOLD,
  );
  text(
    ctx,
    `${s.levelScore.toLocaleString()} / ${(C.LEVEL_TARGET_STEP * s.level).toLocaleString()}`,
    954,
    48,
    12,
    MUTED,
    "right",
  );
  ctx.fillStyle = "#203641";
  ctx.fillRect(690, 64, 264, 8);
  ctx.fillStyle = MINT;
  ctx.fillRect(
    690,
    64,
    264 *
      Math.max(0, Math.min(1, s.levelScore / (C.LEVEL_TARGET_STEP * s.level))),
    8,
  );
  button(ctx, targets("playing")[0], C.PAUSE_LABEL, false);
  text(ctx, "THE STRAIN", 66, 238, 12, GOLD);
  rule(ctx, 66, 253, 190);
  const strainLabels = ["Clean", "Hairline", "Fractured", "Flawed · ×2"];
  for (let i = 0; i <= C.MAX_STRAIN; i++) {
    sprite(s, ctx, `gems/ruby-${i}.png`, 90, 287 + i * 67, 46);
    text(ctx, strainLabels[i], 125, 294 + i * 67, 15, i === 3 ? GOLD : MUTED);
  }
  text(ctx, "Make a line.", 66, 603, 17);
  text(ctx, "Leave a little pressure.", 66, 628, 17, MUTED);
  text(ctx, "Drag or tap a neighbor", 66, 657, 12, MUTED);
  text(ctx, "THE CUTS", 1026, 238, 12, GOLD);
  rule(ctx, 1026, 253, 190);
  for (const [i, cut] of ["brilliant", "star", "prism"].entries()) {
    gem(
      s,
      ctx,
      {
        col: 0,
        row: 0,
        kind: cut === "prism" ? null : "beryl",
        cut: cut as GemState["cut"],
        strain: 0,
        fell: 0,
      },
      1050,
      293 + i * 96,
    );
    text(ctx, cut.toUpperCase(), 1090, 285 + i * 96, 12);
    text(
      ctx,
      ["A ring of eight", "Row + column", "Every matching kind"][i],
      1027,
      333 + i * 96,
      13,
      MUTED,
    );
  }
  if (s.phase === "resolving") {
    text(
      ctx,
      `${C.HUD_CHAIN_LABEL}  ×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      1026,
      596,
      27,
      MINT,
    );
    text(
      ctx,
      `+${s.lastPoints}  /  ${s.lastCleared} stones`,
      1026,
      626,
      15,
      GOLD,
    );
  } else text(ctx, "FOLLOW THE FRACTURE", 1026, 626, 11, MUTED);
  text(
    ctx,
    s.muted ? "M  /  SOUND OFF" : "M  /  SOUND ON",
    1026,
    657,
    12,
    MUTED,
  );
}
function title(s: State, ctx: CanvasRenderingContext2D) {
  text(
    ctx,
    "A GAME OF STONES & CONSEQUENCES",
    C.STAGE_CX,
    95,
    12,
    MUTED,
    "center",
  );
  // The seven real sprites form the title's lapidary display, separate from any live board.
  for (let i = 0; i < C.GEM_KIND_COUNT; i++) {
    const angle = (i - 3) * 0.33;
    const x = C.STAGE_CX + Math.sin(angle) * 390,
      y = 217 + Math.abs(i - 3) * 14;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle * 0.2);
    sprite(s, ctx, `gems/${C.GEM_KINDS[i]}-0.png`, 0, 0, i === 3 ? 80 : 64);
    ctx.restore();
  }
  text(ctx, C.TITLE_TEXT, C.STAGE_CX, 332, 94, INK, "center", "Georgia");
  text(ctx, C.TAGLINE_TEXT, C.STAGE_CX, 362, 14, GOLD, "center");
  const ts = targets("title");
  C.TITLE_ITEMS.forEach((label, i) =>
    button(ctx, ts[i], label, i === s.menuIndex),
  );
  text(
    ctx,
    "MATCH THE GEMS. BUILD THE STRAIN. BREAK THE BOARD.",
    C.STAGE_CX,
    608,
    12,
    MUTED,
    "center",
  );
  text(
    ctx,
    "↑ ↓  CHOOSE     ENTER / SPACE  PLAY     M  SOUND",
    C.STAGE_CX,
    643,
    11,
    MUTED,
    "center",
  );
}
function howto(s: State, ctx: CanvasRenderingContext2D) {
  text(ctx, "THE ART OF PRESSURE", 76, 112, 42, INK, "left", "Georgia");
  text(ctx, "A small move can have a long afterlife.", 78, 151, 18, GOLD);
  const sections = [
    [
      "01  /  MAKE THE MATCH",
      "Seven kinds of stone. Hold a gem, drag to its neighbor, and release.",
      "Or tap a gem, then press and release its neighbor. Three in a line shatter.",
      "Return to your first stone to cancel. A move with no match is refused.",
    ],
    [
      "02  /  SPEND THE STRAIN",
      "Stones beside a clear take strain: hairline, fractured, then flawed.",
      "A flawed stone breaks with any clear touching it, and scores double.",
      "Fresh stones fall into the gaps. Each chain step multiplies your points.",
    ],
    [
      "03  /  EARN A CUT",
      "Four in a line: brilliant. Five or more: prism. Crossing lines: star.",
      "Brilliants take the surrounding ring; stars take their row and column.",
      "Swap a prism with a kind to take them all. Two prisms take the board.",
    ],
  ];
  for (const [i, lines] of sections.entries()) {
    const y = 215 + i * 117;
    rule(ctx, 78, y - 15, 850);
    text(ctx, lines[0], 78, y + 6, 13, MINT);
    for (let j = 1; j < lines.length; j++)
      text(ctx, lines[j], 78, y + 13 + j * 24, 17, MUTED);
  }
  text(
    ctx,
    "Reach the level target to continue. No legal move left ends the round.",
    78,
    591,
    17,
    GOLD,
  );
  text(
    ctx,
    "Mouse / pen / touch to play · ↑ ↓ menus · Enter / Space choose",
    78,
    631,
    14,
    MUTED,
  );
  text(ctx, "Esc / P pause · Esc back · M mute", 78, 656, 14, MUTED);
  for (let i = 0; i < 4; i++)
    sprite(s, ctx, `gems/jade-${i}.png`, 1080, 213 + i * 88);
  button(ctx, targets("howto")[0], C.BACK_LABEL, true);
}
export function render(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  backdrop(ctx);
  if (s.screen === "title") title(s, ctx);
  else if (s.screen === "howto") howto(s, ctx);
  else {
    board(s, ctx);
    hud(s, ctx);
    if (s.screen !== "playing") {
      ctx.fillStyle = "#061019d9";
      ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
      panel(ctx, 420, 177, 440, 425);
      const heading =
        s.screen === "paused"
          ? C.PAUSED_TITLE_TEXT
          : s.screen === "levelclear"
            ? C.LEVELCLEAR_TITLE_TEXT
            : C.GAMEOVER_TITLE_TEXT;
      text(ctx, heading, C.STAGE_CX, 257, 34, INK, "center", "Georgia");
      if (s.screen === "paused") {
        text(ctx, "THE STONES CAN WAIT.", C.STAGE_CX, 306, 13, GOLD, "center");
        text(
          ctx,
          "Your next move is still yours.",
          C.STAGE_CX,
          347,
          17,
          MUTED,
          "center",
        );
      } else if (s.screen === "levelclear") {
        text(
          ctx,
          `${C.HUD_LEVEL_LABEL} ${s.level}  /  ${s.levelScore.toLocaleString()} POINTS`,
          C.STAGE_CX,
          293,
          13,
          GOLD,
          "center",
        );
        text(
          ctx,
          `${C.BEST_CHAIN_LABEL}  ${s.bestChain}`,
          C.STAGE_CX,
          332,
          15,
          MUTED,
          "center",
        );
        text(
          ctx,
          `${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
          C.STAGE_CX,
          364,
          15,
          MUTED,
          "center",
        );
      } else {
        text(
          ctx,
          "EVERY STONE HAD ITS MOMENT.",
          C.STAGE_CX,
          303,
          12,
          GOLD,
          "center",
        );
        text(
          ctx,
          `${C.HUD_SCORE_LABEL}  ${s.score.toLocaleString()}`,
          C.STAGE_CX,
          351,
          30,
          INK,
          "center",
        );
      }
      const items =
        s.screen === "paused"
          ? C.PAUSED_ITEMS
          : s.screen === "levelclear"
            ? C.LEVELCLEAR_ITEMS
            : C.GAMEOVER_ITEMS;
      items.forEach((label, i) =>
        button(ctx, targets(s.screen)[i], label, s.menuIndex === i),
      );
    }
  }
  ctx.restore();
}
