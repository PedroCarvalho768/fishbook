/* Ctrl+K: search everything and jump to it. */
let paletteIndex = null;
function buildPaletteIndex() {
  const rows = [];
  const add = (list, route, kind, cat, extra = () => "") => list.forEach(x => rows.push({ id: x.id, name: x.name, img: x.img, route, kind, cat, spoiler: x.spoiler || (x.locations && x.locations.every(l => l.spoiler)), sub: extra(x), hay: (x.name + " " + extra(x)).toLowerCase() }));
  add(DB.fish, "fish", "Fish", "fish", f => [...new Set(f.locations.filter(l => !l.spoiler).map(l => l.place))].join(", "));
  add(DB.shipping, "shipping", "Ship", "shipping", i => i.source || "");
  add(DB.cooking, "cooking", "Recipe", "cooking", r => r.source || "");
  add(DB.crafting, "crafting", "Craft", "crafting", r => r.source || "");
  add(DB.villagers, "friends", "Villager", null, v => v.birthday ? `${SEASON_LABEL[v.birthday.season]} ${v.birthday.day}` : "");
  add(DB.museum, "museum", "Museum", "museum", m => m.kind);
  add(DB.stardrops, "stardrops", "Stardrop", "stardrops", s => s.how);
  DB.walnuts.forEach(w => rows.push({ id: w.id, name: w.title, route: "walnuts", kind: "Walnut", cat: "walnuts", sub: w.area, hay: (w.title + " " + w.area).toLowerCase() }));
  DB.monsters.forEach(m => rows.push({ id: m.id, name: m.name, route: "monsters", kind: "Slayer goal", sub: m.targets.join(", "), hay: (m.name + " " + m.targets.join(" ")).toLowerCase() }));
  NAV.flatMap(g => g.items).forEach(it => rows.push({ id: null, name: it.label, route: it.route, kind: "Page", hay: it.label.toLowerCase(), icon: it.icon }));
  return rows;
}
function openPalette() {
  paletteIndex ??= buildPaletteIndex();
  openDialog(`<div class="palette"><div class="search">${icon("search")}<label class="sr-only" for="pal-q">Search everything</label><input id="pal-q" type="search" placeholder="Search fish, items, recipes, villagers, walnuts…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="pal-list"></div><ul id="pal-list" role="listbox"></ul></div>`);
  $("#dialog").classList.add("palette-dlg");
  $("#dialog").addEventListener("close", () => $("#dialog").classList.remove("palette-dlg"), { once: true });
  const q = $("#pal-q"), listEl = $("#pal-list");
  let sel = 0, results = [];
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    results = t ? paletteIndex.filter(r => t.split(/\s+/).every(w => r.hay.includes(w)) && (!r.spoiler || spoilersOn()))
      .sort((a, b) => (b.name.toLowerCase().startsWith(t)) - (a.name.toLowerCase().startsWith(t)) || a.name.localeCompare(b.name)).slice(0, 40)
      : paletteIndex.filter(r => r.kind === "Page");
    sel = Math.min(sel, Math.max(0, results.length - 1));
    listEl.innerHTML = results.length ? results.map((r, i) => `<li role="option" id="pal-${i}" aria-selected="${i === sel}" data-i="${i}">
      ${r.icon ? `<span class="pal-icon">${icon(r.icon)}</span>` : spriteHTML(r.img, r.name, "sm")}
      <span class="pal-main"><b>${esc(r.name)}</b>${r.sub ? `<span>${esc(r.sub)}</span>` : ""}</span>
      ${r.cat && r.id && isDone(r.cat, r.id) ? `<span class="status done">${icon("check")}</span>` : ""}<span class="tag misc">${r.kind}</span></li>`).join("")
      : `<li class="none">No matches for “${esc(q.value)}”</li>`;
    q.setAttribute("aria-activedescendant", results.length ? `pal-${sel}` : "");
  };
  const go = i => { const r = results[i]; if (!r) return; $("#dialog").close(); location.hash = `#/${r.route}${r.id ? `?item=${encodeURIComponent(r.id)}` : ""}`; if (route() === r.route) renderView(); };
  q.addEventListener("input", () => { sel = 0; draw(); });
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = clamp(sel + (e.key === "ArrowDown" ? 1 : -1), 0, results.length - 1); draw(); $(`#pal-${sel}`)?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { e.preventDefault(); go(sel); }
  });
  listEl.addEventListener("click", e => { const li = e.target.closest("[data-i]"); if (li) go(+li.dataset.i); });
  draw(); q.focus();
}
