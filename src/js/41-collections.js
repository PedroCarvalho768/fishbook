/* Shipping, Cooking, Crafting, Museum and Bundles views. */

/* ---------- crop timing ---------- */
// Latest day in the current season you can plant and still harvest before the crop's seasons run out.
function plantBy(item) {
  if (!item.grow || !item.seasons?.includes(state.season)) return null;
  let span = 1;
  for (let k = 1; k < 4; k++) { if (item.seasons.includes(SEASONS[(seasonIdx() + k) % 4])) span++; else break; }
  if (span >= 4) return { day: 28, ok: true, span };
  const latest = 28 * span - item.grow;
  const day = Math.min(28, latest);
  return { day, ok: day >= state.day, span };
}

const KIND_LABEL = { crop: "Crop", forage: "Forage", fruit: "Fruit tree", animal: "Animal product", artisan: "Artisan good", mineral: "Mineral", fish: "Fish product", other: "Other" };

function shipStatus(item) {
  if (isDone("shipping", item.id)) return null;
  if (owned(item.id)) return { key: "now", text: `Ship it: ${whereText(item.id, 1)}` };
  const pb = plantBy(item);
  if (pb) {
    if (!pb.ok) return { key: "off", text: "Too late to plant outdoors" };
    const left = pb.day - state.day;
    return { key: left <= 3 ? "leaving" : "now", text: left === 0 ? "Plant today" : pb.day >= 28 && pb.span > 1 ? `Plant anytime this season` : `Plant by ${SEASON_LABEL[state.season]} ${pb.day}` };
  }
  if (item.seasons?.length && item.seasons.length < 4) {
    if (item.seasons.includes(state.season)) {
      const leaving = !item.seasons.includes(nextSeasonName()) && daysLeft() <= 7;
      return { key: leaving ? "leaving" : "now", text: leaving ? `In season · leaves in ${daysLeft()}d` : "In season now" };
    }
    return { key: "off", text: `In ${item.seasons.map(s => SEASON_LABEL[s]).join(", ")}` };
  }
  return null;
}

VIEWS.shipping = listView({
  id: "shipping", cat: "shipping", title: "Shipping", weight: 15, clockSensitive: true,
  intro: "Ship one of each item through the shipping bin. Crops show the last day you can plant them this season.",
  placeholder: "Search items, seasons, sources",
  items: () => DB.shipping, doneVerb: "shipped", checkLabel: "Shipped", doneLabel: "Shipped",
  doneMessage: "Every item has been through the shipping bin.",
  search: i => [i.name, KIND_LABEL[i.kind], i.source, ...(i.seasons || [])].join(" "),
  sub: i => { const st = shipStatus(i); return `${esc(KIND_LABEL[i.kind] || "")}${i.source ? `<span class="sep">·</span>${esc(i.source)}` : ""}${st ? `<span class="sep">·</span><span class="status ${st.key}"><i></i>${esc(st.text)}</span>` : ""}`; },
  meta: i => `${i.seasons?.length ? seasonsMini(i.seasons, state.season) : ""}<span class="num faint" style="min-width:52px;text-align:right">${fmt(i.price)}g</span>`,
  detail: i => {
    const pb = plantBy(i);
    return `<div class="dl"><h4>How to get it</h4><p>${esc(i.source || KIND_LABEL[i.kind] || "")}</p></div>
      ${i.seasons?.length ? `<div class="dl"><h4>Seasons</h4><p>${i.seasons.length === 4 ? "All seasons" : i.seasons.map(s => SEASON_LABEL[s]).join(", ")}</p></div>` : ""}
      ${i.grow ? `<div class="dl"><h4>Growing</h4><ul><li>${i.grow} days to grow${i.regrow > 0 ? `, regrows every ${i.regrow}` : ""}</li>${pb ? `<li>${pb.ok ? `Plant by ${SEASON_LABEL[state.season]} ${pb.day}` : "Too late outdoors this season. Greenhouse or Ginger Island still work."}</li>` : ""}${i.seed ? `<li>Seed: ${esc(i.seed)}</li>` : ""}</ul></div>` : ""}
      <div class="dl"><h4>Sells for</h4><p>${fmt(i.price)}g base</p></div>
      ${owned(i.id) ? `<div class="dl"><h4>You have</h4><p>${esc(whereText(i.id, 5))}</p></div>` : ""}`;
  },
  quick: [
    { value: "owned", label: "You own it, not shipped", test: i => owned(i.id) > 0 && !isDone("shipping", i.id) },
    { value: "season", label: "In season now", test: i => !i.seasons?.length || i.seasons.includes(state.season) },
    { value: "plant", label: "Can still plant this season", test: i => plantBy(i)?.ok },
    { value: "crop", label: "Crops", test: i => i.kind === "crop" },
    { value: "forage", label: "Forage", test: i => i.kind === "forage" },
    { value: "animal", label: "Animal products", test: i => i.kind === "animal" },
    { value: "artisan", label: "Artisan goods", test: i => i.kind === "artisan" },
    { value: "sve", label: "SVE items", test: i => i.sve },
  ],
  groups: [
    { value: "kind", title: "Group by type", key: i => KIND_LABEL[i.kind] || "Other" },
    { value: "season", title: "Group by season", key: i => i.seasons?.length && i.seasons.length < 4 ? i.seasons.map(s => SEASON_LABEL[s]) : ["Any season"], order: (a, b) => ["Spring", "Summer", "Fall", "Winter", "Any season"].indexOf(a) - ["Spring", "Summer", "Fall", "Winter", "Any season"].indexOf(b) },
    { value: "none", title: "No grouping", key: () => "" },
  ],
});

