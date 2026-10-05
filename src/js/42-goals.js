/* Friends, Monsters, Stardrops, Golden Walnuts, Farm & skills. */

/* ---------- birthdays ---------- */
function daysUntil(season, day) {
  const now = seasonIdx() * 28 + state.day, then = SEASONS.indexOf(season) * 28 + day;
  return (then - now + 112) % 112;
}
const bdayDays = v => v.birthday ? daysUntil(v.birthday.season, v.birthday.day) : Infinity;
const bdayText = v => {
  if (!v.birthday) return "No birthday";
  const d = bdayDays(v);
  return d === 0 ? "Birthday today!" : d === 1 ? "Birthday tomorrow" : d <= 14 ? `Birthday in ${d} days` : `${SEASON_LABEL[v.birthday.season]} ${v.birthday.day}`;
};

VIEWS.friends = (() => {
  const V = "friends";
  let query = "";
  const open = new Set();
  const nameOf = v => canSee(v.spoiler, v.id) ? v.name : "Secret SVE villager";

  function matches(v) {
    if (!countsNow(v) && !v.countsWhen && !ui(V, "extra", false)) return false;
    const st = ui(V, "status", "missing");
    if (st === "missing" && friendDone(v)) return false;
    if (st === "done" && !friendDone(v)) return false;
    const q = ui(V, "quick", "any");
    if (q === "bday" && bdayDays(v) > 7) return false;
    if (q === "dateable" && !v.dateable) return false;
    if (q === "gifts" && (state.save?.giftsWeek?.[v.id] ?? 0) >= 2) return false;
    if (q === "owned" && !(v.loves || []).some(l => owned(l.id))) return false;
    if (q === "sve" && !v.sve) return false;
    if (query) {
      const hay = [nameOf(v), canSee(v.spoiler, v.id) ? (v.loves || []).map(l => l.name).join(" ") : ""].join(" ").toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  }
  function heartsHTML(v) {
    const h = heartsOf(v), need = heartsNeeded(v);
    const max = state.save?.friendStatus?.[v.id] === "Married" ? 14 : 10;
    return `<div class="hearts" role="group" aria-label="${esc(nameOf(v))}: ${h} of ${need} hearts needed">${Array.from({ length: max }, (_, i) =>
      `<button type="button" class="${i < h ? "on" : ""}${i === need - 1 ? " goal" : ""}" data-heart="${esc(v.id)}" data-n="${i + 1}" aria-label="Set ${i + 1} hearts" title="${i + 1} hearts${i === need - 1 ? " (Perfection goal)" : ""}">${icon(i < h ? "heart-fill" : "heart")}</button>`).join("")}</div>`;
  }
  function rowHTML(v) {
    const secret = !canSee(v.spoiler, v.id);
    const done = friendDone(v);
    const gifts = state.save?.giftsWeek?.[v.id];
    const bd = bdayDays(v);
    const isOpen = open.has(v.id);
    return `<li class="item friend${done ? " done" : ""}${isOpen ? " open" : ""}" data-id="${esc(v.id)}">
      <div class="item-row friend-row">
        <span class="fr-check" aria-hidden="true">${done ? icon("check") : ""}</span>
        ${secret ? spriteHTML(null, "?", "sm portrait") : spriteHTML(v.img, v.name, "sm portrait")}
        <div class="item-name">
          <button type="button" class="nm-btn" aria-expanded="${isOpen}" data-open="${esc(v.id)}"><span class="nm">${esc(nameOf(v))}</span>${v.sve ? `<span class="tag sve">SVE</span>` : ""}${v.dateable ? `<span class="tag misc" title="Romanceable: 8 hearts count for Perfection unless you marry them">Dateable</span>` : ""}${state.save?.friendStatus?.[v.id] ? `<span class="tag leg">${esc(state.save.friendStatus[v.id])}</span>` : ""}${isManual("friends", v.id) ? `<span class="tag manual">manual</span>` : ""}${v.countsWhen && !countsNow(v) ? `<span class="tag misc" title="${esc(v.note)}">Doesn't count yet</span>` : ""}</button>
          <div class="sub">${secret ? `<span class="secret">Met through SVE's story</span>` : `<span class="${bd <= 1 ? "status leaving" : ""}">${icon("cake")}${bdayText(v)}</span>${gifts != null ? `<span class="sep">·</span>${icon("gift")}${gifts}/2 gifts this week` : ""}${(() => { const g = (v.loves || []).find(l => owned(l.id)); return g && !done ? `<span class="sep">·</span><span class="status now" title="${esc(whereText(g.id, 3))}"><i></i>You own ${esc(g.name)}</span>` : ""; })()}`}</div>
        </div>
        <div class="item-meta">${heartsHTML(v)}</div>
      </div>
      <div class="detail">${isOpen ? detailHTML(v) : "<div></div>"}</div>
    </li>`;
  }
  function detailHTML(v) {
    if (!canSee(v.spoiler, v.id)) return `<div><div class="detail-inner"><div class="dl wide"><p class="muted">This villager is part of SVE's story. <button type="button" class="reveal-btn" data-reveal="${esc(v.id)}">Reveal</button></p></div></div></div>`;
    const loves = (v.loves || []).map(l => {
      const f = DB.fishById?.[l.id], c = DB.cooking.find(c => c.yieldId === l.id);
      const href = f ? `#/fish?item=${encodeURIComponent(f.id)}` : c ? `#/cooking?item=${encodeURIComponent(c.id)}` : null;
      const n = owned(l.id);
      return `<span class="${n ? "have" : ""}" ${n ? `title="${esc(whereText(l.id, 4))}"` : ""}>${imgOf(l.id) ? `<img src="${imgOf(l.id)}" alt="" width="22" height="22">` : ""}${href ? `<a href="${href}">${esc(l.name)}</a>` : esc(l.name)}${n ? `<b class="num">${fmt(n)}</b>` : ""}</span>`;
    }).join("");
    const pts = val("friends", v.id) || 0;
    return `<div><div class="detail-inner">
      <div class="dl wide"><h4>Loved gifts${hasInventory() ? ` <span class="faint">· highlighted ones are in your chests</span>` : ""}</h4><div class="ing">${loves || `<span class="faint">No data</span>`}</div></div>
      <div class="dl"><h4>Friendship</h4><ul><li>${fmt(pts)} points (${heartsOf(v)} hearts)</li><li>Perfection needs ${heartsNeeded(v)} hearts</li><li>${fmt(Math.max(0, heartsNeeded(v) * HEARTS_PTS - pts))} points to go</li></ul></div>
      ${v.birthday ? `<div class="dl"><h4>Birthday</h4><p>${SEASON_LABEL[v.birthday.season]} ${v.birthday.day}. Loved gifts are worth 8× on birthdays.</p></div>` : ""}
      ${v.how ? `<div class="dl"><h4>Where to meet</h4><p>${esc(v.how)}</p></div>` : ""}
      ${v.note ? `<div class="dl wide"><div class="note">${icon("info")}<span>${esc(v.note)}</span></div></div>` : ""}
    </div></div>`;
  }
  function renderBody() {
    const list = DB.villagers.filter(matches);
    const sort = ui(V, "sort", "bday");
    list.sort(sort === "bday" ? (a, b) => Math.min(bdayDays(a), 999) - Math.min(bdayDays(b), 999)
      : sort === "hearts" ? (a, b) => (heartsNeeded(a) - heartsOf(a)) - (heartsNeeded(b) - heartsOf(b)) || a.name.localeCompare(b.name)
      : (a, b) => nameOf(a).localeCompare(nameOf(b)));
    $("#fr-list").innerHTML = list.length ? `<ul class="items">${list.map(rowHTML).join("")}</ul>`
      : `<div class="empty">${icon("heart", "art i")}<h3>${ui(V, "status", "missing") === "missing" ? "Everyone's a great friend" : "Nobody matches"}</h3><p>${ui(V, "status", "missing") === "missing" ? "Every villager that counts has enough hearts." : "Try another filter."}</p></div>`;
    const c = counted(DB.villagers), d = c.filter(friendDone).length;
    $("#fr-score").innerHTML = `<div class="big num">${d}<span> / ${c.length}</span></div><small>${(pct(d, c.length) * 0.11).toFixed(1)} of 11 perfection points</small>`;
    $$("#fr-status button").forEach(b => b.setAttribute("aria-pressed", b.dataset.st === ui(V, "status", "missing")));
  }
  function render(el) {
    el.innerHTML = `
      <div class="view-head"><div><h1>Friends<span class="weight">11% of Perfection</span></h1><p>Reach 10 hearts with every villager, or 8 with unmarried romance candidates. Click a heart to set it by hand.</p></div><div class="score" id="fr-score"></div></div>
      <div class="toolbar" role="search">
        <div class="search">${icon("search")}<label for="fr-q" class="sr-only">Search villagers or gifts</label><input id="fr-q" type="search" placeholder="Search villagers or loved gifts" autocomplete="off" value="${esc(query)}"><button type="button" class="clear" data-x="clear" aria-label="Clear search">${icon("x")}</button></div>
        <div class="seg" role="group" aria-label="Show" id="fr-status"><button type="button" data-st="all">All</button><button type="button" data-st="missing">Not there yet</button><button type="button" data-st="done">Done</button></div>
        <div class="select"><label class="sr-only" for="fr-quick">Filter</label><select id="fr-quick">
          ${[["any", "Everyone"], ["bday", "Birthday this week"], ["gifts", "Can still gift this week"], ["owned", "You own a loved gift"], ["dateable", "Romance candidates"], ["sve", "SVE villagers"]].map(([k, l]) => `<option value="${k}" ${ui(V, "quick", "any") === k ? "selected" : ""}>${l}</option>`).join("")}</select>${icon("chev")}</div>
        <div class="select"><label class="sr-only" for="fr-sort">Sort</label><select id="fr-sort">
          ${[["bday", "Next birthday first"], ["hearts", "Closest to done first"], ["name", "By name"]].map(([k, l]) => `<option value="${k}" ${ui(V, "sort", "bday") === k ? "selected" : ""}>${l}</option>`).join("")}</select>${icon("chev")}</div>
      </div>
      <div id="fr-list"></div>`;
    renderBody();
    const q = $("#fr-q");
    q.addEventListener("input", () => { query = q.value.trim(); renderBody(); });
    el.addEventListener("change", e => {
      if (e.target.id === "fr-quick") setUI(V, { quick: e.target.value });
      if (e.target.id === "fr-sort") setUI(V, { sort: e.target.value });
      renderBody();
    });
    el.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.st) { setUI(V, { status: b.dataset.st }); renderBody(); }
      else if (b.dataset.x === "clear") { query = ""; q.value = ""; renderBody(); }
      else if (b.dataset.heart) {
        const v = DB.villagers.find(v => v.id === b.dataset.heart);
        const n = +b.dataset.n, cur = heartsOf(v);
        const target = n === cur ? n - 1 : n;
        const before = val("friends", v.id);
        setVal("friends", v.id, target * HEARTS_PTS);
        const li = b.closest(".item"); const tmp = document.createElement("ul"); tmp.innerHTML = rowHTML(v); li.replaceWith(tmp.firstElementChild);
        $(`.item[data-id="${CSS.escape(v.id)}"] [data-n="${n}"]`)?.focus();
        if (!friendDone({ ...v }) === false && target >= heartsNeeded(v) && cur < heartsNeeded(v)) toast(`${esc(v.name)} is now a great friend`, () => { setVal("friends", v.id, before); renderBody(); });
        const c = counted(DB.villagers), d = c.filter(friendDone).length;
        $("#fr-score").innerHTML = `<div class="big num">${d}<span> / ${c.length}</span></div><small>${(pct(d, c.length) * 0.11).toFixed(1)} of 11 perfection points</small>`;
      }
      else if (b.dataset.open) {
        const li = b.closest(".item"), v = DB.villagers.find(v => v.id === b.dataset.open);
        if (open.has(v.id)) { open.delete(v.id); li.classList.remove("open"); b.setAttribute("aria-expanded", "false"); }
        else { open.add(v.id); li.querySelector(".detail").innerHTML = detailHTML(v); requestAnimationFrame(() => li.classList.add("open")); b.setAttribute("aria-expanded", "true"); }
      }
      else if (b.dataset.reveal) { revealed.add(b.dataset.reveal); open.add(b.dataset.reveal); renderBody(); }
    });
    const target = routeParam("item");
    if (target) requestAnimationFrame(() => { setUI(V, { status: "all", quick: "any" }); open.add(target); renderBody(); $(`.item[data-id="${CSS.escape(target)}"]`)?.scrollIntoView({ block: "center" }); });
  }
  return { render, onClock: renderBody, onKey: e => listKeys(e, ".item", () => {}, $("#fr-q")) };
})();

