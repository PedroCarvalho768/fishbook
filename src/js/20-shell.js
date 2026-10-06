/* Shell: router, navigation, clock bar, save card, settings, global keys. */

const VIEWS = {};
let currentRoute = null;

function route() { return (location.hash.replace(/^#\/?/, "").split("?")[0]) || ""; }
function routeParam(key) { const q = location.hash.split("?")[1]; return q ? new URLSearchParams(q).get(key) : null; }

const PAGE_TITLE = Object.fromEntries(NAV.flatMap(g => g.items).map(it => [it.route, it.label]));
function renderView(keepScroll = false) {
  const r = route();
  const v = VIEWS[r] || VIEWS.__notfound;
  // swap in a fresh container so listeners from the previous view don't pile up
  const old = $("#view");
  const el = old.cloneNode(false);
  old.replaceWith(el);
  const y = scrollY;
  try {
    v.render(el);
  } catch (e) {
    console.error(e);
    el.innerHTML = errorScreen();
  }
  currentRoute = r;
  document.title = `${VIEWS[r] ? PAGE_TITLE[r] || "Almanac" : "Page not found"} · Almanac`;
  renderNav();
  if (keepScroll) scrollTo(0, y);
}
function errorScreen() {
  return `<div class="empty">${icon("info", "art i")}<h1>This page hit a problem</h1>
    <p>Your progress is safe; it's saved separately. Reload to try again, or go back to the overview.</p>
    <div class="row"><button class="primary-btn" type="button" data-act="reload">${icon("refresh")}Reload</button><a class="ghost-btn" href="#/">Back to Perfection</a></div></div>`;
}
VIEWS.__notfound = {
  render(el) {
    el.innerHTML = `<div class="empty">${icon("search", "art i")}<h1>Page not found</h1>
      <p>There's no page at <code>${esc(location.hash || "/")}</code>. It may have been renamed.</p>
      <div class="row"><a class="primary-btn" href="#/">${icon("home")}Back to Perfection</a><button class="ghost-btn" type="button" data-act="palette">${icon("search")}Search everything</button></div></div>`;
  },
};
// last-resort net for errors outside a view's render: tell the user instead of failing silently
let lastErrorToast = 0;
function reportCrash(e) {
  console.error(e);
  if (Date.now() - lastErrorToast < 4000) return;
  lastErrorToast = Date.now();
  toast("Something went wrong. Your progress is saved; reloading usually fixes it.", null, 6000);
}
addEventListener("error", e => { if (e.target === window) reportCrash(e.error || e.message); });
addEventListener("unhandledrejection", e => reportCrash(e.reason));

addEventListener("hashchange", () => {
  closeRail();
  renderView();
  scrollTo(0, 0);
  $("#view").focus({ preventScroll: true });
});

/* ---------- nav ---------- */
function renderNav() {
  const p = perfection();
  const byId = Object.fromEntries(p.cats.map(c => [c.id, c]));
  const r = currentRoute ?? route();
  $("#nav").innerHTML = NAV.map(g => `${g.title ? `<h3>${g.title}</h3>` : ""}${g.items.map(it => {
    let right = "";
    if (it.route === "") right = `<span class="pct ${p.score >= 100 ? "done" : ""}">${p.score.toFixed(0)}%</span>`;
    else if (it.cat || it.cats) {
      const cs = (it.cats || [it.cat]).map(id => byId[id]);
      const frac = cs.reduce((a, c) => a + c.frac * c.weight, 0) / cs.reduce((a, c) => a + c.weight, 0);
      right = `<span class="pct ${frac >= 1 ? "done" : ""}"><span class="ring" style="--p:${(frac * 100).toFixed(1)}"></span>${it.cat ? `${byId[it.cat].done}/${byId[it.cat].total}` : `${Math.round(frac * 100)}%`}</span>`;
    } else if (it.beyond) {
      const b = beyondProgress(it.beyond);
      if (b) right = `<span class="pct ${b.done >= b.total ? "done" : ""}"><span class="ring" style="--p:${pct(b.done, b.total).toFixed(1)};--c:var(--ink-3)"></span>${b.done}/${b.total}</span>`;
    }
    return `<a href="#/${it.route}" ${it.route === r ? 'aria-current="page"' : ""}>${icon(it.icon)}<span>${it.label}</span>${right}</a>`;
  }).join("")}`).join("");
}
function beyondProgress(kind) {
  if (kind === "bundles" && bundlesList().length) { const l = bundlesList(); return { done: l.filter(bundleDone).length, total: l.length }; }
  if (kind === "museum" && DB.museum?.length) return { done: DB.museum.filter(m => isDone("museum", m.id)).length, total: DB.museum.length };
  return null;
}

/* ---------- rail (mobile drawer) ---------- */
function openRail() { $("#rail").classList.add("open"); $("#scrim").classList.add("on"); $("#rail a, #rail button")?.focus(); }
function closeRail() { $("#rail").classList.remove("open"); $("#scrim").classList.remove("on"); }
$("#scrim").addEventListener("click", closeRail);

/* ---------- clock bar ---------- */
function setPctVar(input) { input.style.setProperty("--pct", ((input.value - input.min) / (input.max - input.min) * 100) + "%"); }
function renderClock() {
  const h = hourNow();
  const [hm, ap] = fmtHour(h).split(" ");
  const fromSave = state.save && state.save.date && state.save.date.season === state.season && state.save.date.day === state.day;
  $("#clockbar").innerHTML = `
    <button class="menu-btn" type="button" id="menu-btn" aria-label="Open menu">${icon("menu")}</button>
    <div class="clock num" aria-live="polite">${hm}<small>${ap}</small></div>
    <div class="date-ctl clock-extra">
      <div class="seg" role="group" aria-label="Season">${SEASONS.map((s, i) => `<button type="button" data-season="${s}" aria-pressed="${state.season === s}" style="--c:${SEASON_COLOR[s]}" title="${SEASON_LABEL[s]} (${i + 1})">${icon(s)}<span class="lbl">${SEASON_LABEL[s]}</span></button>`).join("")}</div>
      <div class="day"><button type="button" data-day="-1" aria-label="Previous day">${icon("minus")}</button><output aria-label="Day">${weekday(state.day)} ${state.day}</output><button type="button" data-day="1" aria-label="Next day">${icon("plus")}</button></div>
    </div>
    <div class="seg clock-extra" role="group" aria-label="Weather"><button type="button" data-wx="sun" aria-pressed="${state.weather === "sun"}" style="--c:var(--summer)" title="Sunny, windy or snowing">${icon("sun")}<span class="lbl">Dry</span></button><button type="button" data-wx="rain" aria-pressed="${state.weather === "rain"}" style="--c:var(--rain)" title="Rain or storm (r)">${icon("rain")}<span class="lbl">Rain</span></button></div>
    <div class="time"><label class="sr-only" for="time">Time of day</label><input type="range" id="time" min="0" max="1200" step="10" value="${state.time}" aria-valuetext="${fmtHour(h)}"></div>
    <button type="button" class="ghost-btn summary-btn" id="clock-more" aria-expanded="false">${icon(state.season)}${SEASON_LABEL[state.season]} ${state.day} · ${icon(state.weather)}</button>
    <div class="sync">${state.save ? (fromSave ? `${icon("check")}Matches your save` : `<button class="link-btn" type="button" data-act="clock-from-save">Jump to save date (${SEASON_LABEL[state.save.date.season]} ${state.save.date.day})</button>`) : ""}</div>`;
  setPctVar($("#time"));
}
function setClock(patch) {
  Object.assign(state, patch);
  persist();
  renderClock();
  bus.emit("clock");
}
$("#clockbar").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "menu-btn") return openRail();
  if (b.id === "clock-more") { const on = $("#clockbar").classList.toggle("expanded"); b.setAttribute("aria-expanded", on); return; }
  const d = b.dataset;
  if (d.season) setClock({ season: d.season });
  else if (d.wx) setClock({ weather: d.wx });
  else if (d.day) {
    let day = state.day + +d.day, si = seasonIdx();
    if (day > 28) { day = 1; si = (si + 1) % 4; } else if (day < 1) { day = 28; si = (si + 3) % 4; }
    setClock({ day, season: SEASONS[si] });
  }
  else if (d.act === "clock-from-save") setClock({ season: state.save.date.season, day: state.save.date.day, weather: state.save.isRaining ? "rain" : "sun", year: state.save.date.year });
  if (d.season || d.day || d.wx) { const exp = $("#clockbar").classList.contains("expanded"); if (exp) { $("#clockbar").classList.add("expanded"); $("#clock-more").setAttribute("aria-expanded", "true"); } }
});
$("#clockbar").addEventListener("input", e => {
  if (e.target.id !== "time") return;
  state.time = +e.target.value; persist();
  setPctVar(e.target);
  const [hm, ap] = fmtHour(hourNow()).split(" ");
  $("#clockbar .clock").innerHTML = `${hm}<small>${ap}</small>`;
  e.target.setAttribute("aria-valuetext", fmtHour(hourNow()));
  bus.emit("clock", { timeOnly: true });
});
bus.on("clock", () => { const v = VIEWS[currentRoute]; if (v?.onClock) v.onClock(); else if (v?.clockSensitive) renderView(true); });

