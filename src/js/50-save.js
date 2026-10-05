/* Save file import. Parses Stardew Valley 1.6 saves in the browser; nothing is uploaded.
   Strategy: cut the few regions we need out of the 14 MB string and DOM-parse only those
   (~10 ms), falling back to a full DOMParser pass if slicing fails. */

const XSI = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"';
const STARDROP_FLAGS = ["CF_Fair", "CF_Fish", "CF_Mines", "CF_Sewer", "CF_Spouse", "CF_Statue", "museumComplete"];
const BUILDING_TYPES = ["Earth Obelisk", "Water Obelisk", "Desert Obelisk", "Island Obelisk", "Gold Clock"];
const XP_ORDER = ["farming", "fishing", "foraging", "mining", "combat", "luck"];

function parseXML(str) {
  const doc = new DOMParser().parseFromString(str, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("XML parse error");
  return doc;
}
const kids = (el, tag) => el ? [...el.children].filter(c => c.tagName === tag) : [];
const kid = (el, tag) => el ? [...el.children].find(c => c.tagName === tag) || null : null;
const txt = (el, tag) => { const k = kid(el, tag); return k ? k.textContent : null; };
const num = (el, tag) => { const t = txt(el, tag); return t == null || t === "" ? null : Number(t); };

/* SerializableDictionary -> plain object. valueFn receives the <value> element */
function dict(el, valueFn = v => v.firstElementChild?.textContent) {
  const out = {};
  if (!el) return out;
  for (const item of kids(el, "item")) {
    const k = kid(item, "key")?.firstElementChild?.textContent;
    const v = kid(item, "value");
    if (k != null && v) out[k] = valueFn(v);
  }
  return out;
}
const list = el => el ? [...el.children].map(c => c.textContent) : [];

function slice(xml, open, close, from = 0) {
  const a = xml.indexOf(open, from);
  if (a < 0) return null;
  const b = xml.indexOf(close, a);
  if (b < 0) return null;
  return xml.slice(a, b + close.length);
}
function sliceLocation(xml, type) {
  return slice(xml, `<GameLocation xsi:type="${type}">`, "</GameLocation>");
}
const wrap = s => parseXML(`<root ${XSI}>${s}</root>`).documentElement;

function readFarmer(F) {
  const friends = {}, status = {}, giftsWeek = {};
  for (const item of kids(kid(F, "friendshipData"), "item")) {
    const name = kid(item, "key")?.textContent;
    const fr = kid(kid(item, "value"), "Friendship");
    if (!name || !fr) continue;
    friends[name] = num(fr, "Points") || 0;
    const st = txt(fr, "Status");
    if (st && st !== "Friendly") status[name] = st;
    giftsWeek[name] = num(fr, "GiftsThisWeek") || 0;
  }
  const stats = kid(F, "stats");
  const kills = dict(kid(stats, "specificMonstersKilled"), v => Number(v.textContent) || 0);
  const mail = new Set([...list(kid(F, "mailReceived")), ...list(kid(F, "mailForTomorrow")), ...list(kid(F, "mailbox"))]);
  const xpVals = kids(kid(F, "experiencePoints"), "int").map(e => Number(e.textContent) || 0);
  const skills = {}, xp = {};
  XP_ORDER.forEach((s, i) => { skills[s] = num(F, s + "Level") || 0; xp[s] = xpVals[i] ?? null; });
  return {
    id: txt(F, "UniqueMultiplayerID"),
    name: txt(F, "name") || "Farmer",
    farm: txt(F, "farmName") || "",
    money: num(F, "money"),
    totalEarned: num(F, "totalMoneyEarned"),
    qiGems: num(F, "qiGems"),
    date: { year: num(F, "yearForSaveGame") || 1, season: SEASONS[num(F, "seasonForSaveGame") || 0], day: num(F, "dayOfMonthForSaveGame") || 1 },
    fishCaught: Object.keys(dict(kid(F, "fishCaught"))),
    shipped: Object.keys(dict(kid(F, "basicShipped"))),
    cooked: Object.keys(dict(kid(F, "recipesCooked"))),
    cookingKnown: Object.keys(dict(kid(F, "cookingRecipes"))),
    crafting: dict(kid(F, "craftingRecipes"), v => Number(v.textContent) || 0),
    friends, status, giftsWeek, kills, mail, skills, xp,
    spouse: txt(F, "spouse"),
    secretNotes: list(kid(F, "secretNotesSeen")),
    events: new Set(list(kid(F, "eventsSeen"))),
    daysPlayed: Number(dict(kid(stats, "Values"))["daysPlayed"]) || null,
  };
}

function readWorld(W) {
  return {
    date: { year: num(W, "year") || 1, season: (txt(W, "currentSeason") || "spring").toLowerCase(), day: num(W, "dayOfMonth") || 1 },
    walnutsFound: num(W, "goldenWalnutsFound"),
    walnutFlags: [...list(kid(W, "collectedNutTracker")), ...list(kid(W, "foundBuriedNuts"))],
    limitedNutDrops: dict(kid(W, "limitedNutDrops"), v => Number(v.textContent) || 0),
    waivers: num(W, "perfectionWaivers") || 0,
    coconut: txt(W, "goldenCoconutCracked") === "true",
    bundleData: dict(kid(W, "bundleData")),
    isRaining: txt(W, "isRaining") === "true",
    weatherTomorrow: txt(W, "weatherForTomorrow"),
    completedSpecialOrders: list(kid(W, "completedSpecialOrders")),
    gameVersion: txt(W, "gameVersion"),
  };
}

/* Bundle definitions live in the save (SVE remixes them). Format:
   key "Pantry/0" -> "Spring Crops/O 465 20/24 1 0 188 1 0 .../0/4//Spring Crops" */
const QUALITY = ["", "Silver", "Gold", "", "Iridium"];
function parseBundles(bundleData, ccBundles) {
  const out = [], progress = {};
  for (const [key, raw] of Object.entries(bundleData)) {
    const [room, index] = key.split("/");
    const f = raw.split("/");
    const tokens = (f[2] || "").trim().split(/\s+/).filter(Boolean);
    const items = [];
    for (let i = 0; i + 2 < tokens.length + 1; i += 3) {
      const id = tokens[i], qty = Number(tokens[i + 1]) || 1, q = Number(tokens[i + 2]) || 0;
      if (id == null) break;
      const name = id === "-1" ? `${fmt(qty)}g` : (DB.itemName[id] || DB.itemName["(O)" + id] || id);
      items.push({ key: String(i / 3), id: id === "-1" ? null : "(O)" + id, name: id === "-1" ? "Gold" : name, qty: id === "-1" ? 1 : qty, quality: QUALITY[q] || "" });
      if (id === "-1") items[items.length - 1].name = `${fmt(qty)}g`;
    }
    const required = Number(f[4]) || items.length;
    const bid = `${room}/${index}`;
    const display = f[6] || f[0];
    const rewardTok = (f[1] || "").split(" ");
    const reward = rewardTok.length >= 2 ? `${rewardTok[2] && rewardTok[2] !== "1" ? rewardTok[2] + "× " : ""}${DB.itemName[(rewardTok[0] === "BO" ? "(BC)" : "(O)") + rewardTok[1]] || DB.itemName[rewardTok[1]] || "Reward"}` : "";
    out.push({ id: bid, room: ROOM_NAME[room] || room, name: display, required, items, reward });
    const done = ccBundles[index];
    if (done) items.forEach((it, i) => { if (done[i]) progress[`${bid}:${it.key}`] = true; });
  }
  return { bundles: out, progress };
}
const ROOM_NAME = { "Pantry": "Pantry", "Crafts Room": "Crafts Room", "Fish Tank": "Fish Tank", "Boiler Room": "Boiler Room", "Vault": "Vault", "Bulletin Board": "Bulletin Board", "Abandoned Joja Mart": "Abandoned JojaMart" };

/* Map raw farmer data onto the tracker's category keys */
function toProgress(farmers, world, locs) {
  const best = (fn) => farmers.reduce((acc, f) => { const v = fn(f); return v; }, null);
  const union = fn => [...new Set(farmers.flatMap(fn))];
  const maxMap = fn => { const o = {}; farmers.forEach(f => Object.entries(fn(f)).forEach(([k, v]) => { o[k] = Math.max(o[k] ?? 0, v); })); return o; };

  const fishSet = new Set(union(f => f.fishCaught));
  const shipSet = new Set(union(f => f.shipped).map(id => "(O)" + id));
  const cookedSet = new Set(union(f => f.cooked));
  const knownCook = new Set(union(f => f.cookingKnown));
  const crafted = maxMap(f => f.crafting);
  const kills = maxMap(f => f.kills);
  const mail = new Set(farmers.flatMap(f => [...f.mail]));
  const skillMax = maxMap(f => f.skills);
  const host = farmers[0];

  const p = {
    version: 1,
    importedAt: Date.now(),
    farmer: host.name, farm: host.farm,
    farmers: farmers.map(f => f.name),
    date: world?.date || host.date,
    isRaining: world?.isRaining ?? false,
    weatherTomorrow: world?.weatherTomorrow ?? null,
    money: host.money, totalEarned: host.totalEarned, qiGems: host.qiGems, daysPlayed: host.daysPlayed,
    fish: DB.fish.filter(f => fishSet.has(f.id)).map(f => f.id),
    shipping: DB.shipping.filter(s => shipSet.has(s.id)).map(s => s.id),
    cooking: DB.cooking.filter(r => cookedSet.has(r.yieldId)).map(r => r.id),
    cookingKnown: DB.cooking.filter(r => knownCook.has(r.id)).map(r => r.id),
    crafting: DB.crafting.filter(r => (crafted[r.id] || 0) > 0).map(r => r.id),
    craftingKnown: DB.crafting.filter(r => r.id in crafted).map(r => r.id),
    friends: maxMap(f => f.friends),
    friendStatus: Object.assign({}, ...farmers.map(f => f.status)),
    giftsWeek: host.giftsWeek,
    monsters: Object.fromEntries(DB.monsters.map(m => [m.id, m.targets.reduce((a, t) => a + (kills[t] || 0), 0)])),
    stardrops: DB.stardrops.filter(s => mail.has(s.id)).map(s => s.id),
    skills: skillMax,
    xp: host.xp,
    perfectionWaivers: world?.waivers || 0,
    jojaComplete: ["jojaPantry", "jojaCraftsRoom", "jojaFishTank", "jojaBoilerRoom", "jojaVault"].every(f => mail.has(f)),
    applesHere: farmers.some(f => f.events.has("7775927")),
    partial: !world,
  };
  // recipes from other mods: the game counts every loaded recipe, so add the ones this save knows about
  const prettify = id => id.replace(/^.*[._]/, m => "").replace(/([a-z])([A-Z])/g, "$1 $2").trim() || id;
  const dbCook = new Set(DB.cooking.filter(r => !r.extra).map(r => r.id)), dbCraft = new Set(DB.crafting.filter(r => !r.extra).map(r => r.id));
  p.extraCooking = [...knownCook].filter(n => !dbCook.has(n)).map(n => ({ id: n, name: prettify(n.includes("_") ? n.split("_").pop() : n), cooked: cookedSet.has(n) || cookedSet.has(DB.itemIdByName?.[n.toLowerCase()]) }));
  p.extraCrafting = Object.keys(crafted).filter(n => !dbCraft.has(n)).map(n => ({ id: n, name: prettify(n.includes("_") ? n.split("_").pop() : n), crafted: crafted[n] > 0 }));
  p.cooking.push(...p.extraCooking.filter(r => r.cooked).map(r => r.id));
  p.cookingKnown.push(...p.extraCooking.map(r => r.id));
  p.crafting.push(...p.extraCrafting.filter(r => r.crafted).map(r => r.id));
  p.craftingKnown.push(...p.extraCrafting.map(r => r.id));
  if (world) {
    p.walnutCount = world.walnutsFound ?? 0;
    const flags = new Set([...world.walnutFlags, ...mail]);
    const drops = world.limitedNutDrops;
    const matched = DB.walnuts.filter(w => {
      if (!w.flags?.length) return false;
      if (w.store.includes("limitedNutDrops")) return w.flags.every(f => (drops[f] || 0) >= (w.flags.length > 1 ? 1 : w.count));
      if (w.flags.includes("GoldenCoconut")) return world.coconut;
      return w.flags.every(f => flags.has(f));
    }).map(w => w.id);
    p.walnuts = matched;
    p.walnutFlags = true;
  }
  if (locs) {
    p.buildings = locs.buildings;
    p.museum = locs.museum.map(id => "(O)" + id).filter(id => DB.museum.some(m => m.id === id));
    if (world && Object.keys(world.bundleData).length) {
      const { bundles, progress } = parseBundles(world.bundleData, locs.ccBundles);
      p.bundleDefs = bundles; p.bundles = progress;
    }
  }
  return p;
}

/* ---------- inventory: backpack, chests, fridges, Junimo chests ---------- */
const LOC_LABEL = { FarmHouse: "Farmhouse", IslandFarmHouse: "Island farmhouse", FarmCave: "Farm cave", IslandWest: "Island farm", Cellar: "Cellar", Shed: "Shed", Farm: "Farm" };
function itemQid(el) {
  const type = el.getAttribute("xsi:type");
  if (type !== "Object" && type !== "ColoredObject") return null;
  if (txt(el, "bigCraftable") === "true") return null;
  const id = txt(el, "itemId");
  return id ? "(O)" + id : null;
}
function addItems(inv, itemsEl, label) {
  for (const it of kids(itemsEl, "Item")) {
    const q = itemQid(it); if (!q) continue;
    const n = num(it, "stack") || 1;
    const e = inv[q] ??= { n: 0, at: {} };
    e.n += n;
    e.at[label] = (e.at[label] || 0) + n;
  }
}
function readInventory(xml, playerEl, farmhandEls) {
  const inv = {};
  addItems(inv, kid(playerEl, "items"), "Backpack");
  farmhandEls.forEach(f => addItems(inv, kid(f, "items"), `${txt(f, "name")}'s backpack`));
  // locations that contain chests or fridges; GameLocation elements never nest
  const re = /<GameLocation[ >]/g;
  let m, chestNo = {};
  while ((m = re.exec(xml))) {
    const end = xml.indexOf("</GameLocation>", m.index);
    if (end < 0) break;
    const chunk = xml.slice(m.index, end + 15);
    re.lastIndex = end;
    if (!chunk.includes('xsi:type="Chest"') && !chunk.includes("<fridge><isLostItem")) continue;
    let loc;
    try { loc = wrap(chunk).firstElementChild; } catch { continue; }
    const locName = txt(loc, "name") || loc.getAttribute("xsi:type") || "Somewhere";
    for (const el of loc.getElementsByTagName("*")) {
      const isChest = el.getAttribute("xsi:type") === "Chest" && txt(el, "playerChest") === "true";
      const isFridge = el.tagName === "fridge" && kid(el, "items");
      if (!isChest && !isFridge) continue;
      if (isChest && txt(el, "globalInventoryId") && kid(el, "globalInventoryId")?.textContent) continue; // Junimo chests: read once below
      // label: building interior type beats the outdoor map name
      let place = LOC_LABEL[locName] || locName.replace(/^Custom_/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (a.tagName !== "indoors") continue;
        const bt = txt(a.parentElement, "buildingType");
        const t = bt || a.getAttribute("xsi:type") || "Building";
        place = LOC_LABEL[t] || t.replace(/^.*StardewValleyExpandedCP_/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
        break;
      }
      const label = isFridge || txt(el, "fridge") === "true" ? `${place} fridge` : `${place} chest ${chestNo[place] = (chestNo[place] || 0) + 1}`;
      addItems(inv, kid(el, "items"), label);
    }
  }
  // Junimo chests share one global inventory
  const gi = slice(xml, "<globalInventories>", "</globalInventories>", xml.lastIndexOf("</locations>"));
  if (gi) { try { for (const item of kids(wrap(gi).firstElementChild, "item")) addItems(inv, kid(kid(item, "value"), "ArrayOfItem") || kid(item, "value"), "Junimo chest"); } catch {} }
  return inv;
}

function readLocations(xml) {
  const buildings = {};
  const re = /<buildingType>([^<]+)<\/buildingType>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (!BUILDING_TYPES.includes(m[1])) continue;
    // building finished? look for daysOfConstructionLeft inside the same <Building>
    const end = xml.indexOf("</Building>", m.index);
    const chunk = xml.slice(m.index, end > 0 ? end : m.index + 4000);
    const dc = /<daysOfConstructionLeft>(\d+)<\/daysOfConstructionLeft>/.exec(chunk);
    if (!dc || dc[1] === "0") buildings[m[1]] = true;
  }
  let museum = [];
  const mus = sliceLocation(xml, "LibraryMuseum");
  if (mus) museum = Object.values(dict(kid(wrap(mus).firstElementChild, "museumPieces")));
  let ccBundles = {};
  const cc = sliceLocation(xml, "CommunityCenter");
  if (cc) ccBundles = dict(kid(wrap(cc).firstElementChild, "bundles"), v => kids(v.firstElementChild, "boolean").map(b => b.textContent === "true"));
  return { buildings, museum, ccBundles };
}

function parseSave(xml) {
  xml = xml.replace(/^﻿/, "");
  const head = xml.slice(0, 400);
  if (/<Farmer[\s>]/.test(head) && !/<SaveGame[\s>]/.test(head)) {
    // SaveGameInfo: host player only
    const F = parseXML(xml).documentElement;
    const p = toProgress([readFarmer(F)], null, null);
    const inv = {}; addItems(inv, kid(F, "items"), "Backpack"); p.inventory = inv;
    return p;
  }
  if (!/<SaveGame[\s>]/.test(head)) throw new Error("not-a-save");
  let farmers, world, locs, inventory = null;
  try {
    const player = slice(xml, "<player>", "</player>");
    const fhs = slice(xml, "<farmhands>", "</farmhands>", xml.indexOf("</player>"));
    const tailStart = xml.lastIndexOf("</locations>");
    const tail = xml.slice(tailStart + "</locations>".length, xml.lastIndexOf("</SaveGame>"));
    const root = wrap(player + (fhs || "") + `<world>${tail}</world>`);
    const playerEl = kid(root, "player");
    const fhEls = kids(kid(root, "farmhands"), "Farmer").filter(fh => txt(fh, "name"));
    farmers = [readFarmer(playerEl), ...fhEls.map(readFarmer)];
    world = readWorld(kid(root, "world"));
    try { inventory = readInventory(xml, playerEl, fhEls); } catch (e) { console.warn("inventory read failed", e); }
  } catch (e) {
    console.warn("Slice parse failed, falling back to a full parse", e);
    const doc = parseXML(xml).documentElement;
    const fhEls = kids(kid(doc, "farmhands"), "Farmer").filter(f => txt(f, "name"));
    farmers = [readFarmer(kid(doc, "player")), ...fhEls.map(readFarmer)];
    world = readWorld(doc);
    try { inventory = readInventory(xml, kid(doc, "player"), fhEls); } catch {}
  }
  locs = readLocations(xml);
  const p = toProgress(farmers, world, locs);
  if (inventory) p.inventory = inventory;
  return p;
}

/* compare two extracts for the "since last time" panel */
function diffSaves(a, b) {
  if (!a || !b) return null;
  const added = (k, names) => (b[k] || []).filter(x => !(a[k] || []).includes(x)).map(names);
  const nm = list => id => (DB[list].find(x => x.id === id) || {}).name || id;
  const changes = [];
  const push = (cat, label, items) => { if (items.length) changes.push({ cat, label, items }); };
  push("fish", "New fish caught", added("fish", nm("fish")));
  push("shipping", "New items shipped", added("shipping", nm("shipping")));
  push("cooking", "New dishes cooked", added("cooking", nm("cooking")));
  push("crafting", "New items crafted", added("crafting", nm("crafting")));
  push("stardrops", "Stardrops found", added("stardrops", nm("stardrops")));
  const hearts = [];
  for (const v of DB.villagers) {
    const h0 = Math.floor((a.friends?.[v.id] || 0) / 250), h1 = Math.floor((b.friends?.[v.id] || 0) / 250);
    if (h1 > h0) hearts.push(`${v.name} ${h1}♥`);
  }
  push("friends", "Friendship up", hearts);
  const goals = DB.monsters.filter(m => (a.monsters?.[m.id] || 0) < m.count && (b.monsters?.[m.id] || 0) >= m.count).map(m => m.name);
  push("monsters", "Slayer goals reached", goals);
  if ((b.walnutCount || 0) > (a.walnutCount || 0)) push("walnuts", "Golden Walnuts", [`+${b.walnutCount - a.walnutCount}`]);
  const lv = XP_ORDER.filter(s => (b.skills?.[s] || 0) > (a.skills?.[s] || 0)).map(s => `${cap(s)} ${b.skills[s]}`);
  push("farmer", "Skill levels", lv);
  const bld = BUILDING_TYPES.filter(t => b.buildings?.[t] && !a.buildings?.[t]);
  push("obelisks", "Built", bld);
  return { from: a.date, to: b.date, at: Date.now(), changes };
}

async function loadSaveFile(file, opts = {}) {
  if (file.size > 80e6) { toast("That file is too large to be a Stardew save."); return; }
  if (!opts.auto) toast(`${icon("refresh")}Reading ${esc(file.name)}…`, null, 20000);
  await new Promise(r => setTimeout(r, 30)); // let the toast paint
  try {
    const text = await file.text();
    const t0 = performance.now();
    const extract = parseSave(text);
    extract.fileModified = file.lastModified;
    const ms = Math.round(performance.now() - t0);
    const before = perfection().score;
    const prev = state.save;
    const sameFarm = prev && prev.farm === extract.farm && prev.farmer === extract.farmer;
    state.prevSave = sameFarm ? prev : null;
    state.changes = sameFarm ? diffSaves(prev, extract) : null;
    state.save = extract;
    // seed the clock with the save's date the first time, or when the save moved forward
    if (!prev || !sameFarm || prev.date.season !== extract.date.season || prev.date.day !== extract.date.day) {
      state.season = extract.date.season; state.day = extract.date.day; state.year = extract.date.year;
      state.weather = extract.isRaining ? "rain" : "sun";
    }
    // a fresh save replaces manual overrides that now agree with it
    for (const cat of Object.keys(state.manual)) for (const k of Object.keys(state.manual[cat])) {
      const sv = saveVal(cat, k);
      if (sv === state.manual[cat][k]) delete state.manual[cat][k];
    }
    flush();
    applyModRecipes();
    fullRender();
    const after = perfection().score;
    const n = state.changes?.changes.reduce((a, c) => a + c.items.length, 0) || 0;
    if (opts.auto) {
      toast(`${icon("refresh")}Save updated · ${SEASON_LABEL[extract.date.season]} ${extract.date.day} · ${after.toFixed(1)}% perfection${n ? ` <span class="sub">· ${plural(n, "change")}, see Perfection</span>` : ""}`, null, 8000);
      return;
    }
    toast(`${icon("check")}Loaded ${esc(extract.farmer)}'s farm · ${after.toFixed(1)}% perfection${sameFarm && n ? ` <span class="sub">· ${plural(n, "change")} since last time</span>` : ""}${extract.partial ? ` <span class="sub">· SaveGameInfo only: walnuts and buildings need the full save</span>` : ""}`, null, 7000);
    if (route() !== "" && sameFarm && n) location.hash = "#/";
  } catch (e) {
    console.error(e);
    if (opts.auto) { console.warn("auto-sync parse failed, will retry", e); sync.lastModified = 0; return; }
    toast(e.message === "not-a-save" ? "That doesn't look like a Stardew Valley save. Pick the file named after your farm." : "Couldn't read that save file. Is it from Stardew Valley 1.6?", null, 7000);
  }
}
