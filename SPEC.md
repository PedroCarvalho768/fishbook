# Fishbook spec

## Premise

A Stardew Valley Expanded player chasing Perfection keeps the game on one screen and needs to know, without opening the wiki, how far they are and what to do in the current in-game day. Fishbook reads their save in the browser, fills in all eleven Perfection categories, and turns what's missing into today's actions. The owner plays SVE 1.15.11 on Stardew Valley 1.6.15 with about 60 other mods.

## Locked decisions

| Decision | Why this and not the alternative |
|---|---|
| One static HTML file, no server | Works offline from disk, nothing to host or secure, and the save never leaves the machine. A backend would add accounts and privacy obligations for no gain. |
| Read the save file instead of manual entry first | The save already holds every Perfection input. Manual ticks stay as an override for anything the save can't express. |
| Game and mod files as the data source, wiki second | The mod files are what the game actually loads; the SVE wiki was out of date on prices and fish. See `data/SOURCES.md`. |
| Count recipes from other installed mods | The game counts every loaded recipe toward Perfection, so the tracker has to as well to match the in-game number. |
| Parse only the needed slices of the 14 MB save | 10 ms instead of 0.6 s, with a full parse as fallback. |
| Live sync through the File System Access API | Pick the save once; the page reloads it after each in-game day. Chrome and Edge only; other browsers load by hand. |
| Spoilers hidden by default | SVE's story areas and characters are a large part of the mod's appeal. |
| Hash-based CSP, no inline handlers | The page renders text from save files and mods; a strict policy limits the damage of any escaping mistake. |

## Open decisions

- Publishing: the owner chose not to publish yet. `docs/` is ready for GitHub Pages; the `og:image` needs an absolute URL once a domain exists.
- Portuguese (pt-BR) interface: not started. Item names would come from the game's own pt-BR strings.
- Multiplayer: categories use the best farmer per category, matching the game. A per-farmer view isn't built; this save is single-player, so it's untested on real data.

## Out of scope

- Editing or writing saves.
- Accounts, cloud sync, or any upload of save data.
- Mods other than SVE beyond counting their recipes (their items and fish aren't in the database).

## Done criteria

Each one is an automated check in `npm test`:

1. **Given** the owner's save, **when** it loads, **then** fish, shipping, cooking, crafting, friendship, monster kills, stardrops, walnuts, skills, museum and buildings equal the independent Python parser's output (`tests/e2e.mjs`).
2. **Given** the same save, **then** the shown Perfection percentage is within 0.06 of a separate recomputation from the game's weights.
3. **Given** the save file changes on disk, **when** live sync is on, **then** the page shows the new in-game date without a click.
4. **Given** no network, **when** the hosted build opens, **then** it loads from the offline cache.
5. **Given** the database, **then** totals match the game with SVE loaded: 115 fish, 204 shipping, 107 cooking, 161 crafting, 47 villagers plus 2 conditional (`tests/test_db.py`).

## Risks

- **SVE or game updates** change item IDs or totals. The pinned totals in `tests/test_db.py` fail first; re-run the research extractors, then `tools/build_db.py`.
- **Untested multiplayer path**: farmhand parsing is written against the 1.6 format but only verified on a single-player save.
- **In-game confirmation pending**: the score matches our own recomputation; the owner hasn't yet compared it with Qi's Walnut Room.
