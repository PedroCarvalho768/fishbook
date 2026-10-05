/* Indexes over the embedded database. */
DB.fishById = Object.fromEntries(DB.fish.map(f => [f.id, f]));
DB.villagerByName = Object.fromEntries(DB.villagers.map(v => [v.name, v]));
DB.itemName = DB.itemName || {};
for (const [q, n] of Object.entries(DB.itemName)) { if (q.startsWith("(O)")) DB.itemName[q.slice(3)] ??= n; }
// recipes use their own sprite; ingredient chips look sprites up by item id
DB.itemIdByName = {};
for (const [q, n] of Object.entries(DB.itemName)) if (q.startsWith("(O)")) DB.itemIdByName[n.toLowerCase()] ??= q.slice(3);

/* recipes added by other mods, discovered in the loaded save */
function applyModRecipes() {
  for (const cat of ["cooking", "crafting"]) {
    DB[cat] = DB[cat].filter(r => !r.extra);
    for (const x of state.save?.["extra" + cap(cat)] || []) {
      DB[cat].push({ id: x.id, name: x.name, yieldId: x.id, extra: true, counts: true, ingredients: [], source: "Added by another mod you have installed", sourceGroup: "Other mods", qos: null, img: null });
    }
  }
}
const bundlesList = () => state.save?.bundleDefs?.length ? state.save.bundleDefs : DB.bundles;
