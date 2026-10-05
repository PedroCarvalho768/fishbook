/* Generic checklist view used by Shipping, Cooking, Crafting, Museum and others.
   config: {
     id, cat (progress category), title, weight?, intro,
     items: () => array of { id, name, img, sve, spoiler, ... },
     sub(item) -> html, meta(item) -> html, detail(item) -> html, search(item) -> string,
     groups: [{ value, label, key(item) -> string|string[] , order? }],
     filters: [{ value, label, test(item) }]   // extra quick filters (seg buttons)
     status(item) -> {key, text}  optional
   } */

function listView(cfg) {
  const V = cfg.id;
  let query = "";
  const open = new Set();

  const filtersFor = () => [{ value: "all", label: "All" }, { value: "missing", label: "Missing" }, { value: "done", label: cfg.doneLabel || "Done" }];

  function visible(item) {
    if (item.spoiler && !canSee(true, item.id) && ui(V, "hideSecret", false)) return false;
    return true;
  }
  function matches(item, ignore = {}) {
    if (!visible(item)) return false;
    const st = ui(V, "status", "all");
    if (!ignore.status) {
      if (st === "missing" && isDone(cfg.cat, item.id)) return false;
      if (st === "done" && !isDone(cfg.cat, item.id)) return false;
    }
    const qf = ui(V, "quick", "any");
    if (!ignore.quick && qf !== "any") { const f = (cfg.quick || []).find(f => f.value === qf); if (f && !f.test(item)) return false; }
    if (query) {
      const hay = (item._search ??= (cfg.search ? cfg.search(item) : item.name).toLowerCase());
      if (!query.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t))) return false;
    }
    return true;
  }

  function nameOf(item) { return item.spoiler && !canSee(true, item.id) ? (cfg.secretName || "Secret SVE item") : item.name; }

  function rowHTML(item) {
    const done = isDone(cfg.cat, item.id);
    const secret = item.spoiler && !canSee(true, item.id);
    const isOpen = open.has(item.id);
    return `<li class="item${done ? " done" : ""}${isOpen ? " open" : ""}" data-id="${esc(item.id)}">
      <div class="item-row">
        <label class="catch" title="${done ? "Unmark" : "Mark"} ${esc(nameOf(item))}">
          <input type="checkbox" ${done ? "checked" : ""} aria-label="${esc(cfg.checkLabel || "Done")}: ${esc(nameOf(item))}" data-check="${esc(item.id)}">
          <span class="box">${icon("check", "")}</span><span class="ripple"></span>
        </label>
        ${secret ? spriteHTML(null, "?", "sm") : spriteHTML(item.img, item.name, "sm")}
        <div class="item-name">
          <button type="button" class="nm-btn" aria-expanded="${isOpen}" data-open="${esc(item.id)}"><span class="nm">${esc(nameOf(item))}</span>${item.sve ? `<span class="tag sve">SVE</span>` : ""}${isManual(cfg.cat, item.id) ? `<span class="tag manual" title="Set by hand, differs from your save">manual</span>` : ""}${cfg.tags ? cfg.tags(item) : ""}</button>
          <div class="sub">${secret ? `<span class="secret">Story spoiler</span>` : (cfg.sub ? cfg.sub(item) : "")}</div>
        </div>
        <div class="item-meta">${secret ? "" : (cfg.meta ? cfg.meta(item) : "")}</div>
      </div>
      <div class="detail">${isOpen ? detailWrap(item) : "<div></div>"}</div>
    </li>`;
  }
  function detailWrap(item) {
    const secret = item.spoiler && !canSee(true, item.id);
    if (secret) return `<div><div class="detail-inner"><div class="dl wide"><p class="muted">This entry reveals part of SVE's story. <button type="button" class="reveal-btn" data-reveal="${esc(item.id)}">Reveal it</button></p></div></div></div>`;
    return `<div><div class="detail-inner">${cfg.detail ? cfg.detail(item) : ""}${item.wiki ? `<div class="detail-actions"><a class="ghost-btn" href="${esc(item.wiki)}" target="_blank" rel="noopener">${icon("link")}Open ${esc(item.name)} on the wiki</a></div>` : ""}</div></div>`;
  }

  function emptyHTML() {
    const st = ui(V, "status", "all");
    const allDone = st === "missing" && !query && ui(V, "quick", "any") === "any";
    return `<div class="empty">${icon(allDone ? "trophy" : "search", "art i")}
      <h3>${allDone ? `All ${cfg.title.toLowerCase()} complete` : "Nothing matches"}</h3>
      <p>${allDone ? (cfg.doneMessage || "This category is finished.") : "Loosen a filter or clear the search to see more."}</p>
      ${allDone ? "" : `<div class="row"><button type="button" class="ghost-btn" data-lv="reset">Clear filters</button></div>`}</div>`;
  }

  function renderList() {
    const items = cfg.items().filter(i => matches(i));
    const el = $("#lv-list");
    if (!items.length) { el.innerHTML = emptyHTML(); return; }
    const sort = cfg.sort || ((a, b) => a.name.localeCompare(b.name));
    const gv = ui(V, "group", cfg.groups?.[0]?.value || "none");
    const g = (cfg.groups || []).find(g => g.value === gv);
    if (!g || g.value === "none") { el.innerHTML = `<ul class="items">${items.sort(sort).map(rowHTML).join("")}</ul>`; return; }
    const groups = new Map();
    items.forEach(i => { [].concat(g.key(i)).forEach(k => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }); });
    const order = [...groups.keys()].sort(g.order || ((a, b) => String(a).localeCompare(String(b))));
    el.innerHTML = order.map(k => {
      const arr = groups.get(k).sort(sort);
      const d = arr.filter(i => isDone(cfg.cat, i.id)).length;
      return `<section aria-label="${esc(k)}"><div class="group-head"><h3>${esc(g.label ? g.label(k) : k)}</h3><span>${d}/${arr.length}</span><div class="track thin"><div class="fill" style="width:${pct(d, arr.length)}%"></div></div></div><ul class="items">${arr.map(rowHTML).join("")}</ul></section>`;
    }).join("");
  }

  function renderHead() {
    const all = cfg.items().filter(i => i.counts !== false);
    const d = all.filter(i => isDone(cfg.cat, i.id)).length;
    $("#lv-score").innerHTML = `<div class="big num">${d}<span> / ${all.length}</span></div><small>${cfg.weight ? `${(pct(d, all.length) * cfg.weight / 100).toFixed(1)} of ${cfg.weight} perfection points` : `${Math.round(pct(d, all.length))}% complete`}</small>`;
    const counts = { all: 0, missing: 0, done: 0 };
    cfg.items().forEach(i => { if (matches(i, { status: true })) { counts.all++; isDone(cfg.cat, i.id) ? counts.done++ : counts.missing++; } });
    $("#lv-status").innerHTML = filtersFor().map(f => `<button type="button" data-lv-status="${f.value}" aria-pressed="${ui(V, "status", "all") === f.value}">${f.label} <span class="n">${counts[f.value]}</span></button>`).join("");
  }

  function render(el) {
    const groupOpts = (cfg.groups || []).map(g => `<option value="${g.value}" ${ui(V, "group", cfg.groups[0].value) === g.value ? "selected" : ""}>${g.title}</option>`).join("");
    const quickOpts = cfg.quick ? `<div class="select"><label class="sr-only" for="lv-quick">Filter</label><select id="lv-quick"><option value="any">${cfg.quickAll || "Everything"}</option>${cfg.quick.map(q => `<option value="${q.value}" ${ui(V, "quick", "any") === q.value ? "selected" : ""}>${q.label}</option>`).join("")}</select>${icon("chev")}</div>` : "";
    el.innerHTML = `
      <div class="view-head">
        <div><h1>${cfg.title}${cfg.weight ? `<span class="weight">${cfg.weight}% of Perfection</span>` : ""}</h1>${cfg.intro ? `<p>${cfg.intro}</p>` : ""}</div>
        <div class="score" id="lv-score"></div>
      </div>
      ${cfg.banner ? cfg.banner() : ""}
      <div class="toolbar" role="search">
        <div class="search">${icon("search")}<label for="lv-q" class="sr-only">Search ${cfg.title}</label><input id="lv-q" type="search" placeholder="${cfg.placeholder || "Search"}" autocomplete="off" spellcheck="false" value="${esc(query)}"><button type="button" class="clear" data-lv="clear-q" aria-label="Clear search">${icon("x")}</button></div>
        <div class="seg" role="group" aria-label="Show" id="lv-status"></div>
        ${quickOpts}
        ${groupOpts ? `<div class="select"><label class="sr-only" for="lv-group">Group by</label><select id="lv-group">${groupOpts}</select>${icon("chev")}</div>` : ""}
      </div>
      <div id="lv-list"></div>`;
    renderHead(); renderList();
    const q = $("#lv-q");
    let t; q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { query = q.value.trim(); renderHead(); renderList(); }, 70); });
    el.addEventListener("change", e => {
      if (e.target.id === "lv-group") { setUI(V, { group: e.target.value }); renderList(); }
      if (e.target.id === "lv-quick") { setUI(V, { quick: e.target.value }); renderHead(); renderList(); }
      if (e.target.dataset.check) toggle(e.target.dataset.check, e.target.checked);
    });
    el.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.lvStatus) { setUI(V, { status: b.dataset.lvStatus }); renderHead(); renderList(); }
      else if (b.dataset.lv === "clear-q") { query = ""; q.value = ""; renderHead(); renderList(); q.focus(); }
      else if (b.dataset.lv === "reset") { query = ""; q.value = ""; setUI(V, { status: "all", quick: "any" }); render(el); }
      else if (b.dataset.open) toggleOpen(b.dataset.open, b);
      else if (b.dataset.reveal) { revealed.add(b.dataset.reveal); rerenderItem(b.dataset.reveal); }
      cfg.onClick?.(e, b, { rerenderItem, renderList, renderHead });
    });
    const target = routeParam("item");
    if (target) requestAnimationFrame(() => { open.add(target); renderList(); const li = $(`.item[data-id="${CSS.escape(target)}"]`); li?.scrollIntoView({ block: "center" }); li?.querySelector("[data-check]")?.focus({ preventScroll: true }); });
  }

  function toggleOpen(id, btn) {
    const li = btn.closest(".item");
    const item = cfg.items().find(i => i.id === id);
    if (open.has(id)) { open.delete(id); li.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    else { open.add(id); li.querySelector(".detail").innerHTML = detailWrap(item); requestAnimationFrame(() => li.classList.add("open")); btn.setAttribute("aria-expanded", "true"); }
  }
  function rerenderItem(id) {
    const li = $(`.item[data-id="${CSS.escape(id)}"]`); if (!li) return;
    const item = cfg.items().find(i => i.id === id);
    const tmp = document.createElement("ul"); tmp.innerHTML = rowHTML(item);
    li.replaceWith(tmp.firstElementChild);
  }

  function toggle(id, v) {
    const item = cfg.items().find(i => i.id === id);
    const was = isDone(cfg.cat, id);
    const now = v ?? !was;
    if (now === was) return;
    setVal(cfg.cat, id, now);
    const li = $(`.item[data-id="${CSS.escape(id)}"]`);
    const willHide = li && !matches(item);
    if (li) {
      li.classList.toggle("done", now);
      li.querySelector("[data-check]").checked = now;
      if (now) { const c = li.querySelector(".catch"); c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop"); }
    }
    renderHead();
    if (willHide) setTimeout(() => { li.classList.add("leaving-out"); setTimeout(() => { const next = li.nextElementSibling?.dataset.id; renderList(); if (next) $(`.item[data-id="${CSS.escape(next)}"] [data-check]`)?.focus(); }, 420); }, 350);
    if (now) toast(`${item.img ? `<img src="${item.img}" alt="">` : ""}${esc(nameOf(item))} ${cfg.doneVerb || "done"}`, () => { setVal(cfg.cat, id, false); rerenderItem(id); renderHead(); });
  }

  return {
    render,
    onKey: e => listKeys(e, ".item", id => toggle(id), $("#lv-q")),
    onClock: cfg.clockSensitive ? () => { renderHead(); renderList(); } : null,
  };
}

/* shared j/k/x navigation for list views */
function listKeys(e, sel, toggleFn, searchEl) {
  const rows = $$(sel);
  const cur = document.activeElement?.closest?.(sel);
  const idx = cur ? rows.indexOf(cur) : -1;
  const k = e.key;
  if (k === "/" && searchEl) { e.preventDefault(); searchEl.focus(); searchEl.select(); }
  else if (k === "j" || k === "k") {
    e.preventDefault();
    const next = rows[clamp(idx + (k === "j" ? 1 : -1), 0, rows.length - 1)] || rows[0];
    next?.querySelector("input[type=checkbox], button")?.focus();
    next?.scrollIntoView({ block: "nearest" });
  }
  else if (k === "x" && cur) { e.preventDefault(); toggleFn(cur.dataset.id); }
  else if (k === "Enter" && cur && e.target.matches("input[type=checkbox]")) { e.preventDefault(); cur.querySelector("[data-open]")?.click(); }
}

/* ingredient chips */
function ingredientsHTML(list) {
  const inv = hasInventory();
  return `<div class="ing">${list.map(i => {
    const have = inv ? ownedFor(i.id) : null;
    const cls = inv ? (have >= i.qty ? "have" : "short") : "";
    const tip = inv ? (have >= i.qty ? `You have ${fmt(have)}${String(i.id).startsWith("-") ? "" : ": " + whereText(i.id, 4)}` : `You have ${fmt(have)} of ${i.qty}`) : "";
    return `<span class="${cls}" ${tip ? `title="${esc(tip)}"` : ""}>${imgOf(i.id) ? `<img src="${imgOf(i.id)}" alt="" width="22" height="22">` : ""}${i.qty > 1 ? `${i.qty}× ` : ""}${esc(i.name)}${inv ? `<b class="num">${fmt(Math.min(have, 9999))}/${i.qty}</b>` : ""}</span>`;
  }).join("")}</div>`;
}
