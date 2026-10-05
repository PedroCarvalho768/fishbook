/* Dashboard (Perfection overview) and Today planner. */

function nextStep(c) {
  const missing = (list, cat) => counted(list).filter(x => !isDone(cat, x.id));
  switch (c.id) {
    case "fish": {
      const n = missing(DB.fish, "fish").filter(fishBitingNow).length;
      return n ? `${plural(n, "fish", "fish")} you need ${n === 1 ? "is" : "are"} biting right now` : `${missing(DB.fish, "fish").filter(f => f.seasons.includes(state.season)).length} still catchable this season`;
    }
    case "shipping": {
      const m = missing(DB.shipping, "shipping");
      const own = m.filter(i => owned(i.id));
      if (own.length) return `${plural(own.length, "item")} you own ${own.length === 1 ? "hasn't" : "haven't"} been shipped yet`;
      const plant = m.filter(i => plantBy(i)?.ok).sort((a, b) => plantBy(a).day - plantBy(b).day)[0];
      return plant ? `Plant ${plant.name} by ${SEASON_LABEL[state.season]} ${plantBy(plant).day}` : `${m.filter(i => i.seasons?.includes(state.season)).length} in season now`;
    }
    case "cooking": case "crafting": {
      const known = state.save?.[c.id + "Known"];
      const m = missing(DB[c.id], c.id);
      const now = m.filter(r => makeableNow(c.id, r)).length;
      if (now) return `You can ${c.id === "cooking" ? "cook" : "craft"} ${now} of them right now`;
      const buy = m.filter(r => knows(c.id, r) && canMake(r)?.buyable).length;
      if (buy) return `${buy} more after a trip to Pierre's for staples`;
      if (known) { const k = m.filter(r => known.includes(r.id)).length; if (k) return `${k} known but not ${c.id === "cooking" ? "cooked" : "crafted"} yet`; }
      return `${m.length} left`;
    }
    case "friends": {
      const m = counted(DB.villagers).filter(v => !friendDone(v));
      const bd = m.filter(v => bdayDays(v) <= 7 && canSee(v.spoiler));
      if (bd.length) return `${bd.map(v => v.name).slice(0, 2).join(" and ")}${bd.length > 2 ? ` +${bd.length - 2}` : ""}: birthday this week`;
      return m.length ? `${m.length} villagers to go` : "";
    }
    case "monsters": {
      const m = DB.monsters.filter(x => !monsterDone(x)).sort((a, b) => pct(monsterKills(b), b.count) - pct(monsterKills(a), a.count))[0];
      return m ? `Closest: ${m.name} ${fmt(monsterKills(m))}/${fmt(m.count)}` : "";
    }
    case "stardrops": { const s = DB.stardrops.find(s => !isDone("stardrops", s.id)); return s ? `Next: ${s.name}` : ""; }
    case "walnuts": return c.done < 130 ? `${130 - c.done} left on Ginger Island` : "";
    case "farmer": return c.done < 25 ? `${25 - c.done} levels to go` : "";
    case "obelisks": case "clock": {
      const left = DB.buildings.filter(b => (c.id === "clock" ? b.kind === "clock" : b.kind === "obelisk") && !isDone("buildings", b.id));
      const g = left.reduce((a, b) => a + b.cost, 0);
      return g ? `${fmt(g)}g to buy` : "";
    }
  }
  return "";
}

