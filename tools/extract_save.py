#!/usr/bin/env python3
"""Reference extractor for Stardew Valley 1.6 (+ SVE) save files.

Reads a save XML (the big `<SaveGame>` file, NOT SaveGameInfo) and dumps everything a
Perfection tracker needs to JSON. Pure stdlib (xml.etree). Never writes to the input.

Usage:
    python extract_save.py [SAVE_FILE] [OUT_JSON]

Usage: python extract_save.py <save file> <output.json>  (independent reference parser used by tests/e2e.mjs)
Always run it on a COPY of the save, never on the file inside %APPDATA%.

Notes on the XML (see SAVE_FORMAT.md for details):
  * Root is <SaveGame xmlns:xsi=... xmlns:xsd=...>; element names are NOT namespaced,
    only attributes like xsi:type / xsi:nil are.
  * File starts with a UTF-8 BOM -> open with encoding 'utf-8-sig' (ET.parse handles it).
  * Dictionaries are serialized as <item><key><T>..</T></key><value><U>..</U></value></item>.
  * Main player = /SaveGame/player. Farmhands (1.6) = /SaveGame/farmhands/Farmer; cabins only
    hold <farmhandReference>UniqueMultiplayerID</farmhandReference>. Pre-1.6 saves stored the
    whole <farmhand> Farmer inside the Cabin's <indoors>; both are handled here.
"""
import json
import os
import sys
import time
import xml.etree.ElementTree as ET

XSI = "{http://www.w3.org/2001/XMLSchema-instance}"
XSI_TYPE = XSI + "type"
XSI_NIL = XSI + "nil"
MAX_LIST = 2000

STARDROP_FLAGS = {
    "CF_Fair": "Stardew Valley Fair (2000 star tokens)",
    "CF_Fish": "Willy's mail after catching every fish (Master Angler)",
    "CF_Mines": "Mines floor 100 chest",
    "CF_Sewer": "Krobus shop (Sewers)",
    "CF_Spouse": "Spouse/roommate at max hearts",
    "CF_Statue": "Old Master Cannoli (Secret Woods, Sweet Gem Berry)",
    "museumComplete": "Gunther reward for donating every museum item (95 vanilla)",
}
PERFECTION_BUILDINGS = ["Earth Obelisk", "Water Obelisk", "Desert Obelisk", "Island Obelisk", "Gold Clock"]


# ----------------------------------------------------------------------------- helpers
def text(el, path=None, default=None):
    if el is None:
        return default
    if path is not None:
        el = el.find(path)
        if el is None:
            return default
    if el.get(XSI_NIL) == "true":
        return None
    return el.text if el.text is not None else default


def num(s):
    if s is None:
        return None
    try:
        return int(s)
    except ValueError:
        try:
            return float(s)
        except ValueError:
            return s


def boolv(s):
    return None if s is None else s.strip().lower() == "true"


def scalar_list(el):
    """<x><int>1</int><int>2</int></x> or <x><string>a</string>..</x> -> list."""
    if el is None:
        return []
    out = []
    for c in el:
        v = c.text
        if c.tag in ("int", "long", "unsignedInt", "float", "double"):
            v = num(v)
        elif c.tag == "boolean":
            v = boolv(v)
        out.append(v)
    return out


def value_of(v):
    """Convert the single child of a <value> (or <key>) into a Python value."""
    if v is None:
        return None
    children = list(v)
    if not children:
        return v.text
    c = children[0]
    tag = c.tag
    if tag in ("int", "long", "unsignedInt", "float", "double"):
        return num(c.text)
    if tag == "boolean":
        return boolv(c.text)
    if tag == "string":
        return c.text
    if tag.startswith("ArrayOf"):
        return scalar_list(c)
    if tag == "Vector2" or tag == "Point":
        return f"{num(text(c, 'X'))},{num(text(c, 'Y'))}"
    if tag == "dictionary":
        return sdict(c)
    return elem_to_obj(c)


def sdict(el):
    """SerializableDictionary -> dict."""
    out = {}
    if el is None:
        return out
    for item in el.findall("item"):
        k = value_of(item.find("key"))
        out[str(k)] = value_of(item.find("value"))
    return out