/* ---------- save card ---------- */
function renderSaveCard() {
  const s = state.save;
  const el = $("#save-card");
  if (!s) {
    el.innerHTML = `<div class="save-card empty" id="drop-zone">
      <p><b>Load your save</b> to fill everything in automatically. It never leaves this browser.</p>
      <div class="row"><button class="primary-btn" type="button" data-act="load-save">${icon("upload")}Load save file</button></div>
      <button class="link-btn" type="button" data-act="save-help" style="align-self:flex-start">Where's my save?</button>
      ${syncCardHTML()}
    </div>`;
  } else {
    const when = s.importedAt ? new Date(s.importedAt) : null;
    el.innerHTML = `<div class="save-card" id="drop-zone">
      <div class="farm"><span class="ring" style="--p:${perfection().score.toFixed(1)};--size:34px;--thick:4px;--ring-bg:var(--surface)"></span><div><b>${esc(s.farmer)} · ${esc(s.farm)} Farm</b><span>Year ${s.date.year}, ${SEASON_LABEL[s.date.season]} ${s.date.day}${when ? ` · loaded ${relTime(when)}` : ""}</span></div></div>
      ${sync.status === "live" ? "" : `<div class="row"><button class="ghost-btn" type="button" data-act="load-save">${icon("refresh")}Update</button><button class="ghost-btn" type="button" data-act="save-help">Help</button></div>`}
      ${syncCardHTML()}
    </div>`;
  }
}
function relTime(d) {
  const s = (Date.now() - d) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return d.toLocaleDateString();
}