VIEWS[""] = {
  render(el) {
    const p = perfection();
    const s = state.save;
    const hero = `<section class="hero">
      <div class="ring hero-ring" style="--p:${p.score.toFixed(2)};--size:132px;--thick:12px"><div><b class="num">${p.score.toFixed(1)}<small>%</small></b><span>Perfection</span></div></div>
      <div class="hero-text">
        ${s ? `<h1>${esc(s.farmer)}'s ${esc(s.farm)} Farm</h1><p>Year ${s.date.year}, ${SEASON_LABEL[s.date.season]} ${s.date.day}${s.farmers.length > 1 ? ` · ${s.farmers.length} farmers, best of each counts` : ""}${p.waivers ? ` · includes ${p.waivers}% from waivers` : ""}. The game's tracker rounds down, so it shows <b>${Math.floor(p.score)}%</b>.</p>`
          : `<h1>Your road to Perfection</h1><p>Every category Mr. Qi checks, with Stardew Valley Expanded content included: ${counted(DB.fish).length} fish, ${counted(DB.shipping).length} items to ship, ${counted(DB.cooking).length} recipes, ${counted(DB.crafting).length} crafts and ${counted(DB.villagers).length} villagers.</p>`}
        ${s ? "" : `<div class="hero-actions"><button class="primary-btn" type="button" data-act="load-save">${icon("upload")}Load your save</button><button class="ghost-btn" type="button" data-act="save-help">Where is it?</button><span class="faint">or tick things off by hand</span></div>`}
      </div></section>`;

    const ch = state.changes;
    const changes = ch && ch.changes.length ? `<section class="changes" aria-label="Changes since your last update">
      <header><h2>Since your last update</h2><span class="faint">${SEASON_LABEL[ch.from.season]} ${ch.from.day} → ${SEASON_LABEL[ch.to.season]} ${ch.to.day}</span><button class="link-btn" type="button" data-home="dismiss">Dismiss</button></header>
      <ul>${ch.changes.map(c => `<li><b>${esc(c.label)}</b><span>${c.items.slice(0, 8).map(esc).join(", ")}${c.items.length > 8 ? ` and ${c.items.length - 8} more` : ""}</span></li>`).join("")}</ul></section>` : "";

    const cats = p.cats.slice().sort((a, b) => (a.frac >= 1) - (b.frac >= 1) || (b.weight * (1 - b.frac)) - (a.weight * (1 - a.frac)));
    const rows = cats.map(c => {
      const done = c.frac >= 1;
      const hint = done ? "Complete" : nextStep(c);
      return `<li><a class="cat${done ? " done" : ""}" href="#/${c.route}">
        <span class="cat-icon">${icon(done ? "check" : c.icon)}</span>
        <span class="cat-main"><span class="cat-title"><b>${c.long}</b><span class="weight">${c.weight}%</span></span><span class="cat-hint">${esc(hint)}</span></span>
        <span class="cat-bar"><span class="track"><span class="fill" style="width:${(c.frac * 100).toFixed(1)}%;display:block"></span></span><span class="num faint">${c.id === "farmer" ? `Level ${c.done}` : `${fmt(c.done)}/${fmt(c.total)}`}</span></span>
        <span class="cat-pts num">${c.points.toFixed(1)}<small>/${c.weight}</small></span>
      </a></li>`;
    }).join("");

    el.innerHTML = `${hero}${changes}
      <section><div class="group-head"><h2>Categories</h2><span>Biggest gains first</span></div><ul class="cats">${rows}</ul></section>
      ${!s ? `<div class="note" style="margin-top:20px">${icon("info")}<span>Progress you tick by hand is saved in this browser. Loading a save later keeps your manual ticks where they differ from it.</span></div>` : ""}`;
    el.onclick = e => { if (e.target.closest("[data-home=dismiss]")) { state.changes = null; persist(); renderView(true); } };
  },
};

/* ---------- Today ---------- */
function qosFor(year, season, day) {
  const y = year % 2 === 1 ? 1 : 2;
  return DB.calendar.qos.find(q => q.year === y && q.season === season && q.day === day);
}

