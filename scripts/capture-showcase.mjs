/* global document */
import { Buffer } from "node:buffer";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:5173");
await page.waitForLoadState("networkidle");
const media = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const canvas = document.createElement("canvas");
  canvas.id = "stage";
  document.querySelector("canvas").replaceWith(canvas);
  const engine = createEngine({
    canvas,
    game,
    width: 1280,
    height: 720,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
  });
  await engine.initialize();
  const d = engine.debug;
  await engine.advance(1);
  const title = canvas.toDataURL("image/png");
  engine.apply((s) => d.pointerDown(s, 640, 424));
  engine.apply((s) => d.pointerUp(s));
  await engine.advance(60);
  const rows = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => `${"RACJBSM"[(c + r * 2) % 7]}0`).join(
      " ",
    ),
  );
  engine.apply((s) => d.loadBoard(s, rows));
  for (let col = 1; col <= 3; col++)
    engine.apply((s) => d.setGem(s, col, 3, col === 3 ? "A0" : "R0"));
  engine.apply((s) => d.setGem(s, 3, 4, "R0"));
  for (const [col, row, token] of [
    [1, 4, "J3"],
    [2, 4, "B3"],
    [4, 4, "M3"],
    [5, 4, "S3"],
    [4, 3, "M3"],
    [5, 3, "J3s"],
    [6, 4, "B3b"],
    [0, 0, "X0"],
    [6, 6, "C2"],
    [2, 6, "M3"],
    [4, 6, "R2"],
    [7, 6, "A1b"],
  ])
    engine.apply((s) => d.setGem(s, col, row, token));
  for (let col = 0; col < 8; col++)
    engine.apply((s) =>
      d.setRefillKinds(
        s,
        col,
        Array.from(
          { length: 8 },
          (_, r) => "RACJBSM"[(col + r * 2 + 3) % 7],
        ).join(""),
      ),
    );
  await engine.advance(1);
  const board = canvas.toDataURL("image/png");
  engine.startRecording();
  engine.apply((s) => d.requestSwap(s, 3, 3, 3, 4));
  await engine.advance(30);
  const chain = canvas.toDataURL("image/png");
  await engine.advance(150);
  const replay = engine.stopRecording();
  const snapshot = d.snapshot(engine.state);
  engine.destroy();
  return { title, board, chain, replay, snapshot };
});
await mkdir("showcase", { recursive: true });
for (const name of ["title", "board", "chain"]) {
  await writeFile(
    `showcase/${name}.png`,
    Buffer.from(media[name].split(",")[1], "base64"),
  );
}
await writeFile(
  "showcase/pressure.json.gz",
  gzipSync(JSON.stringify(media.replay)),
);
await browser.close();
