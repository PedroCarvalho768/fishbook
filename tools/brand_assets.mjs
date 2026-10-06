// Render the PWA icons and the Open Graph card in the Rikode identity (D:/MENTORIA/marca):
// warm night background, gold pixel R at whole-number scale, Jacquard wordmark, in-game sprites, Bayer dither.
// Needs Chrome and the sprite cache in data/img/ (filled by build.py). Usage: node tools/brand_assets.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/pwa");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const R = ["#..###......#.", ".######.####..", ".....###..##..", ".....##.#.##..", "...####.#.##..", ".....##...#...",
  "...####.##....", ".....##...#...", ".....##.#.##..", "....##..#.##..", "..######..####", ".###.##....##."];
const rSvg = scale => `<svg width="${14 * scale}" height="${12 * scale}" viewBox="0 0 14 12" fill="#F9B73F" shape-rendering="crispEdges">${
  R.flatMap((row, y) => [...row.matchAll(/#+/g)].map(m => `<rect x="${m.index}" y="${y}" width="${m[0].length}" height="1"/>`)).join("")}</svg>`;
const sprite = name => "data:image/png;base64," + fs.readFileSync(path.join(ROOT, "data/img", name + ".png")).toString("base64");

const icon = (size, scale) => `<body style="margin:0;width:${size}px;height:${size}px;background:#150F0C;display:grid;place-items:center">${rSvg(scale)}</body>`;

const og = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600&family=Jacquard+24&family=Martian+Mono:wght@400&display=block" rel="stylesheet">
<style>
  body { margin: 0; width: 1200px; height: 630px; background: #150F0C; color: #EDE6DA; position: relative; overflow: hidden; font-family: Archivo, sans-serif; }
  .wrap { position: absolute; left: 88px; top: 84px; right: 88px; }
  .label { font: 400 18px "Martian Mono", monospace; letter-spacing: .08em; text-transform: uppercase; color: #9E968A; display: flex; align-items: center; gap: 16px; }
  h1 { font: 400 196px/0.9 "Jacquard 24", serif; -webkit-font-smoothing: none; margin: 26px 0 18px; letter-spacing: .01em; }
  p { font-size: 30px; line-height: 1.35; max-width: 23ch; margin: 0; color: #EDE6DA; }
  .sprites { position: absolute; right: 88px; top: 200px; display: grid; grid-template-columns: repeat(3, 96px); gap: 22px; }
  .sprites img { width: 96px; height: 96px; image-rendering: pixelated; object-fit: contain; }
  canvas { position: absolute; left: 0; bottom: 0; width: 1200px; height: 96px; color: #F9B73F; image-rendering: pixelated; }
</style></head><body>
<div class="wrap">
  <div class="label">${rSvg(3)}<span>Rikode · Almanac</span></div>
  <h1>almanac</h1>
  <p>Load your save and see what's left for Perfection in Stardew Valley Expanded.</p>
</div>
<div class="sprites">${["Sardine", "Parsnip", "Stardrop", "Golden_Walnut", "HeartIconLarge", "Gift_Icon"]
  .filter(n => fs.existsSync(path.join(ROOT, "data/img", n + ".png"))).map(n => `<img src="${sprite(n)}" alt="">`).join("")}</div>
<canvas></canvas>
<script>
  const B = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
  const cv = document.querySelector("canvas"), cell = 8, w = cv.width = 1200 / cell, h = cv.height = 96 / cell, x = cv.getContext("2d");
  x.fillStyle = "#F9B73F";
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const t = j / h; if (t * t > (B[(j % 8) * 8 + (i % 8)] + .5) / 64) x.fillRect(i, j, 1, 1); }
</script></body></html>`;

const browser = await chromium.launch({ executablePath: CHROME });
const shoot = async (html, w, h, file) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, file) });
  await p.close();
  console.log("wrote src/pwa/" + file);
};
await shoot(icon(192, 8), 192, 192, "icon-192.png");          // R at 8x: 112x96
await shoot(icon(512, 24), 512, 512, "icon-512.png");         // 24x: 336x288
await shoot(icon(512, 18), 512, 512, "icon-maskable-512.png"); // 18x keeps the R inside the maskable safe circle
await shoot(og, 1200, 630, "og.png");
await browser.close();