/* ---------- monsters ---------- */
VIEWS.monsters = (() => {
  function rowHTML(m) {
    const k = monsterKills(m), done = k >= m.count;
    return `<li class="goal${done ? " done" : ""}" data-id="${esc(m.id)}">
      <div class="goal-row">
        <span class="fr-check" aria-hidden="true">${done ? icon("check") : ""}</span>
        <div class="goal-main">
          <div class="goal-title"><h3>${esc(m.name)}</h3>${isManual("monsters", m.id) ? `<span class="tag manual">manual</span>` : ""}<span class="faint">${esc(m.targets.join(", "))}</span></div>
          <div class="goal-bar"><div class="track"><div class="fill" style="width:${Math.min(100, pct(k, m.count))}%;--c:${done ? "var(--honey)" : "var(--now)"}"></div></div>
          <label class="goal-count"><span class="sr-only">${esc(m.name)} kills</span><input class="num-input" type="number" min="0" inputmode="numeric" value="${k}" data-kills="${esc(m.id)}"><span class="faint num">/ ${fmt(m.count)}</span></label></div>
          <p class="goal-where">${done ? `${icon("gift")}Claim from Gil: ${esc(m.reward)}` : `${icon("info")}<span>${esc(m.where || "")}${m.whereSve && spoilersOn() ? ` SVE: ${esc(m.whereSve)}` : ""}</span><span class="faint">${fmt(Math.max(0, m.count - k))} to go</span>`}</p>
        </div>
      </div>
    </li>`;
  }
  function render(el) {
    const d = DB.monsters.filter(monsterDone).length;
    el.innerHTML = `
      <div class="view-head"><div><h1>Monster Slayer<span class="weight">10% of Perfection</span></h1><p>Finish all of Gil's Monster Eradication Goals at the Adventurer's Guild. Kill counts come from your save; type a number to set one by hand.</p></div>
      <div class="score"><div class="big num">${d}<span> / ${DB.monsters.length}</span></div><small>${(pct(d, DB.monsters.length) / 10).toFixed(1)} of 10 perfection points</small></div></div>
      <ul class="goals">${DB.monsters.slice().sort((a, b) => monsterDone(a) - monsterDone(b) || (pct(monsterKills(b), b.count) - pct(monsterKills(a), a.count))).map(rowHTML).join("")}</ul>`;
    el.onchange = e => {
      const id = e.target.dataset.kills; if (!id) return;
      const m = DB.monsters.find(m => m.id === id);
      const before = monsterDone(m);
      setVal("monsters", id, Math.max(0, +e.target.value || 0));
      const li = e.target.closest(".goal"); const tmp = document.createElement("ul"); tmp.innerHTML = rowHTML(m); li.replaceWith(tmp.firstElementChild);
      if (!before && monsterDone(m)) toast(`${esc(m.name)} goal complete`);
      const dd = DB.monsters.filter(monsterDone).length;
      $(".view-head .score").innerHTML = `<div class="big num">${dd}<span> / ${DB.monsters.length}</span></div><small>${(pct(dd, DB.monsters.length) / 10).toFixed(1)} of 10 perfection points</small>`;
    };
  }
  return { render };
})();

