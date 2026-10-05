/* Perfection model: one entry per category, each computing done/total from the progress model. */

const HEARTS_PTS = 250;
function heartsOf(v) {
  const pts = val("friends", v.id) || 0;
  return Math.floor(pts / HEARTS_PTS);
}
// 1.6 (Utility.getMaxedFriendshipPercent): romanceable villagers count at 8 hearts, spouse included; everyone else at 10
const heartsNeeded = v => v.dateable ? 8 : 10;
const friendDone = v => heartsOf(v) >= heartsNeeded(v);

const monsterKills = m => val("monsters", m.id) || 0;
const monsterDone = m => monsterKills(m) >= m.count;

const SKILLS = ["farming", "fishing", "foraging", "mining", "combat"];
const skillLevel = s => clamp(val("skills", s) || 0, 0, 10);
// 1.6 farmer level: (sum of the five skill levels + luck) / 2, capped at 25 for Perfection
const farmerLevel = () => Math.floor((SKILLS.reduce((a, s) => a + skillLevel(s), 0) + (state.save?.skills?.luck || 0)) / 2);

function walnutsFound() {
  const fromChecks = DB.walnuts.reduce((a, w) => a + (isDone("walnuts", w.id) ? w.count : 0), 0);
  const fromSave = state.save?.walnutCount || 0;
  const manualCount = manualVal("walnutCount", "n");
  return clamp(Math.max(fromChecks, manualCount ?? fromSave), 0, 130);
}

function countsNow(x) {
  if (x.countsWhen === "joja") return !!state.save?.jojaComplete;
  if (x.countsWhen === "apples") return !!(state.save?.applesHere || state.save?.friends?.Apples != null);
  return x.counts !== false;
}
const counted = list => list.filter(countsNow);

const CATEGORIES = [
  { id: "shipping", label: "Ship items", long: "Produce & forage shipped", weight: 15, icon: "sprout", route: "shipping",
    calc: () => { const l = counted(DB.shipping); return { done: l.filter(x => isDone("shipping", x.id)).length, total: l.length }; } },
  { id: "fish", label: "Fish", long: "Fish caught", weight: 10, icon: "fish", route: "fish",
    calc: () => { const l = counted(DB.fish); return { done: l.filter(x => isDone("fish", x.id)).length, total: l.length }; } },
  { id: "cooking", label: "Cooking", long: "Dishes cooked", weight: 10, icon: "pot", route: "cooking",
    calc: () => { const l = counted(DB.cooking); return { done: l.filter(x => isDone("cooking", x.id)).length, total: l.length }; } },
  { id: "crafting", label: "Crafting", long: "Items crafted", weight: 10, icon: "hammer", route: "crafting",
    calc: () => { const l = counted(DB.crafting); return { done: l.filter(x => isDone("crafting", x.id)).length, total: l.length }; } },
  { id: "friends", label: "Friends", long: "Great friends", weight: 11, icon: "heart", route: "friends",
    calc: () => { const l = counted(DB.villagers); return { done: l.filter(friendDone).length, total: l.length }; } },
  { id: "monsters", label: "Monsters", long: "Monster Slayer Hero", weight: 10, icon: "sword", route: "monsters",
    calc: () => ({ done: DB.monsters.filter(monsterDone).length, total: DB.monsters.length }) },
  { id: "stardrops", label: "Stardrops", long: "Stardrops found", weight: 10, icon: "star", route: "stardrops",
    calc: () => ({ done: DB.stardrops.filter(s => isDone("stardrops", s.id)).length, total: DB.stardrops.length }) },
  { id: "walnuts", label: "Golden Walnuts", long: "Golden Walnuts found", weight: 5, icon: "nut", route: "walnuts",
    calc: () => ({ done: walnutsFound(), total: 130 }) },
  { id: "farmer", label: "Farmer level", long: "Farmer level", weight: 5, icon: "trophy", route: "farm",
    calc: () => ({ done: Math.min(25, farmerLevel()), total: 25 }) },
  { id: "obelisks", label: "Obelisks", long: "Obelisks on the farm", weight: 4, icon: "farm", route: "farm",
    calc: () => { const l = DB.buildings.filter(b => b.kind === "obelisk"); return { done: l.filter(b => isDone("buildings", b.id)).length, total: l.length }; } },
  { id: "clock", label: "Gold Clock", long: "Gold Clock", weight: 10, icon: "clock", route: "farm",
    calc: () => ({ done: isDone("buildings", "Gold Clock") ? 1 : 0, total: 1 }) },
];

function perfection() {
  let score = 0;
  const cats = CATEGORIES.map(c => {
    const r = c.calc();
    const frac = r.total ? Math.min(1, r.done / r.total) : 0;
    score += frac * c.weight;
    return { ...c, ...r, frac, points: frac * c.weight };
  });
  const waivers = state.save?.perfectionWaivers || 0;
  return { score: Math.min(100, score + waivers), cats, waivers };
}

/* nav groups */
const NAV = [
  { title: null, items: [
    { route: "", label: "Perfection", icon: "home" },
    { route: "today", label: "Today", icon: "calendar" },
  ] },
  { title: "Perfection", items: [
    { route: "shipping", label: "Shipping", icon: "sprout", cat: "shipping" },
    { route: "fish", label: "Fish", icon: "fish", cat: "fish" },
    { route: "cooking", label: "Cooking", icon: "pot", cat: "cooking" },
    { route: "crafting", label: "Crafting", icon: "hammer", cat: "crafting" },
    { route: "friends", label: "Friends", icon: "heart", cat: "friends" },
    { route: "monsters", label: "Monsters", icon: "sword", cat: "monsters" },
    { route: "stardrops", label: "Stardrops", icon: "star", cat: "stardrops" },
    { route: "walnuts", label: "Golden Walnuts", icon: "nut", cat: "walnuts" },
    { route: "farm", label: "Farm & skills", icon: "farm", cats: ["farmer", "obelisks", "clock"] },
  ] },
  { title: "Beyond perfection", items: [
    { route: "bundles", label: "Bundles", icon: "box", beyond: "bundles" },
    { route: "museum", label: "Museum", icon: "museum", beyond: "museum" },
  ] },
];
