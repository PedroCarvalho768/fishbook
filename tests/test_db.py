"""Invariants for data/db.json. These pin the Perfection totals researched from the game and SVE files,
so a data change that silently drops or duplicates items fails loudly.

Run: python -m unittest discover -s tests
"""
import json
import pathlib
import unittest

DB = json.loads((pathlib.Path(__file__).resolve().parent.parent / "data" / "db.json").read_text(encoding="utf-8"))
SEASONS = {"spring", "summer", "fall", "winter"}


def counting(items):
    return [x for x in items if x.get("counts", True) and not x.get("countsWhen")]


class Totals(unittest.TestCase):
    """Totals the 1.6.15 game computes with SVE 1.15.11 loaded (vanilla + SVE additions)."""

    def test_fish(self):
        self.assertEqual(len(counting(DB["fish"])), 72 + 43)

    def test_shipping(self):
        self.assertEqual(len(counting(DB["shipping"])), 154 + 50)

    def test_cooking(self):
        self.assertEqual(len(counting(DB["cooking"])), 81 + 26)

    def test_crafting(self):
        self.assertEqual(len(counting(DB["crafting"])), 149 + 12)  # Wedding Ring excluded

    def test_villagers(self):
        # 34 vanilla + 13 SVE always count; Apples (SVE) and Morris only count under conditions
        self.assertEqual(len(counting(DB["villagers"])), 34 + 13)
        conditional = {v["id"]: v["countsWhen"] for v in DB["villagers"] if v.get("countsWhen")}
        self.assertEqual(conditional, {"Apples": "apples", "MorrisTod": "joja"})

    def test_fixed_categories(self):
        self.assertEqual(len(DB["monsters"]), 12)
        self.assertEqual(len(DB["stardrops"]), 7)
        self.assertEqual(sum(w["count"] for w in DB["walnuts"]), 130)
        self.assertEqual(sorted(b["name"] for b in DB["buildings"]),
                         ["Desert Obelisk", "Earth Obelisk", "Gold Clock", "Island Obelisk", "Water Obelisk"])


class Integrity(unittest.TestCase):
    def test_unique_ids(self):
        for key in ("fish", "shipping", "cooking", "crafting", "villagers", "monsters", "stardrops", "walnuts", "museum"):
            ids = [x["id"] for x in DB[key]]
            self.assertEqual(len(ids), len(set(ids)), f"duplicate ids in {key}")

    def test_item_ids_are_qualified(self):
        for key in ("fish", "shipping", "museum"):
            for x in DB[key]:
                self.assertTrue(x["id"].startswith("(O)"), f"{key}: {x['id']}")

    def test_ingredients_resolve(self):
        for key in ("cooking", "crafting"):
            for r in DB[key]:
                self.assertTrue(r["ingredients"], f"{r['id']} has no ingredients")
                for i in r["ingredients"]:
                    self.assertTrue(i["name"] and not i["name"].startswith("Category"), f"{r['id']}: unresolved {i}")
                    self.assertTrue(i["id"].startswith(("-", "(BC)")) or i["id"] in DB["itemName"], f"{r['id']}: unknown item {i['id']}")

    def test_seasons_valid(self):
        for key in ("fish", "shipping"):
            for x in DB[key]:
                self.assertTrue(set(x.get("seasons") or []) <= SEASONS, x["id"])

    def test_fish_time_windows(self):
        for f in DB["fish"]:
            for a, b in f["time"]:
                self.assertTrue(6 <= a < b <= 26, f"{f['name']}: {a}-{b}")

    def test_villager_birthdays(self):
        for v in DB["villagers"]:
            if v["birthday"] is None:
                continue
            self.assertIn(v["birthday"]["season"], SEASONS, v["id"])
            self.assertTrue(1 <= v["birthday"]["day"] <= 28, v["id"])

    def test_sve_romance(self):
        dateable = {v["id"] for v in DB["villagers"] if v["dateable"]}
        # SVE makes the Wizard romanceable (Magnus.json), so he counts at 8 hearts
        self.assertIn("Wizard", dateable)
        for sve in ("Claire", "Lance", "Olivia", "Scarlett", "Sophia", "Victor"):
            self.assertIn(sve, dateable)

    def test_monster_targets(self):
        targets = {t for m in DB["monsters"] for t in m["targets"]}
        for name in ("Green Slime", "Serpent", "Royal Serpent", "Shadow Sniper", "Iridium Crab", "Magma Sparker"):
            self.assertIn(name, targets)

    def test_spoiler_locations_flagged(self):
        for f in DB["fish"]:
            for loc in f["locations"]:
                if loc["place"] in ("Crimson Badlands", "Highlands Cavern", "Fable Reef", "Sprite Spring", "Junimo Woods"):
                    self.assertTrue(loc["spoiler"], f"{f['name']} at {loc['place']}")


if __name__ == "__main__":
    unittest.main()