/* ---------- simple checklists ---------- */
VIEWS.stardrops = listView({
  id: "stardrops", cat: "stardrops", title: "Stardrops", weight: 10,
  intro: "Find all seven stardrops. Each one permanently raises your max energy.",
  items: () => DB.stardrops, doneVerb: "found", checkLabel: "Found", doneLabel: "Found",
  search: s => [s.name, s.how].join(" "),
  sub: s => esc(s.how),
  detail: s => `<div class="dl wide"><h4>How to get it</h4><p>${esc(s.how)}</p></div>${s.prereq ? `<div class="dl wide"><h4>You'll need</h4><p>${esc(s.prereq)}</p></div>` : ""}`,
  groups: [{ value: "none", title: "No grouping", key: () => "" }],
});

/* ---------- walnuts ---------- */
VIEWS.walnuts = (() => {
  const V = "walnuts";
  const level = {}; // per-walnut hint level this session: 0 hidden, 1 hint, 2 solution
  function render(el) {
    const found = walnutsFound();
    const areas = [...new Set(DB.walnuts.map(w => w.area))];
    const saveN = state.save?.walnutCount;
    el.innerHTML = `
      <div class="view-head"><div><h1>Golden Walnuts<span class="weight">5% of Perfection</span></h1><p>All 130 walnuts on Ginger Island. Hints come in two steps so you can get a nudge without the full answer.${saveN != null ? ` Your save reports <b>${saveN}</b> found.` : ""}</p></div>
      <div class="score"><div class="big num">${found}<span> / 130</span></div><small>${(found / 130 * 5).toFixed(1)} of 5 perfection points</small></div></div>
      ${saveN != null && saveN > DB.walnuts.reduce((t, w) => t + (saveVal("walnuts", w.id) ? w.count : 0), 0) ? `<div class="note" style="margin-bottom:16px">${icon("info")}<span>Your save counts ${saveN} walnuts but only records where some of them came from, so the rest can't be ticked automatically. Tick the ones you remember to see what's left; the total uses whichever number is higher.</span></div>` : ""}
      <div class="walnut-areas">${areas.map(a => {
        const ws = DB.walnuts.filter(w => w.area === a);
        const total = ws.reduce((s, w) => s + w.count, 0), got = ws.reduce((s, w) => s + (isDone("walnuts", w.id) ? w.count : 0), 0);
        return `<details class="area" ${ui(V, "open:" + a, got < total) ? "open" : ""} data-area="${esc(a)}"><summary><h2>${esc(a)}</h2><span class="num">${got}/${total}</span><div class="track thin"><div class="fill" style="width:${pct(got, total)}%"></div></div>${icon("chev")}</summary>
          <ul class="items">${ws.map(w => walnutHTML(w)).join("")}</ul></details>`;
      }).join("")}</div>`;
    el.onchange = e => {
      const id = e.target.dataset.check; if (!id) return;
      setVal("walnuts", id, e.target.checked);
      render(el);
      $(`[data-check="${CSS.escape(id)}"]`)?.focus();
    };
    el.onclick = e => {
      const b = e.target.closest("[data-hint]"); if (!b) return;
      level[b.dataset.hint] = (level[b.dataset.hint] || 0) + 1;
      const li = b.closest(".item"); const tmp = document.createElement("ul"); tmp.innerHTML = walnutHTML(DB.walnuts.find(w => w.id === b.dataset.hint)); li.replaceWith(tmp.firstElementChild);
    };
    el.addEventListener("toggle", e => { if (e.target.dataset.area) setUI(V, { ["open:" + e.target.dataset.area]: e.target.open }); }, true);
  }
  function walnutHTML(w) {
    const done = isDone("walnuts", w.id);
    const lv = done ? 2 : (level[w.id] || 0);
    return `<li class="item walnut${done ? " done" : ""}" data-id="${esc(w.id)}"><div class="item-row">
      <label class="catch small"><input type="checkbox" ${done ? "checked" : ""} data-check="${esc(w.id)}" aria-label="Found: ${esc(w.title)}"><span class="box">${icon("check", "")}</span><span class="ripple"></span></label>
      <span class="walnut-count num" title="${plural(w.count, "walnut")}">${w.count > 1 ? `×${w.count}` : ""}</span>
      <div class="item-name"><div class="nm-plain">${esc(w.title)}</div>
        <div class="hint">${lv === 0 ? `<button type="button" class="reveal-btn" data-hint="${esc(w.id)}">Show hint</button>` : lv === 1 ? `${esc(w.hint)} <button type="button" class="reveal-btn" data-hint="${esc(w.id)}">Show answer</button>` : `<span class="muted">${esc(w.solution)}</span>`}</div>
      </div><div></div></div></li>`;
  }
  return { render };
})();