def elem_to_obj(el):
    """Generic small-object -> dict (for Friendship, SpecialOrder bits, etc.)."""
    if len(el) == 0:
        return el.text
    out = {}
    if el.get(XSI_TYPE):
        out["@type"] = el.get(XSI_TYPE)
    for c in el:
        val = elem_to_obj(c)
        if c.tag in out:
            if not isinstance(out[c.tag], list):
                out[c.tag] = [out[c.tag]]
            out[c.tag].append(val)
        else:
            out[c.tag] = val
    return out


def trunc(lst):
    if isinstance(lst, list) and len(lst) > MAX_LIST:
        return {"truncated": True, "total": len(lst), "first": lst[:MAX_LIST]}
    return lst


# ----------------------------------------------------------------------------- farmer
def extract_farmer(f):
    stats = f.find("stats")
    stat_values = sdict(stats.find("Values")) if stats is not None else {}
    monsters = sdict(stats.find("specificMonstersKilled")) if stats is not None else {}

    fish = {}
    for k, v in sdict(f.find("fishCaught")).items():
        v = v or []
        fish[k] = {"count": v[0] if len(v) > 0 else None, "maxSize": v[1] if len(v) > 1 else None}

    friendship = {}
    for name, fr in sdict(f.find("friendshipData")).items():
        fr = fr or {}
        friendship[name] = {
            "points": num(fr.get("Points")),
            "hearts": (num(fr.get("Points")) or 0) // 250,
            "status": fr.get("Status"),
            "giftsThisWeek": num(fr.get("GiftsThisWeek")),
            "giftsToday": num(fr.get("GiftsToday")),
            "talkedToToday": boolv(fr.get("TalkedToToday")),
            "proposalRejected": boolv(fr.get("ProposalRejected")),
            "roommateMarriage": boolv(fr.get("RoommateMarriage")),
            "lastGiftDate": fr.get("LastGiftDate"),
            "weddingDate": fr.get("WeddingDate"),
        }

    mail = scalar_list(f.find("mailReceived"))
    mailset = set(mail)
    crafting = sdict(f.find("craftingRecipes"))
    cooking = sdict(f.find("cookingRecipes"))
    cooked = sdict(f.find("recipesCooked"))
    shipped = sdict(f.find("basicShipped"))
    max_stamina = num(text(f, "maxStamina"))

    levels = {k: num(text(f, k + "Level")) for k in ("farming", "mining", "combat", "foraging", "fishing", "luck")}
    xp = scalar_list(f.find("experiencePoints"))

    return {
        "name": text(f, "name"),
        "farmName": text(f, "farmName"),
        "favoriteThing": text(f, "favoriteThing"),
        "uniqueMultiplayerID": text(f, "UniqueMultiplayerID"),
        "gameVersion": text(f, "gameVersion"),
        "saveDate": {
            "year": num(text(f, "yearForSaveGame")),
            "seasonIndex": num(text(f, "seasonForSaveGame")),
            "day": num(text(f, "dayOfMonthForSaveGame")),
        },
        "millisecondsPlayed": num(text(f, "millisecondsPlayed")),
        "money": num(text(f, "money")),
        "totalMoneyEarned": num(text(f, "totalMoneyEarned")),
        "qiGems": num(text(f, "qiGems")),
        "clubCoins": num(text(f, "clubCoins")),
        "maxStamina": max_stamina,
        "maxHealth": num(text(f, "maxHealth")),
        "stardropsEatenDerived": None if max_stamina is None else (max_stamina - 270) // 34,
        "houseUpgradeLevel": num(text(f, "houseUpgradeLevel")),
        "deepestMineLevel": num(text(f, "deepestMineLevel")),
        "spouse": text(f, "spouse"),
        "levels": levels,
        "farmerLevel": sum(v or 0 for v in levels.values()) // 2,  # Farmer.Level; Perfection uses min(Level,25)/25
        "experiencePoints": dict(zip(["farming", "fishing", "foraging", "mining", "combat", "luck"], xp)),
        "professions": scalar_list(f.find("professions")),
        "mastery": {k: v for k, v in stat_values.items() if k.lower().startswith("mastery")},
        "fishCaught": fish,
        "basicShipped": shipped,
        "recipesCooked": cooked,
        "cookingRecipesKnown": cooking,
        "craftingRecipesKnown": crafting,
        "craftingRecipesCraftedAtLeastOnce": sorted(k for k, v in crafting.items() if (v or 0) > 0),
        "friendshipData": friendship,
        "giftedItems": sdict(f.find("giftedItems")),
        "mailReceived": trunc(mail),
        "stardropFlags": {k: (k in mailset) for k in STARDROP_FLAGS},
        "eventsSeen": trunc(scalar_list(f.find("eventsSeen"))),
        "secretNotesSeen": scalar_list(f.find("secretNotesSeen")),
        "achievements": scalar_list(f.find("achievements")),
        "specialItems": scalar_list(f.find("specialItems")),
        "archaeologyFound": {k: {"found": v[0], "donatedOrSeen": v[1] if len(v) > 1 else None}
                             for k, v in sdict(f.find("archaeologyFound")).items()},
        "mineralsFound": sdict(f.find("mineralsFound")),
        "tailoredItems": sdict(f.find("tailoredItems")),
        "triggerActionsRun": scalar_list(f.find("triggerActionsRun")),
        "stats": stat_values,
        "specificMonstersKilled": monsters,
        "modData": sdict(f.find("modData")),
        "counts": {
            "fishCaughtSpecies": len(fish),
            "basicShippedDistinct": len(shipped),
            "recipesCookedDistinct": len(cooked),
            "cookingRecipesKnown": len(cooking),
            "craftingRecipesKnown": len(crafting),
            "craftingRecipesCrafted": sum(1 for v in crafting.values() if (v or 0) > 0),
            "friends": len(friendship),
            "friends8HeartsPlus": sum(1 for v in friendship.values() if (v["points"] or 0) >= 2000),
            "mailReceived": len(mail),
            "eventsSeen": len(scalar_list(f.find("eventsSeen"))),
            "stardropFlagsFound": sum(1 for k in STARDROP_FLAGS if k in mailset),
            "monsterKillsTotal": sum(v or 0 for v in monsters.values()),
        },
    }


