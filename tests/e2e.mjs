// End-to-end checks in a real Chrome (playwright-core + the installed browser).
//
// 1. The in-browser save parser must agree with the independent Python parser (tools/extract_save.py)
//    on every Perfection input, and the Perfection score must match a separate re-computation.
// 2. Every page renders without errors, manual progress persists, keyboard shortcuts work.
// 3. Live sync picks up a changed save file; the hosted build works offline.
//
// Save used: $FISHBOOK_SAVE, else data/research/save/tmp/<save>, else the newest folder in %APPDATA%/StardewValley/Saves.
// Save-dependent checks are skipped (not failed) when no save is found.
// Chrome: $CHROME_PATH or the default Windows install path.

import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = "fishbook:perfection:v2";

let failures = 0, passes = 0, skips = 0;
const ok = (cond, name, detail = "") => {
  if (cond) { passes++; console.log(`  ✓ ${name}`); }
  else { failures++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`); }
};
const skip = name => { skips++; console.log(`  - ${name} (skipped)`); };
const setEq = (a, b) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every(x => B.has(x)); };
const diff = (a, b) => `only in browser: ${[...a].filter(x => !b.includes(x)).slice(0, 6).join(", ") || "-"}; only in python: ${[...b].filter(x => !a.includes(x)).slice(0, 6).join(", ") || "-"}`;

function findSave() {
  if (process.env.FISHBOOK_SAVE && fs.existsSync(process.env.FISHBOOK_SAVE)) return process.env.FISHBOOK_SAVE;
  const tmp = path.join(ROOT, "data/research/save/tmp");
  if (fs.existsSync(tmp)) { const f = fs.readdirSync(tmp).find(n => /_\d+$/.test(n)); if (f) return path.join(tmp, f); }
  const saves = path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "StardewValley/Saves");
  if (!fs.existsSync(saves)) return null;
  const dirs = fs.readdirSync(saves).filter(d => fs.existsSync(path.join(saves, d, d))).map(d => path.join(saves, d, d));
  return dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

async function main() {
  const server = spawn("python", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch({ executablePath: CHROME });
  const errors = [];
  const newPage = async (viewport = { width: 1440, height: 900 }) => {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(String(e.stack || e).slice(0, 300)));
    return p;
  };
  const DB = JSON.parse(fs.readFileSync(path.join(ROOT, "data/db.json"), "utf8"));

  try {
    /* ---------------- 1. parser vs python oracle ---------------- */
    console.log("Save parsing");
    const savePath = findSave();
    if (!savePath) { skip("no save file found"); }
    else {
      // copy first: never read the live save while the game might write it
      const copy = path.join(os.tmpdir(), "fishbook-test-" + path.basename(savePath));
      fs.copyFileSync(savePath, copy);
      const oracleOut = path.join(os.tmpdir(), "fishbook-oracle.json");
      execFileSync("python", [path.join(ROOT, "tools/extract_save.py"), copy, oracleOut], { stdio: "ignore", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
      const oracle = JSON.parse(fs.readFileSync(oracleOut, "utf8"));
      const F = oracle.farmers[0], W = oracle.world;

      const p = await newPage();
      await p.goto(`${BASE}/fishbook.html`);
      const t0 = Date.now();
      await p.setInputFiles("#save-file", copy);
      await p.waitForFunction(k => JSON.parse(localStorage.getItem(k) || "{}").save, KEY, { timeout: 20000 });
      ok(Date.now() - t0 < 8000, `parses a ${(fs.statSync(copy).size / 1e6).toFixed(1)} MB save quickly (${Date.now() - t0} ms)`);
      const S = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).save, KEY);

      const fishIds = new Set(DB.fish.map(f => f.id));
      const expFish = Object.keys(F.fishCaught).filter(id => fishIds.has(id));
      ok(setEq(S.fish, expFish), `fish caught match (${S.fish.length})`, diff(S.fish, expFish));

      const shipIds = new Set(DB.shipping.map(s => s.id));
      const expShip = Object.keys(F.basicShipped).map(id => "(O)" + id).filter(id => shipIds.has(id));
      ok(setEq(S.shipping, expShip), `items shipped match (${S.shipping.length})`, diff(S.shipping, expShip));

      const cookedYields = new Set(Object.keys(F.recipesCooked));
      const expCook = DB.cooking.filter(r => cookedYields.has(r.yieldId)).map(r => r.id);
      const sCook = S.cooking.filter(id => DB.cooking.some(r => r.id === id));
      ok(setEq(sCook, expCook), `dishes cooked match (${sCook.length})`, diff(sCook, expCook));
      const modKnown = Object.keys(F.cookingRecipesKnown).filter(n => !DB.cooking.some(r => r.id === n));
      ok(setEq((S.extraCooking || []).map(r => r.id), modKnown), `recipes from other mods detected (${modKnown.length})`);

      const crafted = new Set(F.craftingRecipesCraftedAtLeastOnce);
      const expCraft = DB.crafting.filter(r => crafted.has(r.id)).map(r => r.id);
      const sCraft = S.crafting.filter(id => DB.crafting.some(r => r.id === id));
      ok(setEq(sCraft, expCraft), `items crafted match (${sCraft.length})`, diff(sCraft, expCraft));

      const pts = Object.fromEntries(Object.entries(F.friendshipData).map(([k, v]) => [k, v.points]));
      const badFriends = Object.keys(pts).filter(k => S.friends[k] !== pts[k]);
      ok(!badFriends.length, `friendship points match (${Object.keys(pts).length} villagers)`, badFriends.join(", "));

      const kills = F.specificMonstersKilled;
      const badGoals = DB.monsters.filter(m => S.monsters[m.id] !== m.targets.reduce((a, t) => a + (kills[t] || 0), 0)).map(m => m.id);
      ok(!badGoals.length, "monster slayer kills match", badGoals.join(", "));

      const expDrops = Object.entries(F.stardropFlags).filter(([, v]) => v).map(([k]) => k);
      ok(setEq(S.stardrops, expDrops), `stardrops match (${S.stardrops.length})`, diff(S.stardrops, expDrops));
      ok(S.walnutCount === W.goldenWalnutsFound, `golden walnuts match (${S.walnutCount})`);
      const skills = ["farming", "fishing", "foraging", "mining", "combat", "luck"];
      ok(skills.every(s => S.skills[s] === F.levels[s]), "skill levels match");
      const museumIds = new Set(DB.museum.map(m => m.id));
      const expMuseum = Object.values(W.museumPieces).map(id => "(O)" + id).filter(id => museumIds.has(id));
      ok(setEq(S.museum, expMuseum), `museum donations match (${S.museum.length})`);
      const expBuild = Object.keys(W.perfectionBuildings || {}).filter(k => W.perfectionBuildings[k]);
      ok(setEq(Object.keys(S.buildings || {}), expBuild), "obelisks and Gold Clock match");
      ok(S.inventory && Object.keys(S.inventory).length > 0, `inventory read (${Object.keys(S.inventory || {}).length} item types)`);

      // independent perfection re-computation (Utility.percentGameComplete weights)
      const frac = (a, b) => Math.min(1, b ? a / b : 0);
      const counts = x => x.counts !== false && !x.countsWhen;
      const vill = DB.villagers.filter(counts);
      const friendsDone = vill.filter(v => Math.floor((pts[v.id] || 0) / 250) >= (v.dateable ? 8 : 10)).length;
      const lvl = Math.min(25, Math.floor(skills.reduce((a, s) => a + F.levels[s], 0) / 2));
      const fishC = DB.fish.filter(counts), shipC = DB.shipping.filter(counts);
      const expected =
        15 * frac(shipC.filter(s => expShip.includes(s.id)).length, shipC.length) +
        10 * frac(fishC.filter(f => expFish.includes(f.id)).length, fishC.length) +
        10 * frac(expCook.length + (S.extraCooking || []).filter(r => r.cooked).length, DB.cooking.filter(counts).length + (S.extraCooking || []).length) +
        10 * frac(expCraft.length + (S.extraCrafting || []).filter(r => r.crafted).length, DB.crafting.filter(counts).length + (S.extraCrafting || []).length) +
        11 * frac(friendsDone, vill.length) +
        10 * frac(DB.monsters.filter(m => m.targets.reduce((a, t) => a + (kills[t] || 0), 0) >= m.count).length, 12) +
        10 * frac(expDrops.length, 7) + 5 * frac(W.goldenWalnutsFound, 130) + 5 * frac(lvl, 25) +
        4 * frac(["Earth Obelisk", "Water Obelisk", "Desert Obelisk", "Island Obelisk"].filter(b => expBuild.includes(b)).length, 4) +
        10 * (expBuild.includes("Gold Clock") ? 1 : 0) + (W.perfectionWaivers || 0);
      await p.goto(`${BASE}/fishbook.html#/`); await p.waitForTimeout(300);
      const shown = parseFloat(await p.textContent(".hero-ring b"));
      ok(Math.abs(shown - expected) < 0.06, `perfection score ${shown}% matches independent calculation (${expected.toFixed(2)}%)`);
      await p.context().close();
    }

    /* ---------------- 2. UI ---------------- */
    console.log("Interface");
    {
      const p = await newPage();
      await p.goto(`${BASE}/fishbook.html`);
      for (const r of ["", "today", "fish", "shipping", "cooking", "crafting", "friends", "monsters", "stardrops", "walnuts", "farm", "bundles", "museum"]) {
        await p.goto(`${BASE}/fishbook.html#/${r}`); await p.waitForTimeout(150);
        const h = await p.textContent("#view h1");
        ok(!!h && errors.length === 0, `page #/${r || "(home)"} renders: ${h?.trim().slice(0, 30)}`, errors.splice(0).join(" | "));
      }
      await p.goto(`${BASE}/fishbook.html#/shipping`); await p.waitForTimeout(200);
      await p.keyboard.press("j"); await p.keyboard.press("x"); await p.waitForTimeout(200);
      ok((await p.textContent('#nav a[href="#/shipping"] .pct')).startsWith("1/"), "keyboard j + x ticks an item");
      await p.goto(`${BASE}/fishbook.html#/friends`); await p.waitForTimeout(200);
      await p.click('.item:first-child [data-n="10"]');
      await p.goto(`${BASE}/fishbook.html#/monsters`); await p.waitForTimeout(200);
      await p.fill('[data-kills="Slimes"]', "1000"); await p.press('[data-kills="Slimes"]', "Tab");
      await p.reload(); await p.waitForTimeout(300);
      ok((await p.textContent('#nav a[href="#/monsters"] .pct')).startsWith("1/"), "manual progress survives a reload");
      await p.keyboard.press("Control+k"); await p.keyboard.type("lunaloo"); await p.waitForTimeout(150);
      ok((await p.$$("#pal-list [data-i]")).length >= 3, "Ctrl+K search finds the Lunaloos");
      await p.keyboard.press("Enter"); await p.waitForTimeout(300);
      ok((await p.evaluate(() => location.hash)).startsWith("#/fish?item="), "search result opens the item");
      ok(errors.length === 0, "no page errors during interaction", errors.splice(0).join(" | "));
      await p.context().close();

      const m = await newPage({ width: 390, height: 844 });
      await m.goto(`${BASE}/fishbook.html#/today`); await m.waitForTimeout(200);
      const overflow = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ok(overflow <= 1, `no horizontal overflow on a phone (${overflow}px)`);
      await m.click("#menu-btn"); await m.waitForTimeout(350);
      ok(await m.evaluate(() => document.querySelector("#rail").classList.contains("open")), "phone menu opens");
      await m.context().close();
    }

    /* ---------------- 3. live sync + offline ---------------- */
    console.log("Live sync and offline");
    if (!savePath) skip("live sync needs a save file");
    else {
      const p = await newPage();
      await p.goto(`${BASE}/fishbook.html`);
      const xml = fs.readFileSync(savePath, "utf8").replace(/^\uFEFF/, "");
      // stand in for the file picker: put the save in the origin-private file system and register its handle
      await p.evaluate(async xml => {
        const root = await navigator.storage.getDirectory();
        const h = await root.getFileHandle("save", { create: true });
        const w = await h.createWritable(); await w.write(xml); await w.close();
        const db = await new Promise(r => { const q = indexedDB.open("fishbook-sync", 1); q.onupgradeneeded = () => q.result.createObjectStore("handles"); q.onsuccess = () => r(q.result); });
        await new Promise(r => { const tx = db.transaction("handles", "readwrite"); tx.objectStore("handles").put(h, "save"); tx.oncomplete = r; });
      }, xml);
      await p.reload();
      await p.waitForFunction(k => JSON.parse(localStorage.getItem(k) || "{}").save, KEY, { timeout: 20000 });
      ok((await p.textContent("#save-card")).includes("Live sync on"), "live sync resumes after reload");
      const day = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).save.date.day, KEY);
      const next = xml.replace(`<dayOfMonth>${day}</dayOfMonth>`, `<dayOfMonth>${day % 28 + 1}</dayOfMonth>`).replace(`<dayOfMonthForSaveGame>${day}</dayOfMonthForSaveGame>`, `<dayOfMonthForSaveGame>${day % 28 + 1}</dayOfMonthForSaveGame>`);
      await p.evaluate(async xml => { const root = await navigator.storage.getDirectory(); const h = await root.getFileHandle("save"); const w = await h.createWritable(); await w.write(xml); await w.close(); }, next);
      await p.waitForFunction(([k, d]) => JSON.parse(localStorage.getItem(k)).save.date.day === d, [KEY, day % 28 + 1], { timeout: 20000 }).catch(() => {});
      ok(await p.evaluate(([k, d]) => JSON.parse(localStorage.getItem(k)).save.date.day === d, [KEY, day % 28 + 1]), "a changed save file reloads by itself");
      await p.context().close();
    }
    {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(`${BASE}/docs/`);
      await p.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.getRegistration().then(r => r?.active), null, { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(800);
      await ctx.setOffline(true);
      await p.reload().catch(() => {});
      await p.waitForTimeout(500);
      ok((await p.$$("#nav a")).length > 10, "hosted build loads offline");
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${passes} passed, ${failures} failed${skips ? `, ${skips} skipped` : ""}`);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