function saveHelp() {
  openDialog(`<h2>Load your save file</h2>
    <p class="muted" style="margin-top:0">Pick the file named like your farm <b>without</b> an extension (for example <code>Pelican_123456789</code>), not <code>SaveGameInfo</code>. It's read in this browser only.</p>
    <dl class="paths">
      <dt>Windows</dt><dd><code>%AppData%\\StardewValley\\Saves\\&lt;Farm&gt;_&lt;id&gt;\\</code><br><span class="faint">Paste that into the file picker's address bar.</span></dd>
      <dt>macOS</dt><dd><code>~/.config/StardewValley/Saves/</code></dd>
      <dt>Linux / Steam Deck</dt><dd><code>~/.config/StardewValley/Saves/</code></dd>
    </dl>
    <p class="faint" style="font-size:var(--text-xs)">Tip: drag the file onto this page. Update after each play session to see what changed.</p>
    <form method="dialog" class="dlg-actions"><button class="ghost-btn" value="close">Close</button><button class="primary-btn" value="load" data-act="load-save">${icon("upload")}Choose file</button></form>`);
}

/* ---------- dialog helper ---------- */
function openDialog(html, onClose) {
  const d = $("#dialog");
  d.innerHTML = html;
  d.showModal();
  d.onclose = () => onClose?.(d.returnValue);
}

