/* Core: constants, helpers, persistent state, progress model. DB is injected by build.py. */
"use strict";

const SEASONS = ["spring", "summer", "fall", "winter"];
const SEASON_LABEL = { spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter" };
const SEASON_COLOR = { spring: "var(--spring)", summer: "var(--summer)", fall: "var(--fall)", winter: "var(--winter)" };
const START_H = 6, SPAN_H = 20; // in-game day runs 6:00 AM to 2:00 AM
const STORE_KEY = "fishbook:perfection:v2";
const LEGACY_KEY = "fishbook:sve:v1";

/* ---------- DOM helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (id, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const fmt = n => Math.round(n).toLocaleString();
const pct = (a, b) => b ? a / b * 100 : 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function fmtHour(h, compact = false) {
  const hh = Math.floor(h) % 24, mm = Math.round((h % 1) * 60);
  const ap = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  if (compact) return mm ? `${h12}:${String(mm).padStart(2, "0")}${ap === "AM" ? "a" : "p"}` : `${h12}${ap === "AM" ? "a" : "p"}`;
  return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
}

function spriteHTML(img, name, cls = "") {
  const fb = esc((name || "?")[0]);
  const size = cls.includes("portrait") ? 44 : cls.includes("sm") ? 28 : 40;
  return `<div class="sprite ${cls}">${img
    ? `<img src="${img}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" data-fb="${fb}">`
    : `<span class="fallback">${fb}</span>`}</div>`;
}
// broken sprite -> letter fallback (no inline handlers, so the page can run under a strict CSP)
document.addEventListener("error", e => {
  const img = e.target;
  if (img.tagName !== "IMG" || !img.dataset.fb) return;
  img.replaceWith(Object.assign(document.createElement("span"), { className: "fallback", textContent: img.dataset.fb }));
}, true);
const imgOf = id => DB.img[id] || null;

function seasonsMini(seasons, current) {
  return `<div class="seasons-mini" aria-label="Seasons: ${seasons.length === 4 ? "all" : seasons.map(s => SEASON_LABEL[s]).join(", ") || "none"}">${SEASONS.map(s =>
    `<span class="${seasons.includes(s) ? "on" : ""}${s === current ? " cur" : ""}" style="--c:${SEASON_COLOR[s]}" title="${SEASON_LABEL[s]}">${icon(s)}</span>`).join("")}</div>`;
}

/* ---------- state ---------- */
const defaults = {
  // game clock (manual, or seeded from the save)
  season: "spring", day: 1, year: 1, weather: "sun", time: 180,
  spoilers: "hidden", // hidden | shown
  // manual progress, layered over the save: { cat: { key: value } }
  manual: {},
  // per-view UI prefs
  ui: {},
  // last imported save extract and the one before it (for the change log)
  save: null, prevSave: null, changes: null,
};
let state = loadState();
const revealed = new Set(); // per-session spoiler reveals (ids)

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s) return { ...defaults, ...s, manual: s.manual || {}, ui: s.ui || {} };
    // migrate the v1 fish tracker
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
    if (old) {
      const fishMap = {};
      for (const id of Object.keys(old.caught || {})) {
        const f = DB.fish.find(f => slug(f.name + "-" + f.source) === id);
        if (f) fishMap[f.id] = true;
      }
      return { ...defaults, season: old.season || "spring", day: old.day || 1, weather: old.weather || "sun", time: old.time ?? 180,
        spoilers: old.spoilers ? "shown" : "hidden", manual: { fish: fishMap } };
    }
  } catch {}
  return structuredClone(defaults);
}
let saveTimer;
const flush = () => { clearTimeout(saveTimer); try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { console.warn("save failed", e); } };
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 150); }
addEventListener("pagehide", flush);

const ui = (view, key, dflt) => (state.ui[view] && key in state.ui[view]) ? state.ui[view][key] : dflt;
function setUI(view, patch) { state.ui[view] = { ...(state.ui[view] || {}), ...patch }; persist(); }

/* ---------- progress model ----------
   Each category exposes boolean or numeric progress per key.
   Effective value = manual override if present, else the save value. */
function saveVal(cat, key) {
  const s = state.save;
  if (!s) return undefined;
  const src = s[cat];
  if (src == null) return undefined;
  if (Array.isArray(src)) return src.includes(key);
  if (typeof src === "object") return src[key];
  return undefined;
}
function manualVal(cat, key) { return state.manual[cat] ? state.manual[cat][key] : undefined; }
function val(cat, key) {
  const m = manualVal(cat, key);
  return m !== undefined ? m : saveVal(cat, key);
}
const isDone = (cat, key) => !!val(cat, key);
const isManual = (cat, key) => manualVal(cat, key) !== undefined && state.save != null && manualVal(cat, key) !== (saveVal(cat, key) ?? (typeof manualVal(cat, key) === "boolean" ? false : 0));
function setVal(cat, key, v) {
  state.manual[cat] = state.manual[cat] || {};
  const sv = saveVal(cat, key);
  // when the value matches the save again, drop the override
  if (state.save && (sv === v || (sv === undefined && (v === false || v === 0)))) delete state.manual[cat][key];
  else state.manual[cat][key] = v;
  persist();
  bus.emit("progress", { cat, key, v });
}

/* ---------- tiny event bus ---------- */
const bus = {
  map: {},
  on(ev, fn) { (this.map[ev] = this.map[ev] || []).push(fn); },
  emit(ev, data) { (this.map[ev] || []).forEach(fn => fn(data)); },
};

/* ---------- spoilers ---------- */
const spoilersOn = () => state.spoilers === "shown";
const canSee = (spoiler, id) => !spoiler || spoilersOn() || (id && revealed.has(id));

/* ---------- toast ---------- */
let toastTimer;
function toast(html, undo, ms = 5000) {
  const wrap = $("#toasts");
  wrap.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.innerHTML = `<span>${html}</span>${undo ? `<button type="button">Undo</button>` : ""}`;
  const dismiss = () => { t.classList.add("out"); setTimeout(() => t.remove(), 250); };
  if (undo) t.querySelector("button").onclick = () => { undo(); dismiss(); };
  wrap.appendChild(t);
  t.querySelectorAll("img").forEach(img => { if (!img.getAttribute("src")) img.remove(); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(dismiss, ms);
}

/* ---------- clock helpers ---------- */
const hourNow = () => START_H + state.time / 60;
const seasonIdx = () => SEASONS.indexOf(state.season);
const nextSeasonName = () => SEASONS[(seasonIdx() + 1) % 4];
const daysLeft = () => 28 - state.day + 1; // including today
const weekday = day => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(day - 1) % 7];
