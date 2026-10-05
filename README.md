# Fishbook: Stardew Valley Expanded perfection tracker

A single-page tracker for Perfection in Stardew Valley 1.6 with Stardew Valley Expanded 1.15.

- **Load your save** and every Perfection category fills in: shipping, fish, cooking, crafting, friends, monsters, stardrops, Golden Walnuts, farmer level, obelisks and the Gold Clock, plus Community Center bundles and the museum.
- **Live sync** (Chrome/Edge): pick the save once and the tracker reloads every time you sleep in-game.
- **Knows your chests**: what you can ship, cook or craft right now, and which loved gifts you already own.
- **Today**: fish biting now, birthdays, crops to plant before the season ends, Queen of Sauce, festivals.
- Spoiler-safe for SVE's story areas and characters. Works offline; your save never leaves the browser.

Use it online (GitHub Pages, installable as an app) or download `fishbook.html` and open it directly.

## Development

```
npm install            # playwright-core for the browser tests (uses your installed Chrome)
npm run build          # python tools/build_db.py && python build.py
npm test               # data invariants + end-to-end tests against your own save
```

`data/db.json` is the merged database. Rebuilding it needs the research inputs in `data/research/`
(game and SVE data extracted from a local install), which are not committed. `python build.py` alone
rebuilds the app from `src/` and `data/db.json`, writing `fishbook.html` and the hosted site in `docs/`.

Game data © ConcernedApe; SVE © FlashShifter. Guidance text from the Stardew Valley and SVE wikis.