/* ---------- spoilers ---------- */
function renderSpoilerBtn() {
  const b = $("#spoiler-btn");
  b.setAttribute("aria-pressed", spoilersOn());
  b.querySelector("use").setAttribute("href", spoilersOn() ? "#i-eye" : "#i-eye-off");
  b.querySelector("span").textContent = spoilersOn() ? "Spoilers shown" : "Spoilers hidden";
}
$("#spoiler-btn").addEventListener("click", () => {
  state.spoilers = spoilersOn() ? "hidden" : "shown"; persist();
  renderSpoilerBtn(); renderView(true);
});

/* ---------- settings ---------- */
$("#settings-btn").addEventListener("click", () => {
  const manualCount = Object.values(state.manual).reduce((a, m) => a + Object.keys(m).length, 0);
  openDialog(`<h2>Settings</h2>
    <div class="set-list">
      <div class="set-row"><div><b>Spoilers</b><span>Story-gated SVE areas and characters stay hidden until you choose.</span></div>
        <div class="seg"><button type="button" data-set-spoil="hidden" aria-pressed="${!spoilersOn()}">Hidden</button><button type="button" data-set-spoil="shown" aria-pressed="${spoilersOn()}">Shown</button></div></div>
      <div class="set-row"><div><b>Back up progress</b><span>Download a file with your save data and manual checks, or restore one.</span></div>
        <div class="row"><button class="ghost-btn" type="button" data-act="export">${icon("down")}Export</button><button class="ghost-btn" type="button" data-act="import">${icon("up")}Import</button></div></div>
      <div class="set-row"><div><b>Manual changes</b><span>${manualCount ? `${plural(manualCount, "item")} set by hand${state.save ? ", on top of your save" : ""}.` : "None yet."}</span></div>
        <button class="ghost-btn danger" type="button" data-act="clear-manual" ${manualCount ? "" : "disabled"}>${icon("reset")}Clear</button></div>
      <div class="set-row"><div><b>Loaded save</b><span>${state.save ? `${esc(state.save.farmer)}, ${esc(state.save.farm)} Farm` : "No save loaded."}</span></div>
        <button class="ghost-btn danger" type="button" data-act="forget-save" ${state.save ? "" : "disabled"}>${icon("x")}Forget</button></div>
      <div class="set-row"><div><b>Delete all Almanac data</b><span>Removes your loaded save, manual ticks, settings and live-sync link from this browser.</span></div>
        <button class="ghost-btn danger" type="button" data-act="wipe">${icon("x")}Delete…</button></div>
      <div class="set-row"><div><b>Keyboard shortcuts</b><span>Press <span class="kbd">?</span> anywhere.</span></div><button class="ghost-btn" type="button" data-act="keys">${icon("keyboard")}Show</button></div>
    </div>
    <p class="faint" style="font-size:var(--text-xs);margin:16px 0 0">Data: Stardew Valley ${esc(DB.meta.gameVersion)} and Stardew Valley Expanded ${esc(DB.meta.sveVersion)} game files, plus the official wikis. Built ${esc(DB.meta.built)}.</p>
    <form method="dialog" class="dlg-actions"><button class="primary-btn">Done</button></form>`);
});