/* ---------- recipes ---------- */
function recipeStatus(cat, r) {
  if (isDone(cat, r.id)) return null;
  const cm = canMake(r);
  const known = state.save?.[cat + "Known"];
  if (cm?.ok && knows(cat, r)) return { key: "now", text: cat === "cooking" ? "You can cook this now" : "You can craft this now" };
  if (cm?.buyable && knows(cat, r)) return { key: "now", text: `${buyText(cm)}, you have the rest` };
  if (cm && knows(cat, r) && cm.missing.length === 1) return { key: "later", text: `Known · missing ${cm.missing[0].name}` };
  if (known) return known.includes(r.id) ? { key: "now", text: "Known, not made yet" } : { key: "off", text: "Not learned yet" };
  return null;
}
function qosText(q) { return q ? `Queen of Sauce, ${SEASON_LABEL[q.season]} ${q.day}${q.year ? `, year ${q.year}` : ""}` : ""; }

function recipeView(kind) {
  const cat = kind;
  const isCook = kind === "cooking";
  return listView({
    id: kind, cat, title: isCook ? "Cooking" : "Crafting", weight: 10,
    intro: isCook ? "Cook every recipe at least once. Learning a recipe isn't enough; the dish has to come out of your kitchen." : "Craft every recipe at least once (the Wedding Ring doesn't count).",
    placeholder: isCook ? "Search dishes, ingredients, sources" : "Search items, materials, sources",
    items: () => DB[kind], doneVerb: isCook ? "cooked" : "crafted", checkLabel: isCook ? "Cooked" : "Crafted", doneLabel: isCook ? "Cooked" : "Crafted",
    search: r => [r.name, r.source, ...r.ingredients.map(i => i.name)].join(" "),
    sub: r => { const st = recipeStatus(cat, r); return `${esc(r.source || "")}${st ? `<span class="sep">·</span><span class="status ${st.key}"><i></i>${st.text}</span>` : ""}`; },
    meta: r => `<span class="faint ing-count">${r.ingredients.map(i => esc(i.name)).slice(0, 3).join(", ")}${r.ingredients.length > 3 ? "…" : ""}</span>`,
    detail: r => `<div class="dl wide"><h4>Ingredients</h4>${ingredientsHTML(r.ingredients)}</div>
      <div class="dl"><h4>How to learn it</h4><p>${esc(r.source || "Unknown")}</p></div>
      ${r.qos ? `<div class="dl"><h4>On TV</h4><p>${esc(qosText(r.qos))}. Reruns air on Wednesdays.</p></div>` : ""}
      ${r.loved?.length ? `<div class="dl"><h4>Loved by</h4><p>${r.loved.filter(n => canSee(DB.villagerByName[n]?.spoiler, r.id)).map(esc).join(", ")}</p></div>` : ""}`,
    quick: [
      { value: "make", label: isCook ? "Can cook now (or after a Pierre's run)" : "Can craft now (or after a Pierre's run)", test: r => makeableNow(cat, r) || (!isDone(cat, r.id) && knows(cat, r) && canMake(r)?.buyable) },
      { value: "known", label: "Known but not made", test: r => recipeStatus(cat, r)?.key === "now" },
      { value: "unknown", label: "Not learned yet", test: r => recipeStatus(cat, r)?.key === "off" },
      ...(isCook ? [{ value: "qos", label: "From the Queen of Sauce", test: r => !!r.qos }] : []),
      { value: "sve", label: "SVE recipes", test: r => r.sve },
    ],
    groups: [
      { value: "source", title: "Group by source", key: r => r.sourceGroup || "Other" },
      { value: "none", title: "No grouping", key: () => "" },
    ],
  });
}
VIEWS.cooking = recipeView("cooking");
VIEWS.crafting = recipeView("crafting");

