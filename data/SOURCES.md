# Data sources

Every total the tracker shows traces to a file and a test. Research inputs live in `data/research/` (local only); `tools/build_db.py` merges them into `db.json`.

| Total | Value | Source | Pinned by |
|---|---|---|---|
| Fish that count | 115 = 72 vanilla + 43 SVE | Vanilla: `Data/Objects` type Fish without `ExcludeFromFishingCollection` (1.6.15 dump). SVE: mod `code/Items/Objects.json`; Razor Trout is excluded by the mod. | `tests/test_db.py::Totals.test_fish` |
| Items to ship | 204 = 154 + 50 | Game rule `isPotentialBasicShipped` applied to `Data/Objects`; SVE objects with `countsForShipping`. | `test_shipping` |
| Cooking recipes | 107 = 81 + 26 | `Data/CookingRecipes`; SVE `code/Items/CookingRecipes.json`. Other installed mods add more at load time (read from the save). | `test_cooking` |
| Crafting recipes | 161 = 149 + 12 | `Data/CraftingRecipes` minus Wedding Ring; SVE `CraftingRecipes.json`. | `test_crafting` |
| Villagers | 47 + Apples + Morris | `Data/Characters` with `PerfectionScore` and `CanSocialize`. SVE: Apples exists only after event 7775927; Morris counts only after the JojaMart route (`IsJojaMartComplete`). Wizard is romanceable in SVE (`Magnus.json`), so he needs 8 hearts. | `test_villagers`, `test_sve_romance` |
| Slayer goals, stardrops, walnuts, buildings | 12, 7, 130, 5 | `Data/MonsterSlayerQuests`; 7 mail flags from the game code; wiki walnut list (66 entries summing to 130); Wizard's Tower shop. | `test_fixed_categories` |
| Perfection weights | 15/10/10/10/11/10/10/5/5/4/10 | `Utility.percentGameComplete` (decompiled 1.6). | `tests/e2e.mjs` recomputation |

## Field-level rules

- **Seasons and times** come from the wiki. The game decides them in per-location tables, so `Data/Fish` seasons are misleading (Catfish in Winter only with a Rain Totem; Night Market fish only during the market).
- **Minimum fishing level** comes from `Data/Fish`: Stonefish 3, Ice Pip 5, Lava Eel 7, Glacierfish and Glacierfish Jr. 7 (`test_min_fishing_levels`).
- **The 23 SVE fish** in the owner's checklist keep its values; the other 20 come from the mod's fish and location data.
- **Monster kills** count by monster name, exactly as the game does. SVE's monsters spawn under standard names, so they count when the name matches a goal target and not otherwise.
- **Prices** are base sell prices in gold (g), before quality and professions.