function showKeys() {
  openDialog(`<h2>Keyboard shortcuts</h2>
    <dl class="keys">
      <dt><span class="kbd">Ctrl</span> <span class="kbd">K</span></dt><dd>Search everything</dd>
      <dt><span class="kbd">/</span></dt><dd>Search this page</dd>
      <dt><span class="kbd">j</span> <span class="kbd">k</span></dt><dd>Move between items</dd>
      <dt><span class="kbd">x</span></dt><dd>Toggle the focused item</dd>
      <dt><span class="kbd">Enter</span></dt><dd>Open details</dd>
      <dt><span class="kbd">[</span> <span class="kbd">]</span></dt><dd>Time back / forward 1 hour</dd>
      <dt><span class="kbd">,</span> <span class="kbd">.</span></dt><dd>Previous / next day</dd>
      <dt><span class="kbd">1</span>–<span class="kbd">4</span></dt><dd>Spring, Summer, Fall, Winter</dd>
      <dt><span class="kbd">r</span></dt><dd>Toggle rain</dd>
      <dt><span class="kbd">g</span> then <span class="kbd">h t s f c</span></dt><dd>Go to Perfection, Today, Shipping, Fish, Cooking…</dd>
    </dl>
    <form method="dialog" class="dlg-actions"><button class="primary-btn">Done</button></form>`);
}

/* ---------- delete everything ---------- */
let wipeArmed = 0;
async function wipeAll(e) {
  const btn = e?.target?.closest?.("[data-act=wipe]");
  if (Date.now() - wipeArmed > 4000) {
    wipeArmed = Date.now();
    if (btn) btn.innerHTML = `${icon("x")}Click again to delete`;
    return;
  }
  clearTimeout(saveTimer);
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(LEGACY_KEY);
  try { await stopSync(); indexedDB.deleteDatabase("fishbook-sync"); } catch {}
  try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
  location.hash = "#/";
  location.reload();
}