/* ---------- farm & skills ---------- */
VIEWS.farm = (() => {
  const SKILL_ICON = { farming: "sprout", fishing: "fish", foraging: "spring", mining: "hammer", combat: "sword" };
  function render(el) {
    const lvl = farmerLevel();
    const builds = DB.buildings;
    const xp = state.save?.xp || {};
    el.innerHTML = `
      <div class="view-head"><div><h1>Farm & skills</h1><p>Three Perfection categories in one place: farmer level (5%), obelisks (4%) and the Gold Clock (10%). All four obelisks and the clock are bought from the Wizard's tower.</p></div>
      <div class="score"><div class="big num">${Math.min(25, lvl)}<span> / 25</span></div><small>farmer level</small></div></div>

      <section><div class="group-head"><h2>Skills</h2><span>Farmer level = total skill levels ÷ 2</span></div>
        <ul class="goals">${SKILLS.map(s => {
          const l = skillLevel(s), next = DB.skills.xp[l] ?? null, cur = xp[s];
          return `<li class="goal${l >= 10 ? " done" : ""}"><div class="goal-row"><span class="fr-check">${l >= 10 ? icon("check") : icon(SKILL_ICON[s])}</span><div class="goal-main">
            <div class="goal-title"><h3>${cap(s)}</h3>${isManual("skills", s) ? `<span class="tag manual">manual</span>` : ""}</div>
            <div class="goal-bar"><div class="skill-pips" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < l ? "on" : ""}"></i>`).join("")}</div>
            <label class="goal-count"><span class="sr-only">${cap(s)} level</span><input class="num-input" type="number" min="0" max="10" value="${l}" data-skill="${s}"><span class="faint">/ 10</span></label></div>
            ${cur != null && l < 10 ? `<p class="goal-where">${icon("info")}<span>${fmt(cur)} XP · ${fmt(next - cur)} XP to level ${l + 1}</span></p>` : ""}
          </div></div></li>`;
        }).join("")}</ul></section>

      <section><div class="group-head"><h2>Wizard buildings</h2><span>${builds.filter(b => isDone("buildings", b.id)).length}/${builds.length} built</span></div>
        <ul class="goals">${builds.map(b => {
          const on = isDone("buildings", b.id);
          return `<li class="goal${on ? " done" : ""}"><div class="goal-row">
            <label class="catch"><input type="checkbox" ${on ? "checked" : ""} data-build="${esc(b.id)}" aria-label="Built: ${esc(b.name)}"><span class="box">${icon("check", "")}</span><span class="ripple"></span></label>
            <div class="goal-main"><div class="goal-title"><h3>${esc(b.name)}</h3><span class="weight">${b.kind === "clock" ? "10%" : "1%"}</span>${isManual("buildings", b.id) ? `<span class="tag manual">manual</span>` : ""}</div>
            <p class="goal-where">${icon("gift")}<span>${fmt(b.cost)}g${b.materials?.length ? " · " + b.materials.map(m => `${m.qty} ${esc(m.name)}`).join(", ") : ""}</span>${state.save?.money != null && !on ? `<span class="faint">${state.save.money >= b.cost ? "You can afford it" : `${fmt(b.cost - state.save.money)}g short`}</span>` : ""}</p></div>
          </div></li>`;
        }).join("")}</ul>
        ${(() => {
          const left = builds.filter(b => !isDone("buildings", b.id)).reduce((a, b) => a + b.cost, 0);
          if (!left) return "";
          const rate = earningsPerDay(), money = state.save?.money ?? null;
          const need = money != null ? Math.max(0, left - money) : left;
          const days = rate && need ? Math.ceil(need / rate) : 0;
          return `<div class="note" style="margin-top:12px">${icon("info")}<span>Still to buy: <b>${fmt(left)}g</b> in total${money != null ? `. You have ${fmt(money)}g` : ""}.${rate ? ` You've earned about <b>${fmt(rate)}g a day</b> so far, so the rest is roughly <b>${plural(days, "in-game day")}</b> away (${(days / 28).toFixed(1)} seasons).` : ""}</span></div>`;
        })()}
      </section>`;
    el.onchange = e => {
      if (e.target.dataset.skill) setVal("skills", e.target.dataset.skill, clamp(+e.target.value || 0, 0, 10));
      if (e.target.dataset.build) { setVal("buildings", e.target.dataset.build, e.target.checked); if (e.target.checked) toast(`${esc(e.target.dataset.build)} built`); }
      render(el);
    };
  }
  return { render };
})();
