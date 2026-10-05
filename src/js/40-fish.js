/* Fish view: the original Fishbook tracker, running on the shared clock and progress model. */

const FISH_CAT_LABEL = { fish: "Fish", legendary: "Legendary", legendary2: "Legendary II", "crab-pot": "Crab pot", "night-market": "Night Market", other: "Other" };

const fishAllDay = f => f.time.length === 1 && f.time[0][0] <= 6 && f.time[0][1] >= 26;
const fishTimeText = f => fishAllDay(f) ? "Any time" : f.time.map(([a, b]) => `${fmtHour(a, true)}–${fmtHour(b, true)}`).join(", ");
function fishNextSeason(f) {
  for (let k = 1; k < 4; k++) { const s = SEASONS[(seasonIdx() + k) % 4]; if (f.seasons.includes(s)) return s; }
  return null;
}
function fishLeaving(f) {
  if (f.seasons.length === 4 || f.seasons.includes(nextSeasonName())) return 0;
  const left = daysLeft();
  return left <= 7 ? left : 0;
}
function fishStatus(f) {
  if (isDone("fish", f.id)) return { key: "done", text: "Caught", rank: 6 };
  const t = hourNow();
  if (!f.seasons.includes(state.season)) {
    const n = fishNextSeason(f);
    return { key: "off", text: n ? `Back in ${SEASON_LABEL[n]}` : "Not this season", rank: 5 };
  }
  if (f.weather !== "any" && f.weather !== state.weather) return { key: "off", text: f.weather === "rain" ? "Needs rain" : "Needs a dry day", rank: 4 };
  const lv = fishLeaving(f);
  if (f.difficulty == null) {
    const verb = f.category === "crab-pot" ? "In crab pots now" : "Available now";
    return lv ? { key: "leaving", text: `${verb} · leaves in ${lv}d`, rank: 0 } : { key: "now", text: verb, rank: 1 };
  }
  const win = f.time.find(([a, b]) => t >= a && t < b);
  if (win) {
    if (lv) return { key: "leaving", text: `Bites now · leaves in ${lv}d`, rank: 0 };
    return { key: "now", text: fishAllDay(f) || win[1] >= 26 ? "Bites now" : `Bites now · until ${fmtHour(win[1], true)}`, rank: 1 };
  }
  const next = f.time.map(r => r[0]).filter(a => a > t).sort((a, b) => a - b)[0];
  if (next != null) return { key: "later", text: `Opens ${fmtHour(next, true)}`, rank: 2 };
  return { key: "off", text: "Done for today", rank: 3 };
}
const fishBitingNow = f => { const s = fishStatus(f).key; return s === "now" || s === "leaving"; };
const fishLocsVisible = f => f.locations.filter(l => canSee(l.spoiler, f.id));

