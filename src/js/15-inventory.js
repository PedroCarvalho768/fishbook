/* Inventory awareness: what you own (backpack, chests, fridges, Junimo chests) and where. */

const hasInventory = () => !!state.save?.inventory;
const owned = qid => state.save?.inventory?.[qid]?.n || 0;

// ingredient ids below zero are categories ("any fish", "any egg"...)
function ownedFor(id) {
  if (!hasInventory()) return 0;
  if (!String(id).startsWith("-")) return owned(id);
  const cat = Number(id);
  let n = 0;
  for (const [q, e] of Object.entries(state.save.inventory)) if (DB.itemCat[q] === cat) n += e.n;
  return n;
}

function whereText(qid, max = 2) {
  const e = state.save?.inventory?.[qid];
  if (!e) return "";
  const places = Object.entries(e.at).sort((a, b) => b[1] - a[1]);
  return places.slice(0, max).map(([p, n]) => `${n} in ${p}`).join(", ") + (places.length > max ? ` +${places.length - max} more` : "");
}

/* staples you can always buy at Pierre's (or the Saloon kitchen shelf) */
const STAPLES = { "(O)246": "Wheat Flour", "(O)245": "Sugar", "(O)247": "Oil", "(O)419": "Vinegar", "(O)423": "Rice" };

/* can you make this recipe from what you own right now?
   buyable: everything missing is a Pierre's staple */
function canMake(r) {
  if (!hasInventory() || r.extra || !r.ingredients.length) return null;
  const missing = r.ingredients.filter(i => ownedFor(i.id) < i.qty);
  return { ok: missing.length === 0, missing, buyable: missing.length > 0 && missing.every(i => STAPLES[i.id]) };
}
const buyText = cm => `Buy ${cm.missing.map(i => i.name).join(" and ")} at Pierre's`;
const knows = (cat, r) => !state.save?.[cat + "Known"] || state.save[cat + "Known"].includes(r.id);
const makeableNow = (cat, r) => !isDone(cat, r.id) && knows(cat, r) && canMake(r)?.ok;

/* owned-item pill */
function ownedPill(qid, label = "You have") {
  const n = owned(qid);
  return n ? `<span class="tag own" title="${esc(whereText(qid, 6))}">${icon("box")}${label} ${fmt(n)}</span>` : "";
}

/* money projection toward the Gold Clock & obelisks */
function earningsPerDay() {
  const s = state.save;
  if (!s?.totalEarned || !s?.daysPlayed) return null;
  return s.totalEarned / s.daysPlayed;
}