# ----------------------------------------------------------------------------- world
def parse_bundle_data(bd):
    out = {}
    for key, raw in bd.items():
        area, idx = key.rsplit("/", 1)
        parts = (raw or "").split("/")
        items = parts[2].split() if len(parts) > 2 else []
        triples = [{"id": items[i], "qty": num(items[i + 1]), "quality": num(items[i + 2])}
                   for i in range(0, len(items) - 2, 3)]
        out[key] = {
            "area": area,
            "index": int(idx),
            "name": parts[0] if parts else None,
            "reward": parts[1] if len(parts) > 1 else None,
            "items": triples,
            "color": parts[3] if len(parts) > 3 else None,
            "numRequired": num(parts[4]) if len(parts) > 4 and parts[4] else len(triples),
            "displayName": parts[6] if len(parts) > 6 else None,
            "raw": raw,
        }
    return out


def extract_buildings(loc):
    out = []
    bl = loc.find("buildings")
    if bl is None:
        return out
    for b in bl:
        ind = b.find("indoors")
        out.append({
            "buildingType": text(b, "buildingType"),
            "xsiType": b.get(XSI_TYPE),
            "tile": [num(text(b, "tileX")), num(text(b, "tileY"))],
            "daysOfConstructionLeft": num(text(b, "daysOfConstructionLeft")),
            "daysUntilUpgrade": num(text(b, "daysUntilUpgrade")),
            "indoorsType": ind.get(XSI_TYPE) if ind is not None else None,
            "indoorsName": text(ind, "uniqueName") or text(ind, "name") if ind is not None else None,
            "farmhandReference": text(ind, "farmhandReference") if ind is not None else None,
        })
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    if len(sys.argv) < 2:
        sys.exit("usage: extract_save.py <save file> [output.json]")
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "sample-extract.json")

    t0 = time.perf_counter()
    root = ET.parse(src).getroot()
    t_parse = time.perf_counter() - t0

    locations = root.find("locations")
    locs = {text(l, "name"): l for l in locations}

    # --- farmers --------------------------------------------------------------
    farmers = [dict(role="host", **extract_farmer(root.find("player")))]
    fh_container = root.find("farmhands")
    for f in (fh_container if fh_container is not None else []):
        farmers.append(dict(role="farmhand(SaveGame/farmhands)", **extract_farmer(f)))
    cabins = []
    for loc in locations:
        for b in (loc.find("buildings") if loc.find("buildings") is not None else []):
            ind = b.find("indoors")
            if ind is None or ind.get(XSI_TYPE) != "Cabin":
                continue
            cabins.append({"location": text(loc, "name"), "tile": [text(b, "tileX"), text(b, "tileY")],
                           "farmhandReference": text(ind, "farmhandReference")})
            legacy = ind.find("farmhand")  # pre-1.6 layout
            if legacy is not None and text(legacy, "name"):
                farmers.append(dict(role="farmhand(legacy Cabin/indoors/farmhand)", **extract_farmer(legacy)))

    # --- buildings ------------------------------------------------------------
    all_buildings = {}
    for name, loc in locs.items():
        bs = extract_buildings(loc)
        if bs:
            all_buildings[name] = bs
    built_types = [b["buildingType"] for bs in all_buildings.values() for b in bs
                   if (b["daysOfConstructionLeft"] or 0) <= 0]

    # --- community center ---------------------------------------------------------
    cc = locs.get("CommunityCenter")
    cc_bundles = {}
    if cc is not None:
        for item in cc.find("bundles").findall("item"):
            cc_bundles[text(item, "key/int")] = scalar_list(item.find("value/ArrayOfBoolean"))
    bundle_data = parse_bundle_data(sdict(root.find("bundleData")))
    bundles_state = {}
    for key, b in bundle_data.items():
        slots = cc_bundles.get(str(b["index"]), [])
        filled = sum(1 for x in slots[:len(b["items"])] if x)
        bundles_state[key] = {"name": b["name"], "filledSlots": filled, "numRequired": b["numRequired"],
                              "complete": filled >= b["numRequired"], "slotArrayLength": len(slots)}

    # --- museum ------------------------------------------------------------------
    museum = locs.get("ArchaeologyHouse")
    museum_pieces = sdict(museum.find("museumPieces")) if museum is not None else {}

    # --- island --------------------------------------------------------------
    island = {}
    for n, fields in {
        "IslandWest": ["farmObelisk", "farmhouseRestored", "farmhouseMailbox", "sandDuggy"],
        "IslandNorth": ["bridgeFixed", "traderActivated", "caveOpened", "treeNutShot"],
        "IslandSouth": ["resortRestored", "westernTurtleMoved"],
        "IslandEast": ["bananaShrineComplete", "bananaShrineNutAwarded"],
        "Caldera": ["visited"],
        "IslandFieldOffice": ["centerSkeletonRestored", "snakeRestored", "batRestored", "frogRestored",
                              "plantsRestoredLeft", "plantsRestoredRight"],
    }.items():
        l = locs.get(n)
        if l is not None:
            island[n] = {fld: boolv(text(l, fld)) for fld in fields}
    fo = locs.get("IslandFieldOffice")
    if fo is not None:
        island["IslandFieldOffice"]["piecesDonated"] = [boolv(e.text) for e in fo.findall("piecesDonated")]

    def orders(tag):
        el = root.find(tag)
        return [{"questKey": text(o, "questKey"), "requester": text(o, "requester"),
                 "orderType": text(o, "orderType"), "questState": text(o, "questState"),
                 "dueDate": num(text(o, "dueDate"))} for o in (el if el is not None else [])]

    farm = locs.get("Farm")
    world = {
        "gameVersion": text(root, "gameVersion"),
        "date": {"year": num(text(root, "year")), "season": text(root, "currentSeason"),
                 "day": num(text(root, "dayOfMonth"))},
        "whichFarm": text(root, "whichFarm"),
        "uniqueIDForThisGame": text(root, "uniqueIDForThisGame"),
        "goldenWalnutsFound": num(text(root, "goldenWalnutsFound")),
        "goldenWalnutsInHand": num(text(root, "goldenWalnuts")),
        "foundBuriedNuts": scalar_list(root.find("foundBuriedNuts")),
        "collectedNutTracker": scalar_list(root.find("collectedNutTracker")),
        "limitedNutDrops": sdict(root.find("limitedNutDrops")),
        "goldenCoconutCracked": boolv(text(root, "goldenCoconutCracked")),
        "parrotPlatformsUnlocked": boolv(text(root, "parrotPlatformsUnlocked")),
        "activatedGoldenParrot": boolv(text(root, "activatedGoldenParrot")),
        "miniShippingBinsObtained": num(text(root, "miniShippingBinsObtained")),
        "lostBooksFound": num(text(root, "lostBooksFound")),
        "worldStateIDs": scalar_list(root.find("worldStateIDs")),
        "broadcastedMail": scalar_list(root.find("broadcastedMail")),
        "constructedBuildings": scalar_list(root.find("constructedBuildings")),
        "perfectionWaivers": num(text(root, "perfectionWaivers")),
        "farmPerfect": boolv(text(root, "farmPerfect")),
        "grandpaScore": num(text(farm, "grandpaScore")) if farm is not None else None,
        "mine_lowestLevelReached": num(text(root, "mine_lowestLevelReached")),
        "skullCavesDifficulty": num(text(root, "skullCavesDifficulty")),
        "minesDifficulty": num(text(root, "minesDifficulty")),
        "completedSpecialOrders": scalar_list(root.find("completedSpecialOrders")),
        "activeSpecialOrders": orders("specialOrders"),
        "availableSpecialOrders": orders("availableSpecialOrders"),
        "timesFedRaccoons": num(text(root, "timesFedRaccoons")),
        "raccoonBundles": scalar_list(root.find("raccoonBundles")),
        "cellarAssignments": sdict(root.find("cellarAssignments")),
        "farmerFriendships": sdict(root.find("farmerFriendships")),
        "customData": sdict(root.find("CustomData")),
        "farmModData": sdict(farm.find("modData")) if farm is not None and farm.find("modData") is not None else {},
        "buildingsByLocation": all_buildings,
        "perfectionBuildings": {b: (b in built_types) for b in PERFECTION_BUILDINGS},
        "cabins": cabins,
        "communityCenter": {
            "areasComplete": scalar_list(cc.find("areasComplete")) if cc is not None else None,
            "bundleRewards": sdict(cc.find("bundleRewards")) if cc is not None else None,
            "bundlesRaw": cc_bundles,
            "bundleData": bundle_data,
            "bundleState": bundles_state,
        },
        "museumPieces": museum_pieces,
        "island": island,
    }

    # SVE / mod data anywhere in the save (aggregated by key prefix)
    mod_prefixes = {}
    for md in root.iter("modData"):
        for item in md.findall("item"):
            k = text(item, "key/string") or ""
            if k.startswith(("FlashShifter", "SVE", "Mods/")):
                mod_prefixes.setdefault(k, []).append(text(item, "value/string"))
    world["sveModDataKeys"] = {k: {"count": len(v), "sample": (v[0] or "")[:200]} for k, v in mod_prefixes.items()}

    host = farmers[0]
    summary = {
        "player": host["name"], "farm": host["farmName"], "gameVersion": world["gameVersion"],
        "date": world["date"], "farmersInSave": len(farmers),
        **host["counts"],
        "goldenWalnutsFound": world["goldenWalnutsFound"],
        "museumPiecesDonated": len(museum_pieces),
        "ccAreasComplete": sum(1 for x in (world["communityCenter"]["areasComplete"] or []) if x),
        "completedSpecialOrders": len(world["completedSpecialOrders"]),
        "secretNotesSeen": len(host["secretNotesSeen"]),
        "achievements": len(host["achievements"]),
        "money": host["money"], "totalMoneyEarned": host["totalMoneyEarned"], "qiGems": host["qiGems"],
        "maxStamina": host["maxStamina"], "perfectionWaivers": world["perfectionWaivers"],
        "perfectionBuildings": world["perfectionBuildings"],
        "parseSeconds_python_etree": round(t_parse, 3),
    }

    out = {"source": os.path.basename(src), "summary": summary, "farmers": farmers, "world": world}
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(json.dumps(summary, indent=1, ensure_ascii=False))
    print(f"wrote {dst} ({os.path.getsize(dst) // 1024} KB)")


if __name__ == "__main__":
    main()