VIEWS.today = {
  clockSensitive: true,
  render(el) {
    const s = state.save;
    const dow = weekday(state.day);
    const year = state.year || s?.date.year || 1;
    const isSaveDay = s && s.date.season === state.season && s.date.day === state.day;

    // events
    const upcoming = [];
    for (let d = 0; d <= 7; d++) {
      let day = state.day + d, si = seasonIdx();
      if (day > 28) { day -= 28; si = (si + 1) % 4; }
      DB.calendar.festivals.filter(f => f.season === SEASONS[si] && f.days.includes(day) && (!f.sve || canSee(false))).forEach(f => upcoming.push({ ...f, in: d, day, season: SEASONS[si] }));
    }
    const eventsHTML = upcoming.length ? upcoming.map(f => `<li><span class="when ${f.in === 0 ? "today" : ""}">${f.in === 0 ? "Today" : f.in === 1 ? "Tomorrow" : `${weekday(f.day)} ${f.day}`}</span><div><b>${esc(f.name)}</b>${f.sve ? ` <span class="tag sve">SVE</span>` : ""}${f.in === 0 && f.shops ? `<p class="warn-text">Shops and homes are closed all day.</p>` : ""}${f.in === 0 && f.fishing ? `<p class="faint">${esc(f.fishing)}</p>` : ""}</div></li>`).join("") : `<li class="none">No festivals in the next week.</li>`;

    // birthdays
    const bdays = DB.villagers.filter(v => bdayDays(v) <= 7 && canSee(v.spoiler)).sort((a, b) => Math.min(bdayDays(a), 999) - Math.min(bdayDays(b), 999));
    const bdayHTML = bdays.length ? bdays.map(v => {
      const d = bdayDays(v);
      return `<li><span class="when ${d === 0 ? "today" : ""}">${d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${weekday(v.birthday.day)} ${v.birthday.day}`}</span>
        ${spriteHTML(v.img, v.name, "sm portrait")}<div><a href="#/friends?item=${encodeURIComponent(v.id)}"><b>${esc(v.name)}</b></a> <span class="faint">${heartsOf(v)}/${heartsNeeded(v)} ♥</span>
        ${(() => { const gift = v.loves.find(l => owned(l.id)); return gift ? `<p class="own-line">${imgOf(gift.id) ? `<img src="${imgOf(gift.id)}" alt="" width="18" height="18">` : ""}Give ${esc(gift.name)} · ${esc(whereText(gift.id, 1))}</p>`
          : `<div class="mini-ing">${v.loves.slice(0, 5).map(l => imgOf(l.id) ? `<img src="${imgOf(l.id)}" alt="${esc(l.name)}" title="${esc(l.name)}" width="20" height="20">` : "").join("")}</div>`; })()}</div></li>`;
    }).join("") : `<li class="none">No birthdays this week.</li>`;

    // fish today
    const fishToday = counted(DB.fish).filter(f => !isDone("fish", f.id) && f.seasons.includes(state.season) && (f.weather === "any" || f.weather === state.weather))
      .map(f => ({ f, st: fishStatus(f), hidden: !fishLocsVisible(f).length })).filter(x => x.st.key !== "off").sort((a, b) => a.hidden - b.hidden || a.st.rank - b.st.rank || a.f.name.localeCompare(b.f.name));
    const fishHTML = fishToday.length ? fishToday.slice(0, 10).map(({ f, st }) => `<li>${spriteHTML(f.img, f.name, "sm")}<div><a href="#/fish?item=${encodeURIComponent(f.id)}"><b>${esc(f.name)}</b></a><p class="faint">${esc([...new Set(fishLocsVisible(f).map(l => l.place))].slice(0, 2).join(", ") || "Secret location")}</p></div><span class="status ${st.key}"><i></i>${esc(st.text)}</span></li>`).join("")
      + (fishToday.length > 10 ? `<li class="more"><a href="#/fish">${fishToday.length - 10} more on the Fish page</a></li>` : "")
      : `<li class="none">Nothing new to catch today. ${state.weather === "sun" ? "Check again on a rainy day." : ""}</li>`;

    // planting & shipping
    const ship = counted(DB.shipping).filter(i => !isDone("shipping", i.id));
    const plant = ship.filter(i => plantBy(i)?.ok).sort((a, b) => plantBy(a).day - plantBy(b).day);
    const forage = ship.filter(i => i.kind === "forage" && i.seasons?.includes(state.season));
    const shipHTML = (plant.length || forage.length) ? [
      ...plant.slice(0, 6).map(i => { const pb = plantBy(i); return `<li>${spriteHTML(i.img, i.name, "sm")}<div><a href="#/shipping?item=${encodeURIComponent(i.id)}"><b>${esc(i.name)}</b></a><p class="faint">${esc(i.seed || "")} · ${i.grow} days</p></div><span class="status ${pb.day - state.day <= 3 ? "leaving" : "now"}"><i></i>${pb.day === state.day ? "Plant today" : `Plant by ${pb.day}`}</span></li>`; }),
      ...forage.slice(0, 4).map(i => `<li>${spriteHTML(i.img, i.name, "sm")}<div><a href="#/shipping?item=${encodeURIComponent(i.id)}"><b>${esc(i.name)}</b></a><p class="faint">Forage, not shipped yet</p></div><span class="status now"><i></i>In season</span></li>`),
    ].join("") : `<li class="none">Nothing to plant or forage for the collection this season.</li>`;

    // things you can finish tonight from your chests
    const shipOwned = ship.filter(i => owned(i.id));
    const makeList = cat => counted(DB[cat]).filter(r => !isDone(cat, r.id) && knows(cat, r)).map(r => ({ r, cat, cm: canMake(r) })).filter(x => x.cm?.ok || x.cm?.buyable).sort((a, b) => b.cm.ok - a.cm.ok);
    const makeNow = [...makeList("cooking"), ...makeList("crafting")];
    const museumOwned = (DB.museum || []).filter(m => !isDone("museum", m.id) && owned(m.id));
    const tonightHTML = !hasInventory() ? `<li class="none">Load your save to see what you can finish from your chests.</li>`
      : (shipOwned.length || makeNow.length || museumOwned.length) ? [
        ...shipOwned.slice(0, 6).map(i => `<li>${spriteHTML(i.img, i.name, "sm")}<div><a href="#/shipping?item=${encodeURIComponent(i.id)}"><b>Ship ${esc(i.name)}</b></a><p class="faint">${esc(whereText(i.id, 1))}</p></div><span class="tag misc">+${(15 / counted(DB.shipping).length).toFixed(2)}%</span></li>`),
        ...makeNow.slice(0, 6).map(({ r, cat, cm }) => `<li>${spriteHTML(r.img, r.name, "sm")}<div><a href="#/${cat}?item=${encodeURIComponent(r.id)}"><b>${cat === "cooking" ? "Cook" : "Craft"} ${esc(r.name)}</b></a><p class="${cm.ok ? "faint" : "own-line"}">${cm.ok ? esc(r.ingredients.map(i => i.name).join(", ")) : esc(buyText(cm) + " first")}</p></div><span class="tag misc">+${(10 / counted(DB[cat]).length).toFixed(2)}%</span></li>`),
        ...museumOwned.slice(0, 3).map(m => `<li>${spriteHTML(m.img, m.name, "sm")}<div><a href="#/museum?item=${encodeURIComponent(m.id)}"><b>Donate ${esc(m.name)}</b></a><p class="faint">${esc(whereText(m.id, 1))}</p></div></li>`),
        ...(shipOwned.length + makeNow.length > 12 ? [`<li class="more"><span class="faint">${shipOwned.length} to ship and ${makeNow.length} to cook or craft in total</span></li>`] : []),
      ].join("") : `<li class="none">Nothing in your chests finishes a Perfection item. Time to go out!</li>`;

    // queen of sauce
    let qosHTML;
    const sun = Math.ceil(state.day / 7) * 7;
    const todayQ = state.day % 7 === 0 ? qosFor(year, state.season, state.day) : null;
    const nextQ = qosFor(year, state.season, state.day % 7 === 0 ? Math.min(28, state.day + 7) : sun);
    const qLine = (q, label) => { if (!q) return ""; const r = DB.cooking.find(r => r.name === q.recipe || r.id === q.recipe); const st = r ? (isDone("cooking", r.id) ? "Cooked" : state.save?.cookingKnown?.includes(r.id) ? "Known" : "Not learned") : ""; return `<li>${r ? spriteHTML(r.img, r.name, "sm") : ""}<div><b>${esc(q.recipe)}</b><p class="faint">${label}</p></div>${st ? `<span class="status ${st === "Not learned" ? "now" : "done"}"><i></i>${st}</span>` : ""}</li>`; };
    qosHTML = (todayQ ? qLine(todayQ, "On TV today. Watch it to learn the recipe.") : "") + (dow === "Wed" ? `<li class="none">Wednesday rerun today: a past recipe you may not know yet.</li>` : "") + (nextQ && nextQ !== todayQ ? qLine(nextQ, `Airs Sunday ${SEASON_LABEL[state.season]} ${nextQ.day}`) : "") || `<li class="none">No new recipe this week.</li>`;

    // last chance
    const leavingFish = counted(DB.fish).filter(f => !isDone("fish", f.id) && f.seasons.includes(state.season) && !f.seasons.includes(nextSeasonName()) && f.seasons.length < 4);
    const leavingShip = ship.filter(i => i.seasons?.includes(state.season) && !i.seasons.includes(nextSeasonName()) && i.seasons.length < 4);
    const lastHTML = (leavingFish.length || leavingShip.length) ? [...leavingFish, ...leavingShip].slice(0, 12).map(x => {
      const isFish = !!DB.fishById[x.id];
      return `<li>${spriteHTML(x.img, x.name, "sm")}<div><a href="#/${isFish ? "fish" : "shipping"}?item=${encodeURIComponent(x.id)}"><b>${esc(x.name)}</b></a><p class="faint">${isFish ? "Fish" : KIND_LABEL[x.kind]}, gone after ${SEASON_LABEL[state.season]} 28${!isFish && x.grow ? ` · ${x.grow}-day crop` : ""}</p></div></li>`;
    }).join("") : `<li class="none">Nothing you still need leaves at the end of ${SEASON_LABEL[state.season]}.</li>`;

    const wxTomorrow = isSaveDay && s.weatherTomorrow ? ({ Rain: "Rain", Storm: "Storm", Snow: "Snow", Wind: "Windy", Sun: "Sunny", Festival: "Festival", GreenRain: "Green rain" }[s.weatherTomorrow] || s.weatherTomorrow) : null;
    el.innerHTML = `
      <div class="view-head"><div><h1>${dow === "Sun" ? "Sunday" : { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" }[dow]}, ${SEASON_LABEL[state.season]} ${state.day}</h1>
        <p>Year ${year} · ${state.weather === "rain" ? "Rainy" : "Dry"} day · ${daysLeft() - 1 === 0 ? "last day of the season" : `${plural(daysLeft() - 1, "day")} left in ${SEASON_LABEL[state.season]}`}${wxTomorrow ? ` · Tomorrow: <b>${esc(wxTomorrow)}</b>` : ""}</p></div>
        ${s && !isSaveDay ? `<button class="ghost-btn" type="button" data-act="clock-from-save">${icon("calendar")}Back to save date</button>` : ""}</div>
      <div class="today-grid">
        <section class="panel-block span-2"><h2>${icon("fish")}Fish to catch today</h2><ul class="plan">${fishHTML}</ul></section>
        <section class="panel-block"><h2>${icon("cake")}Birthdays</h2><ul class="plan">${bdayHTML}</ul></section>
        <section class="panel-block span-2"><h2>${icon("box")}Finish from your chests</h2><ul class="plan cols-2">${tonightHTML}</ul></section>
        <section class="panel-block"><h2>${icon("calendar")}Festivals and events</h2><ul class="plan">${eventsHTML}</ul></section>
        <section class="panel-block"><h2>${icon("sprout")}Plant and forage</h2><ul class="plan">${shipHTML}</ul></section>
        <section class="panel-block"><h2>${icon("pot")}Queen of Sauce</h2><ul class="plan">${qosHTML}</ul></section>
        <section class="panel-block span-2"><h2>${icon("clock")}Last chance this season</h2><ul class="plan cols-2">${lastHTML}</ul></section>
      </div>`;
    el.onclick = e => {
      if (e.target.closest("[data-act=clock-from-save]")) setClock({ season: s.date.season, day: s.date.day, weather: s.isRaining ? "rain" : "sun", year: s.date.year });
    };
  },
};