VIEWS.fish = (() => {
  const V = "fish";
  let query = "";
  const open = new Set();
  const get = (k, d) => ui(V, k, d);

  function matches(f, ignore = {}) {
    const src = get("source", "all");
    if (!ignore.source && src !== "all" && f.source !== src) return false;
    const st = get("status", "all");
    if (!ignore.status) {
      if (st === "missing" && isDone("fish", f.id)) return false;
      if (st === "caught" && !isDone("fish", f.id)) return false;
    }
    if (!ignore.now && get("nowOnly", false) && !fishBitingNow(f)) return false;
    const loc = get("loc", null);
    if (!ignore.loc && loc && !f.locations.some(l => l.place === loc && canSee(l.spoiler))) return false;
    if (!get("showExtra", false) && f.counts === false && !isDone("fish", f.id) && !ignore.extra) return false;
    if (!ignore.query && query) {
      const hay = f._search ??= [f.name, f.source === "sve" ? "sve expanded" : "vanilla", FISH_CAT_LABEL[f.category], ...f.locations.flatMap(l => [l.place, l.detail]), ...(f.recipes || []), ...(f.lovedBy || []), f.behavior || "", f.notes || ""].join(" ").toLowerCase();
      if (!query.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t))) return false;
    }
    return true;
  }
  function sorted(list) {
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name),
      price: (a, b) => b.price - a.price || a.name.localeCompare(b.name),
      difficulty: (a, b) => (b.difficulty || 0) - (a.difficulty || 0) || a.name.localeCompare(b.name),
      smart: (a, b) => fishStatus(a).rank - fishStatus(b).rank || (!fishLocsVisible(a).length) - (!fishLocsVisible(b).length) || a.name.localeCompare(b.name),
    }[get("sort", "smart")];
    return list.slice().sort(cmp);
  }
  function diffColor(d) {
    if (d == null) return "var(--ink-3)";
    if (d < 40) return "var(--spring)"; if (d < 70) return "var(--summer)"; if (d < 90) return "var(--fall)";
    return "var(--danger)";
  }
  function locText(f) {
    const vis = [...new Set(fishLocsVisible(f).map(l => l.place))];
    const hidden = new Set(f.locations.map(l => l.place)).size - vis.length;
    const parts = vis.map(esc);
    if (hidden) parts.push(`<span class="secret">${!vis.length ? "Secret location" : `+${hidden} secret`}</span>`);
    return parts.join(`<span class="sep">·</span>`);
  }
  function rowHTML(f) {
    const st = fishStatus(f);
    const caught = isDone("fish", f.id);
    const segs = f.time.map(([a, b]) => {
      const l = Math.max(0, (a - START_H) / SPAN_H * 100), r = Math.min(100, (b - START_H) / SPAN_H * 100);
      return `<span class="seg-t" style="left:${l}%;width:${Math.max(r - l, 1.5)}%"></span>`;
    }).join("");
    const mark = (hourNow() - START_H) / SPAN_H * 100;
    const wxMismatch = f.weather !== "any" && f.weather !== state.weather;
    const wxLabel = f.weather === "rain" ? "Rain only" : f.weather === "sun" ? "Dry days only" : "Any weather";
    const tags = [
      f.source === "sve" ? `<span class="tag sve">SVE</span>` : "",
      f.category === "legendary" || f.category === "legendary2" ? `<span class="tag leg">${FISH_CAT_LABEL[f.category]}</span>` : "",
      f.category === "crab-pot" || f.category === "night-market" ? `<span class="tag misc">${FISH_CAT_LABEL[f.category]}</span>` : "",
      f.counts === false ? `<span class="tag misc" title="Doesn't count toward Perfection">Not in Perfection</span>` : "",
      isManual("fish", f.id) ? `<span class="tag manual" title="Set by hand, differs from your save">manual</span>` : "",
    ].join("");
    const isOpen = open.has(f.id);
    return `<li class="fish st-${st.key}${caught ? " caught" : ""}${isOpen ? " open" : ""}" data-id="${esc(f.id)}">
      <div class="fish-row">
        <label class="catch" title="${caught ? "Unmark" : "Mark"} ${esc(f.name)} as caught">
          <input type="checkbox" ${caught ? "checked" : ""} aria-label="Caught ${esc(f.name)}" data-catch="${esc(f.id)}">
          <span class="box">${icon("check", "")}</span><span class="ripple"></span>
        </label>
        ${spriteHTML(f.img, f.name)}
        <div class="name-cell">
          <button type="button" class="name-btn" aria-expanded="${isOpen}" data-open="${esc(f.id)}"><span class="nm">${esc(f.name)}</span>${tags}</button>
          <div class="locs">${locText(f)}</div>
          <div class="status ${st.key}"><i></i>${esc(st.text)}</div>
        </div>
        ${seasonsMini(f.seasons, state.season).replace("seasons-mini", "seasons-mini fish-seasons")}
        <div class="time-cell">
          <div class="timebar" aria-hidden="true"><div class="tb-rail">${segs}</div><span class="mark" style="left:${mark}%"></span></div>
          <div class="time-txt">${fishTimeText(f)}</div>
        </div>
        <div class="wx ${f.weather}${wxMismatch ? " mismatch" : ""}" title="${wxLabel}" aria-label="${wxLabel}">${icon(f.weather)}</div>
        <div class="diff">${f.difficulty != null
          ? `<div class="v"><b>${f.difficulty}</b><span>${esc(cap(f.behavior || ""))}</span></div><div class="meter"><i style="width:${Math.min(100, f.difficulty / 110 * 100)}%;--dc:${diffColor(f.difficulty)}"></i></div>`
          : `<div class="v"><span>${f.category === "crab-pot" ? "Crab pot" : "No minigame"}</span></div>`}</div>
        <div class="price">${fmt(f.price)}<small>g</small></div>
      </div>
      <div class="detail">${isOpen ? detailHTML(f) : "<div></div>"}</div>
    </li>`;
  }
  function detailHTML(f) {
    const show = canSee(true, f.id);
    const locs = f.locations.map(l => l.spoiler && !show
      ? `<li><span class="secret">SVE story location</span> <button type="button" class="reveal-btn" data-reveal="${esc(f.id)}">Reveal</button></li>`
      : `<li>${esc(l.place)}${l.detail ? ` <span class="muted">· ${esc(l.detail)}</span>` : ""}${l.sve && f.source === "vanilla" ? ` <span class="tag sve" title="Added by Stardew Valley Expanded">SVE</span>` : ""}</li>`).join("");
    const loved = (f.lovedBy || []).map(n => DB.villagerByName[n]).filter(Boolean);
    const lovedVis = loved.filter(v => canSee(v.spoiler, f.id));
    const block = (t, b, c = "") => `<div class="dl ${c}"><h4>${t}</h4>${b}</div>`;
    return `<div><div class="detail-inner fish-detail">
      ${block("Where", `<ul>${locs}</ul>`)}
      ${block("When", `<ul><li>${f.seasons.length === 4 ? "All seasons" : f.seasons.map(s => SEASON_LABEL[s]).join(", ")}</li>${f.seasonNote ? `<li class="muted">${esc(f.seasonNote)}</li>` : ""}<li>${fishTimeText(f)}</li><li>${f.weather === "any" ? "Any weather" : f.weather === "rain" ? "Rainy days only" : "Sunny or windy days only"}</li></ul>`)}
      ${block("Catching", `<ul>${f.difficulty != null ? `<li>Difficulty ${f.difficulty}${f.behavior ? ` · ${esc(cap(f.behavior))}` : ""}</li>` : `<li>${f.category === "crab-pot" ? "Caught in a crab pot" : "No minigame"}</li>`}<li>${f.minLevel ? `Fishing level ${f.minLevel}+` : "No level requirement"}</li><li>Sells for ${fmt(f.price)}g base</li></ul>`)}
      ${f.recipes?.length ? block("Used in", `<ul>${f.recipes.map(r => { const c = DB.cooking.find(c => c.name === r); return `<li>${c ? `<a href="#/cooking?item=${encodeURIComponent(c.id)}">${esc(r)}</a>${isDone("cooking", c.id) ? ` <span class="faint">· cooked</span>` : ""}` : esc(r)}</li>`; }).join("")}</ul>`) : ""}
      ${loved.length ? block("Loved by", `<ul>${lovedVis.map(v => `<li><a href="#/friends?item=${encodeURIComponent(v.id)}">${esc(v.name)}</a></li>`).join("")}${loved.length > lovedVis.length ? `<li><span class="secret">+${loved.length - lovedVis.length} SVE character</span> <button type="button" class="reveal-btn" data-reveal="${esc(f.id)}">Reveal</button></li>` : ""}</ul>`) : ""}
      ${f.notes ? `<div class="dl wide"><div class="note">${icon("info")}<span>${esc(f.notes)}</span></div></div>` : ""}
      ${f.wiki ? `<div class="detail-actions"><a class="ghost-btn" href="${esc(f.wiki)}" target="_blank" rel="noopener">${icon("link")}Open ${esc(f.name)} on the wiki</a></div>` : ""}
    </div></div>`;
  }

  function renderHead() {
    const pool = counted(DB.fish).filter(f => get("source", "all") === "all" || f.source === get("source", "all"));
    const caught = pool.filter(f => isDone("fish", f.id)).length;
    $("#fish-score").innerHTML = `<div class="big num">${caught}<span> / ${pool.length}</span></div><small>${get("source", "all") === "all" ? `${(pct(caught, pool.length) / 10).toFixed(1)} of 10 perfection points` : `${get("source") === "sve" ? "SVE" : "Vanilla"} fish that count`}</small>`;
    const missingNow = pool.filter(f => !isDone("fish", f.id) && fishBitingNow(f)).length;
    const leavingSoon = pool.filter(f => !isDone("fish", f.id) && f.seasons.includes(state.season) && fishLeaving(f)).length;
    const nowOnly = get("nowOnly", false);
    $("#fish-now").innerHTML = `<button type="button" class="now-btn" aria-pressed="${nowOnly}" data-f="now"><span class="n num">${missingNow}</span><span class="t">${missingNow === 1 ? "fish you still need is" : "fish you still need are"} biting right now${leavingSoon ? `, ${leavingSoon} leaving at season's end` : ""}.<span class="cta">${nowOnly ? "Showing only these · show all" : "Show only these"}</span></span></button>`;
    const sc = { all: 0, missing: 0, caught: 0 };
    DB.fish.forEach(f => { if (matches(f, { status: true })) { sc.all++; isDone("fish", f.id) ? sc.caught++ : sc.missing++; } });
    $("#fish-status").innerHTML = [["all", "All"], ["missing", "Missing"], ["caught", "Caught"]].map(([k, l]) => `<button type="button" data-f-status="${k}" aria-pressed="${get("status", "all") === k}">${l} <span class="n">${sc[k]}</span></button>`).join("");
    // locations
    const counts = new Map();
    DB.fish.forEach(f => { if (!matches(f, { loc: true })) return; new Set(f.locations.filter(l => canSee(l.spoiler)).map(l => l.place)).forEach(p => counts.set(p, (counts.get(p) || 0) + 1)); });
    const loc = get("loc", null);
    if (loc && !counts.has(loc)) counts.set(loc, 0);
    const locs = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    $("#fish-loc").innerHTML = `<option value="">All locations</option>` + locs.map(([l, n]) => `<option value="${esc(l)}" ${loc === l ? "selected" : ""}>${esc(l)} (${n})</option>`).join("");
    $$(".fish-cols .sort-btn").forEach(b => b.setAttribute("aria-pressed", b.dataset.sort === get("sort", "smart")));
    const chips = [];
    if (query) chips.push(`<button type="button" class="pill-x" data-f="clear-q">“${esc(query)}” ${icon("x")}</button>`);
    if (loc) chips.push(`<button type="button" class="pill-x" data-f="clear-loc">${esc(loc)} ${icon("x")}</button>`);
    if (nowOnly) chips.push(`<button type="button" class="pill-x" data-f="now">Bites now ${icon("x")}</button>`);
    if (get("source", "all") !== "all") chips.push(`<button type="button" class="pill-x" data-f="source-all">${get("source") === "sve" ? "SVE only" : "Vanilla only"} ${icon("x")}</button>`);
    $("#fish-active").innerHTML = chips.length > 1 ? `${chips.join("")}<button type="button" class="link-btn" data-f="clear-all">Clear all</button>` : chips.join("");
  }

  function emptyHTML() {
    const nowOnly = get("nowOnly", false);
    const allDone = get("status", "all") === "missing" && !query && !get("loc") && !nowOnly;
    const btns = [];
    if (nowOnly) btns.push(`<button type="button" class="primary-btn" data-f="now">Show fish for any time</button>`);
    if (query) btns.push(`<button type="button" class="ghost-btn" data-f="clear-q">Clear search</button>`);
    if (get("loc")) btns.push(`<button type="button" class="ghost-btn" data-f="clear-loc">All locations</button>`);
    return `<div class="empty">${icon(allDone ? "trophy" : "fish", "art i")}<h3>${allDone ? "Every fish caught" : nowOnly ? "Nothing new is biting" : "No fish match"}</h3><p>${allDone ? "That's the whole collection for this filter. Willy would be proud." : nowOnly ? `No missing fish match ${SEASON_LABEL[state.season]}, ${state.weather === "rain" ? "rain" : "a dry day"} and ${fmtHour(hourNow())}. Try another time or weather.` : "Nothing fits these filters. Loosen one to see more fish."}</p>${btns.length ? `<div class="row">${btns.join("")}</div>` : ""}</div>`;
  }

  function renderList() {
    const list = sorted(DB.fish.filter(f => matches(f)));
    const el = $("#fish-list");
    if (!list.length) { el.innerHTML = emptyHTML(); return; }
    const group = get("group", "none");
    if (group === "none") { el.innerHTML = `<ul class="fish-list">${list.map(rowHTML).join("")}</ul>`; return; }
    const groups = new Map();
    list.forEach(f => {
      const keys = group === "location" ? [...new Set(f.locations.map(l => canSee(l.spoiler) ? l.place : "Secret SVE locations"))] : [FISH_CAT_LABEL[f.category] || "Other"];
      keys.forEach(k => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
    });
    const catOrder = Object.values(FISH_CAT_LABEL);
    const order = [...groups.entries()].sort((a, b) => {
      if (group === "category") return catOrder.indexOf(a[0]) - catOrder.indexOf(b[0]);
      if (a[0] === "Secret SVE locations") return 1; if (b[0] === "Secret SVE locations") return -1;
      return b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
    el.innerHTML = order.map(([k, arr]) => {
      const missing = arr.filter(f => !isDone("fish", f.id)).length;
      return `<section aria-label="${esc(k)}"><div class="group-head"><h3>${esc(k)}</h3><span>${arr.length} fish${missing !== arr.length ? ` · ${missing} missing` : ""}</span></div><ul class="fish-list">${arr.map(rowHTML).join("")}</ul></section>`;
    }).join("");
  }

  function toggle(id, value) {
    const f = DB.fishById[id];
    const was = isDone("fish", id), now = value ?? !was;
    if (now === was) return;
    setVal("fish", id, now);
    const li = $(`.fish[data-id="${CSS.escape(id)}"]`);
    const willHide = li && !matches(f);
    if (li) {
      li.classList.toggle("caught", now);
      li.querySelector("[data-catch]").checked = now;
      if (now) { const c = li.querySelector(".catch"); c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop"); }
      const st = fishStatus(f);
      li.className = li.className.replace(/st-\w+/, "st-" + st.key);
      const s = li.querySelector(".status"); s.className = "status " + st.key; s.innerHTML = `<i></i>${esc(st.text)}`;
    }
    renderHead();
    if (willHide) setTimeout(() => { li.classList.add("leaving-out"); setTimeout(() => { const next = li.nextElementSibling?.dataset.id; renderList(); if (next) $(`.fish[data-id="${CSS.escape(next)}"] [data-catch]`)?.focus(); }, 420); }, 380);
    if (now) {
      const pool = counted(DB.fish), n = pool.filter(x => isDone("fish", x.id)).length;
      toast(`${f.img ? `<img src="${f.img}" alt="">` : ""}${esc(f.name)} caught <span class="sub">${n} / ${pool.length}</span>${n === pool.length ? " · Collection complete!" : ""}`, () => toggle(id, false));
    }
  }

  function render(el) {
    el.innerHTML = `
      <div class="view-head">
        <div><h1>Fish<span class="weight">10% of Perfection</span></h1><p>Every fish that counts toward Perfection, vanilla and SVE. Set the in-game time above to see what's biting.</p></div>
        <div class="score" id="fish-score"></div>
      </div>
      <div class="fish-now" id="fish-now"></div>
      <div class="toolbar" role="search">
        <div class="search">${icon("search")}<label for="fish-q" class="sr-only">Search fish, places, recipes or villagers</label><input id="fish-q" type="search" placeholder="Search fish, places, recipes, villagers" autocomplete="off" spellcheck="false" value="${esc(query)}"><button type="button" class="clear" data-f="clear-q" aria-label="Clear search">${icon("x")}</button></div>
        <div class="seg" role="group" aria-label="Show" id="fish-status"></div>
        <div class="select"><label for="fish-loc" class="sr-only">Location</label><select id="fish-loc"></select>${icon("chev")}</div>
        <div class="select"><label for="fish-source" class="sr-only">Source</label><select id="fish-source">
          <option value="all" ${get("source", "all") === "all" ? "selected" : ""}>Vanilla + SVE</option><option value="vanilla" ${get("source") === "vanilla" ? "selected" : ""}>Vanilla only</option><option value="sve" ${get("source") === "sve" ? "selected" : ""}>SVE only</option></select>${icon("chev")}</div>
        <div class="select"><label for="fish-group" class="sr-only">Group by</label><select id="fish-group">
          <option value="none">No grouping</option><option value="location" ${get("group") === "location" ? "selected" : ""}>Group by location</option><option value="category" ${get("group") === "category" ? "selected" : ""}>Group by type</option></select>${icon("chev")}</div>
      </div>
      <div class="active-filters" id="fish-active"></div>
      <div class="fish-cols" aria-hidden="true">
        <span></span><span></span>
        <span><button class="sort-btn" data-sort="name" tabindex="-1">Fish</button></span>
        <span>Seasons</span>
        <span><button class="sort-btn" data-sort="smart" tabindex="-1">Bite window</button></span>
        <span>Weather</span>
        <span class="col-diff"><button class="sort-btn" data-sort="difficulty" tabindex="-1">Difficulty</button></span>
        <span class="r"><button class="sort-btn" data-sort="price" tabindex="-1">Price</button></span>
      </div>
      <div id="fish-list"></div>
      <p class="faint" style="font-size:var(--text-xs);margin-top:18px">
        <label style="display:inline-flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="fish-extra" ${get("showExtra", false) ? "checked" : ""}> Also show fish that don't count toward Perfection (Extended Family legendaries, Joja-only fish)</label>
      </p>`;
    renderHead(); renderList();
    const q = $("#fish-q");
    let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { query = q.value.trim(); renderHead(); renderList(); }, 70); });
    el.addEventListener("change", e => {
      const id = e.target.id;
      if (e.target.dataset.catch) toggle(e.target.dataset.catch, e.target.checked);
      else if (id === "fish-loc") { setUI(V, { loc: e.target.value || null }); renderHead(); renderList(); }
      else if (id === "fish-source") { setUI(V, { source: e.target.value }); renderHead(); renderList(); }
      else if (id === "fish-group") { setUI(V, { group: e.target.value }); renderList(); }
      else if (id === "fish-extra") { setUI(V, { showExtra: e.target.checked }); renderHead(); renderList(); }
    });
    el.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      const d = b.dataset;
      if (d.fStatus) { setUI(V, { status: d.fStatus }); renderHead(); renderList(); }
      else if (d.sort) { setUI(V, { sort: get("sort", "smart") === d.sort && d.sort !== "smart" ? "smart" : d.sort }); renderHead(); renderList(); }
      else if (d.f === "now") { setUI(V, { nowOnly: !get("nowOnly", false) }); renderHead(); renderList(); }
      else if (d.f === "clear-q") { query = ""; q.value = ""; renderHead(); renderList(); }
      else if (d.f === "clear-loc") { setUI(V, { loc: null }); renderHead(); renderList(); }
      else if (d.f === "source-all") { setUI(V, { source: "all" }); renderHead(); renderList(); }
      else if (d.f === "clear-all") { query = ""; q.value = ""; setUI(V, { loc: null, nowOnly: false, source: "all", status: "all" }); renderHead(); renderList(); }
      else if (d.open) {
        const li = b.closest(".fish"), f = DB.fishById[d.open];
        if (open.has(f.id)) { open.delete(f.id); li.classList.remove("open"); b.setAttribute("aria-expanded", "false"); }
        else { open.add(f.id); li.querySelector(".detail").innerHTML = detailHTML(f); requestAnimationFrame(() => li.classList.add("open")); b.setAttribute("aria-expanded", "true"); }
      }
      else if (d.reveal) {
        revealed.add(d.reveal);
        const li = b.closest(".fish"), f = DB.fishById[d.reveal];
        li.querySelector(".detail").innerHTML = detailHTML(f);
        li.querySelector(".locs").innerHTML = locText(f);
      }
    });
    const target = routeParam("item");
    if (target && DB.fishById[target]) requestAnimationFrame(() => { open.add(target); setUI(V, { status: "all", loc: null, nowOnly: false }); renderHead(); renderList(); const li = $(`.fish[data-id="${CSS.escape(target)}"]`); li?.scrollIntoView({ block: "center" }); li?.querySelector("[data-catch]")?.focus({ preventScroll: true }); });
  }

  function onClock() {
    renderHead();
    if (get("nowOnly", false) || get("sort", "smart") === "smart") { const f = document.activeElement?.closest?.(".fish")?.dataset.id; renderList(); if (f) $(`.fish[data-id="${CSS.escape(f)}"] [data-catch]`)?.focus(); return; }
    $$(".fish").forEach(li => {
      const f = DB.fishById[li.dataset.id], st = fishStatus(f);
      li.className = li.className.replace(/st-\w+/, "st-" + st.key);
      const s = li.querySelector(".status"); s.className = "status " + st.key; s.innerHTML = `<i></i>${esc(st.text)}`;
      li.querySelector(".mark").style.left = ((hourNow() - START_H) / SPAN_H * 100) + "%";
      li.querySelectorAll(".seasons-mini span").forEach((sp, i) => sp.classList.toggle("cur", SEASONS[i] === state.season));
    });
  }

  return { render, onClock, onKey: e => listKeys(e, ".fish", toggle, $("#fish-q")) };
})();