/* ---------- export / import ---------- */
function exportProgress() {
  const data = { app: "fishbook", version: 2, exported: new Date().toISOString(), state: { ...state, prevSave: null } };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  a.download = `almanac-${slug(state.save?.farm || "progress")}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Progress exported");
}
async function importProgress(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app === "fishbook" && data.state && typeof data.state === "object") {
      const before = structuredClone(state);
      const s = data.state, obj = v => v && typeof v === "object" && !Array.isArray(v);
      state = {
        ...structuredClone(defaults),
        season: SEASONS.includes(s.season) ? s.season : defaults.season,
        day: clamp(+s.day || 1, 1, 28), year: Math.max(1, +s.year || 1),
        weather: s.weather === "rain" ? "rain" : "sun", time: clamp(+s.time || 0, 0, 1200),
        spoilers: s.spoilers === "shown" ? "shown" : "hidden",
        manual: obj(s.manual) ? s.manual : {}, ui: obj(s.ui) ? s.ui : {},
        save: obj(s.save) ? s.save : null, changes: null,
      };
      persist(); applyModRecipes(); fullRender();
      toast("Progress restored", () => { state = before; persist(); fullRender(); });
      return;
    }
    if (data.app === "fishbook-sve" && Array.isArray(data.caught)) { // v1 fish export
      state.manual.fish = state.manual.fish || {};
      let n = 0;
      data.caught.forEach(x => { const f = DB.fish.find(f => f.name.toLowerCase() === String(x.name).toLowerCase()); if (f) { state.manual.fish[f.id] = true; n++; } });
      persist(); fullRender(); toast(`Imported ${plural(n, "caught fish", "caught fish")}`);
      return;
    }
    throw new Error("unknown");
  } catch { toast("That file isn't an Almanac backup. Nothing changed."); }
}

/* ---------- global click actions ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act], [data-set-spoil]");
  if (!t) return;
  if (t.dataset.setSpoil) {
    state.spoilers = t.dataset.setSpoil; persist(); renderSpoilerBtn(); renderView(true);
    t.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === t));
    return;
  }
  const act = t.dataset.act;
  const actions = {
    "load-save": () => $("#save-file").click(),
    "save-help": saveHelp,
    "export": exportProgress,
    "import": () => $("#import-file").click(),
    "keys": showKeys,
    "reload": () => location.reload(),
    "palette": () => openPalette(),
    "wipe": wipeAll,
    "clear-manual": () => {
      const before = state.manual; state.manual = {}; persist(); fullRender(); $("#dialog").close();
      toast("Manual changes cleared", () => { state.manual = before; persist(); fullRender(); });
    },
    "forget-save": () => {
      const before = state.save; state.save = null; persist(); fullRender(); $("#dialog").close();
      toast("Save forgotten", () => { state.save = before; persist(); fullRender(); });
    },
  };
  if (actions[act]) { e.preventDefault(); actions[act](e); }
});

$("#import-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) importProgress(f); e.target.value = ""; });
$("#save-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) loadSaveFile(f); e.target.value = ""; });

/* drag and drop anywhere */
let dragDepth = 0;
addEventListener("dragenter", e => { if (e.dataTransfer?.types?.includes("Files")) { dragDepth++; document.body.classList.add("dragging"); } });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
addEventListener("dragover", e => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
addEventListener("drop", e => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging");
  const f = e.dataTransfer.files[0];
  if (/\.json$/i.test(f.name)) importProgress(f); else loadSaveFile(f);
});

/* ---------- global keys ---------- */
let gPending = 0;
document.addEventListener("keydown", e => {
  const tag = e.target.tagName;
  const typing = (tag === "INPUT" && !["checkbox", "range", "radio"].includes(e.target.type)) || tag === "SELECT" || tag === "TEXTAREA";
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (e.key === "Escape") { if ($("#rail").classList.contains("open")) closeRail(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || $("#dialog").open) return;
  const k = e.key;
  if (gPending && Date.now() - gPending < 1200) {
    gPending = 0;
    const go = { h: "", t: "today", s: "shipping", f: "fish", c: "cooking", r: "crafting", v: "friends", m: "monsters", d: "stardrops", w: "walnuts", a: "farm", b: "bundles", u: "museum" }[k];
    if (go !== undefined) { e.preventDefault(); location.hash = "#/" + go; }
    return;
  }
  if (k === "g") { gPending = Date.now(); return; }
  if (k === "?") { showKeys(); return; }
  if (k === "[" || k === "]") { setClock({ time: clamp(state.time + (k === "]" ? 60 : -60), 0, 1200) }); return; }
  if (k === "," || k === ".") { $(`#clockbar [data-day="${k === "." ? 1 : -1}"]`)?.click(); return; }
  if (/^[1-4]$/.test(k)) { setClock({ season: SEASONS[+k - 1] }); return; }
  if (k === "r") { setClock({ weather: state.weather === "rain" ? "sun" : "rain" }); return; }
  VIEWS[currentRoute]?.onKey?.(e);
});

function fullRender() {
  renderSaveCard(); renderClock(); renderSpoilerBtn(); renderView(true);
}
bus.on("progress", () => { renderNav(); renderSaveCard(); });

/* ---------- rikode dither: 1-bit Bayer 8x8 fade in pink, once, at the foot of the rail ---------- */
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
function drawDither(cv, cell = 4) {
  const w = cv.width = Math.max(1, Math.round(cv.clientWidth / cell)), h = cv.height = Math.max(1, Math.round(cv.clientHeight / cell));
  const ctx = cv.getContext("2d");
  ctx.fillStyle = getComputedStyle(cv).color;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / h;
    if (t * t > (BAYER[(y % 8) * 8 + (x % 8)] + 0.5) / 64) ctx.fillRect(x, y, 1, 1);
  }
}
const ditherEl = $(".rail .dither");
if (ditherEl) { drawDither(ditherEl); new ResizeObserver(() => drawDither(ditherEl)).observe(ditherEl); }
