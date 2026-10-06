/* Everything left: every missing Perfection item in one place, ignoring the in-game clock. Item categories
   render as sprite grids like the game's Collections tab; tiles deep-link to the item on its own page. */

VIEWS.missing = (() => {
  const V = "missing";
  let query = "";

  const words = () => query.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = name => { const h = String(name).toLowerCase(); return words().every(w => h.includes(w)); };

  // one tile per item; secret SVE items stay a "?" with no name until spoilers are shown
  function tile(route, item, done, extra = "") {
    const secret = !canSee(item.spoiler, item.id);
    const name = secret ? "Secret SVE item" : item.name;
    const img = secret ? null : item.img;
    return `<a class="ov-tile${done ? " done" : ""}" href="#/${route}?item=${encodeURIComponent(item.id)}" title="${esc(name)}" aria-label="${esc(name)}${done ? " (done)" : ""}">
      ${img ? `<img src="${img}" alt="" loading="lazy" decoding="async">` : `<span class="fb">${secret ? "?" : esc(name[0])}</span>`}${extra}</a>`;
  }
  const chip = (text, href, title = "") => `<a class="ov-chip" href="${href}"${title ? ` title="${esc(title)}"` : ""}>${text}</a>`;

  function section(c, left, body, total) {
    if (!body) return "";
    return `<section class="ov-sec">
      <header class="ov-head"><a href="#/${c.route}">${icon(c.icon)}<h2>${esc(c.label)}</h2></a>
        <span class="ov-left">${left ? `${fmt(left)} left` : "Complete"}</span>${total ? `<span class="faint">of ${fmt(total)}</span>` : ""}</header>
      ${body}</section>`;
  }
  const grid = tiles => tiles.length ? `<div class="ov-grid">${tiles.join("")}</div>` : "";
  const chips = list => list.length ? `<div class="ov-chips">${list.join("")}</div>` : "";

  function itemSection(c, list, cat, route = c.route) {
    const all = ui(V, "show", "missing") === "all";
    const shown = list.filter(x => (all || !isDone(cat, x.id)) && (!query || canSee(x.spoiler, x.id) && hit(x.name)));
    const left = list.filter(x => !isDone(cat, x.id)).length;
    if (!shown.length && (query || !all)) return query ? "" : section(c, 0, `<p class="ov-done">${icon("check")}Everything here is done.</p>`);
    return section(c, left, grid(shown.map(x => tile(route, x, isDone(cat, x.id)))), list.length);
  }

  function render(el) {
    const p = perfection();
    const byId = Object.fromEntries(p.cats.map(c => [c.id, c]));
    const all = ui(V, "show", "missing") === "all";
    const cat = id => ({ ...CATEGORIES.find(c => c.id === id), label: byId[id].long });

    const sections = [];
    sections.push(itemSection(cat("shipping"), counted(DB.shipping), "shipping"));
    sections.push(itemSection(cat("fish"), counted(DB.fish), "fish"));
    sections.push(itemSection(cat("cooking"), counted(DB.cooking), "cooking"));
    sections.push(itemSection(cat("crafting"), counted(DB.crafting), "crafting"));

    // friends: portraits with a hearts badge
    {
      const list = counted(DB.villagers);
      const shown = list.filter(v => (all || !friendDone(v)) && (!query || canSee(v.spoiler, v.id) && hit(v.name)));
      const left = list.filter(v => !friendDone(v)).length;
      sections.push(shown.length || !query ? section(cat("friends"), left,
        grid(shown.map(v => tile("friends", v, friendDone(v), `<span class="ov-badge">${heartsOf(v)}/${heartsNeeded(v)}</span>`))) || `<p class="ov-done">${icon("check")}Everyone's a great friend.</p>`, list.length) : "");
    }

    // monsters, stardrops: no item sprites, so compact chips with what's left
    {
      const list = DB.monsters.filter(m => (all || !monsterDone(m)) && hit(m.name + " " + m.targets.join(" ")));
      sections.push(list.length || !query ? section(cat("monsters"), DB.monsters.filter(m => !monsterDone(m)).length,
        chips(list.map(m => chip(`${esc(m.name)} <b>${fmt(monsterKills(m))}/${fmt(m.count)}</b>`, "#/monsters", m.where || ""))) || `<p class="ov-done">${icon("check")}All goals done.</p>`, DB.monsters.length) : "");
    }
    {
      const list = DB.stardrops.filter(s => (all || !isDone("stardrops", s.id)) && hit(s.name + " " + s.how));
      sections.push(list.length || !query ? section(cat("stardrops"), DB.stardrops.filter(s => !isDone("stardrops", s.id)).length,
        chips(list.map(s => chip(`${icon("star")}${esc(s.name)}`, `#/stardrops?item=${encodeURIComponent(s.id)}`, s.how))) || `<p class="ov-done">${icon("check")}All seven found.</p>`, DB.stardrops.length) : "");
    }

    // walnuts: what's left per island area
    if (!query || hit("walnuts golden walnut")) {
      const found = walnutsFound();
      const areas = {};
      for (const w of DB.walnuts) if (!isDone("walnuts", w.id)) areas[w.area] = (areas[w.area] || 0) + w.count;
      sections.push(section(cat("walnuts"), 130 - found,
        chips(Object.entries(areas).map(([a, n]) => chip(`${icon("nut")}${esc(a)} <b>${n}</b>`, "#/walnuts"))) || `<p class="ov-done">${icon("check")}All 130 found.</p>`, 130));
    }

    // farm & skills: farmer level, obelisks, Gold Clock
    if (!query || hit("farm skills level obelisk gold clock")) {
      const lv = farmerLevel();
      const obelisks = DB.buildings.filter(b => b.kind === "obelisk" && !isDone("buildings", b.id));
      const list = [
        ...(lv < 25 ? [chip(`${icon("skills")}Farmer level <b>${lv}/25</b>`, "#/farm")] : []),
        ...obelisks.map(b => chip(`${icon("farm")}${esc(b.name)}`, "#/farm")),
        ...(!isDone("buildings", "Gold Clock") ? [chip(`${icon("clock")}Gold Clock <b>10,000,000g</b>`, "#/farm")] : []),
      ];
      const farm = NAV.flatMap(g => g.items).find(it => it.route === "farm");
      sections.push(section({ ...farm, label: "Farm & skills" }, list.length, chips(list) || `<p class="ov-done">${icon("check")}Level 25, every obelisk and the Gold Clock.</p>`));
    }

    // beyond perfection
    const beyond = [];
    {
      const list = bundlesList().filter(b => !bundleDone(b));
      const tiles = [];
      for (const b of list) for (const i of b.items) {
        if (isDone("bundles", bundleItemKey(b, i)) || (query && !hit(i.name + " " + b.name))) continue;
        tiles.push(`<a class="ov-tile" href="#/bundles" title="${esc(`${i.qty > 1 ? i.qty + "× " : ""}${i.name} · ${b.name}`)}" aria-label="${esc(`${i.name}, ${b.name}`)}">${imgOf(i.id) ? `<img src="${imgOf(i.id)}" alt="" loading="lazy">` : `<span class="fb">${esc(i.name[0])}</span>`}${i.qty > 1 ? `<span class="ov-badge">${i.qty}</span>` : ""}</a>`);
      }
      const nav = NAV.flatMap(g => g.items).find(it => it.route === "bundles");
      if (tiles.length || !query) beyond.push(section(nav, list.length, grid(tiles) || `<p class="ov-done">${icon("check")}The Community Center is restored.</p>`));
    }
    if (DB.museum?.length) {
      const nav = NAV.flatMap(g => g.items).find(it => it.route === "museum");
      beyond.push(itemSection(nav, DB.museum, "museum", "museum"));
    }

    // farmer level is levels, not things to find, so it stays out of the headline count
    const missingTotal = p.cats.filter(c => c.id !== "farmer").reduce((a, c) => a + Math.max(0, c.total - c.done), 0);
    const body = sections.join("") + (beyond.join("") ? `<h2 class="ov-group">Beyond perfection</h2>${beyond.join("")}` : "");
    el.innerHTML = `
      <div class="view-head"><div><h1>Everything left</h1><p>Every item still missing for Perfection, whatever the season, day, weather or time. Pick one to open it on its own page.</p></div>
        <div class="score"><div class="big num">${fmt(missingTotal)}</div><small>things left for Perfection</small></div></div>
      <div class="toolbar" role="search">
        <div class="search">${icon("search")}<label for="ov-q" class="sr-only">Search everything left</label><input id="ov-q" type="search" placeholder="Search items, villagers, goals" autocomplete="off" spellcheck="false" value="${esc(query)}"><button type="button" class="clear" data-ov="clear" aria-label="Clear search">${icon("x")}</button></div>
        <div class="seg" role="group" aria-label="Show"><button type="button" data-show="missing" aria-pressed="${!all}">Missing</button><button type="button" data-show="all" aria-pressed="${all}">Everything</button></div>
      </div>
      <div id="ov-body">${body || `<div class="empty">${icon("search", "art i")}<h3>Nothing matches</h3><p>Try a shorter search.</p></div>`}</div>`;

    const q = $("#ov-q", el);
    let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { query = q.value.trim(); rerender(el); }, 90); });
    el.addEventListener("click", e => {
      const s = e.target.closest("[data-show]");
      if (s) { setUI(V, { show: s.dataset.show }); rerender(el); }
      if (e.target.closest("[data-ov=clear]")) { query = ""; rerender(el); }
    });
  }
  // re-render in place, keeping focus and caret in the search box
  function rerender(el) {
    const caret = $("#ov-q", el)?.selectionStart, had = document.activeElement?.id === "ov-q", y = scrollY;
    renderView(true);
    const q = $("#ov-q");
    if (had && q) { q.focus({ preventScroll: true }); q.setSelectionRange(caret, caret); }
    scrollTo(0, y);
  }
  return { render };
})();
