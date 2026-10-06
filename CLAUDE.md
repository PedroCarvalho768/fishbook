# Almanac

Single-page Perfection tracker for Stardew Valley 1.6 + SVE 1.15. `src/` is the source; `almanac.html` and `docs/` are build output.

## Pipeline

`data/research/` (local, gitignored) → `python tools/build_db.py` → `data/db.json` (committed) → `python build.py` → `almanac.html` + `docs/`.

- Edit `src/` or the research inputs, then rebuild; generated files get overwritten.
- `data/research/` holds a copy of the owner's save and raw game/mod data dumps. It stays local; `.gitignore` covers it.
- Prefix Python with `PYTHONIOENCODING=utf-8` on this Windows machine; item names contain non-ASCII text.
- Sprites download once into `data/img/` (gitignored). The SVE fandom CDN accepts only curl with a browser User-Agent and Referer, which `build.py` already does.

## Data authority

When sources disagree, the first applicable source wins:

1. SVE mod files (`Mods/Stardew Valley Expanded/[CP] .../code/`): SVE items, fish, recipes, NPC flags (`PerfectionScore`, `CanBeRomanced`).
2. Game `Data/*` (dump in `data/research/vanilla/`): IDs, prices, what counts for Perfection, minimum fishing level.
3. Wiki: seasons and times (the game decides these in per-location tables), unlock sources, walnut hints, schedules.
4. `data/fish.json`: the owner's curated checklist, used for the 23 SVE fish it lists.

Any total changed on purpose needs its pin updated in `tests/test_db.py`.

## Save format

- `fishCaught` keys are qualified (`(O)128`).
- `basicShipped`, `recipesCooked` (output item IDs) and museum pieces use unqualified IDs.
- `cookingRecipes` / `craftingRecipes` use recipe keys, which can differ from display names ("Cheese Cauli.", "Transmute (Fe)"). Match on `r.id`.
- `tools/extract_save.py` is the independent reference parser the browser parser is tested against.

IMPORTANT: read saves and mod files only. Copy a save before parsing it; the game may be writing it.

## Front end

- SVE story content renders through `canSee()` so spoilers stay hidden by default.
- Attach events with `addEventListener`. `build.py` puts a hash-based CSP on the two inline scripts, so inline handlers won't run.
- Colors, radii and shadows come from tokens in `src/css/base.css` (OKLCH; Rikode identity bent warm: gold `--accent`, pink `--brand` for the R mark and dither only). Text holds ≥ 4.5:1 contrast and controls ≥ 3:1; pink as text uses `--accent-ink`, not `--accent`.
- `src/css/rikode.css` loads last and carries the Rikode frame (Jacquard titles: lowercase, ≥ 32px) plus sprite sizing.
- `icon(id)` draws the in-game sprite `UI_SPRITES` in `build.py` embeds as `ui:<id>`, else the SVG line icon. Item sprites the wiki lacks live in `src/sprites/` (`local:` URLs in `tools/build_db.py`).
- PWA icons and `og.png` come from `node tools/brand_assets.mjs`.
- Views receive a fresh container on every render (`renderView`), so view listeners can attach to it freely.

## Verify

`npm test`: data invariants plus browser end-to-end tests (parser vs Python oracle, every page, live sync, offline). Needs Chrome at the default path or `CHROME_PATH`; finds a save in `data/research/save/tmp/` or `%APPDATA%/StardewValley/Saves`.

## Deploy

Live at https://sdve.rikode.com.br (Vercel project `fishbook`, static `docs/`, no build step). After `python build.py` and `npm test`: `vercel deploy --prod --cwd docs`. Deploys and `git push` wait for the owner's go-ahead.