/* ---------- museum ---------- */
VIEWS.museum = listView({
  id: "museum", cat: "museum", title: "Museum",
  intro: "Donate every artifact and mineral to Gunther. Not part of Perfection, but it unlocks a stardrop and the Museum rewards.",
  placeholder: "Search artifacts and minerals",
  items: () => DB.museum, doneVerb: "donated", checkLabel: "Donated", doneLabel: "Donated",
  search: m => [m.name, m.kind, m.source].join(" "),
  sub: m => `${esc(cap(m.kind))}${m.source ? `<span class="sep">·</span>${esc(m.source)}` : ""}${!isDone("museum", m.id) && owned(m.id) ? `<span class="sep">·</span><span class="status now"><i></i>Donate it: ${esc(whereText(m.id, 1))}</span>` : ""}`,
  meta: m => `<span class="num faint">${fmt(m.price)}g</span>`,
  detail: m => `<div class="dl"><h4>Where to find it</h4><p>${esc(m.source || "See the wiki")}</p></div>`,
  groups: [
    { value: "kind", title: "Group by type", key: m => cap(m.kind) + "s" },
    { value: "none", title: "No grouping", key: () => "" },
  ],
});

/* ---------- bundles ---------- */
const bundleItemKey = (b, i) => `${b.id}:${i.key}`;
const bundleDone = b => isDone("bundleDone", b.id) || b.items.filter(i => isDone("bundles", bundleItemKey(b, i))).length >= b.required;

VIEWS.bundles = (() => {
  function render(el) {
    if (!bundlesList().length) { el.innerHTML = `<div class="empty">${icon("box", "art i")}<h2>Bundle data unavailable</h2></div>`; return; }
    const all = bundlesList();
    const rooms = [...new Set(all.map(b => b.room))];
    const done = all.filter(bundleDone).length;
    el.innerHTML = `
      <div class="view-head"><div><h1>Community Center bundles</h1><p>Not part of Perfection, but most players finish these first. Tick items as you donate them; a bundle completes once enough slots are filled.${state.save?.bundles ? " Your save's bundle progress is loaded." : ""}</p></div>
      <div class="score"><div class="big num">${done}<span> / ${all.length}</span></div><small>bundles complete</small></div></div>
      ${rooms.map(room => {
        const bs = all.filter(b => b.room === room);
        const d = bs.filter(bundleDone).length;
        return `<section class="room"><div class="group-head"><h2>${esc(room)}</h2><span>${d}/${bs.length}</span><div class="track thin"><div class="fill" style="width:${pct(d, bs.length)}%"></div></div></div>
          <div class="bundle-grid">${bs.map(bundleHTML).join("")}</div></section>`;
      }).join("")}`;
    el.onchange = e => {
      const t = e.target; if (!t.dataset.bitem) return;
      setVal("bundles", t.dataset.bitem, t.checked);
      const b = bundlesList().find(b => b.id === t.dataset.bundle);
      const card = t.closest(".bundle");
      const was = card.classList.contains("complete");
      card.outerHTML = bundleHTML(b);
      if (!was && bundleDone(b)) toast(`${esc(b.name)} complete${b.reward ? ` <span class="sub">· ${esc(b.reward)}</span>` : ""}`);
      renderView(true);
    };
  }
  function bundleHTML(b) {
    const filled = b.items.filter(i => isDone("bundles", bundleItemKey(b, i))).length;
    const complete = bundleDone(b);
    return `<article class="bundle${complete ? " complete" : ""}">
      <header><h3>${esc(b.name)}</h3><span class="num">${Math.min(filled, b.required)}/${b.required}</span></header>
      <ul>${b.items.map(i => { const k = bundleItemKey(b, i); const on = isDone("bundles", k); return `<li><label class="bitem${on ? " on" : ""}"><input type="checkbox" data-bitem="${esc(k)}" data-bundle="${esc(b.id)}" ${on ? "checked" : ""}>${imgOf(i.id) ? `<img src="${imgOf(i.id)}" alt="">` : `<span class="dot"></span>`}<span>${i.qty > 1 ? `${i.qty}× ` : ""}${esc(i.name)}${i.quality ? ` <span class="faint">(${esc(i.quality)})</span>` : ""}</span>${!on && !complete && i.id && owned(i.id) >= i.qty ? `<span class="tag own" title="${esc(whereText(i.id, 4))}">${icon("box")}${fmt(owned(i.id))}</span>` : ""}</label></li>`; }).join("")}</ul>
      ${b.reward ? `<footer>${icon("gift")}${esc(b.reward)}</footer>` : ""}
    </article>`;
  }
  return { render };
})();
