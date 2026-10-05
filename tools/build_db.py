"""Merge research data (vanilla game data, SVE mod files, wiki guidance, the curated fish list)
into data/db.json, the single database the tracker embeds.

Usage: python tools/build_db.py
"""
import hashlib
import json
import pathlib
import re
import datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
R = ROOT / "data" / "research"
SVE_PREFIX = "FlashShifter.StardewValleyExpandedCP_"
SEASONS = ["spring", "summer", "fall", "winter"]


def load(p):
    return json.loads((R / p).read_text(encoding="utf-8"))


def slug(s):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def wiki_img(name, sve=False):
    """MediaWiki image path: /images/<md5[0]>/<md5[:2]>/<File_Name.png>"""
    fname = name.replace(" ", "_") + ".png"
    h = hashlib.md5(fname.encode("utf-8")).hexdigest()
    if sve:
        return f"https://static.wikia.nocookie.net/stardew-valley-expanded/images/{h[0]}/{h[:2]}/{fname}/revision/latest"
    return f"https://stardewvalleywiki.com/mediawiki/images/{h[0]}/{h[:2]}/{fname}"


def wiki_page(name, sve=False):
    page = name.replace(" ", "_")
    return f"https://stardew-valley-expanded.fandom.com/wiki/{page}" if sve else f"https://stardewvalleywiki.com/{page}"


# ---------------------------------------------------------------- items
v_objs = load("vanilla/objects.json")
s_objs = load("sve/objects.json")["objects"]
counts = load("vanilla/perfection_counts.json")
counts = {k: ([x[0] if isinstance(x, list) else x for x in v] if isinstance(v, list) else v) for k, v in counts.items()}

items = {}  # qid -> {name, sve, price, category, tags, type}
for o in v_objs:
    items[o["qid"]] = {"id": o["id"], "name": o["name"], "sve": False, "price": o["price"], "category": o["category"], "type": o["type"], "tags": o.get("contextTags") or []}
for o in s_objs:
    q = o["qid"]
    base = items.get(q, {})
    items[q] = {**base, "id": o["id"], "name": o["name"], "sve": not o.get("isEdit"), "price": o.get("price", base.get("price", 0)),
                "category": o.get("category", base.get("category")), "type": o.get("type", base.get("type")), "tags": o.get("contextTags") or base.get("tags") or [],
                "museum": o.get("museumDonatable")}
name_to_qid = {}
for q, it in items.items():
    name_to_qid.setdefault(it["name"].lower(), q)

CATEGORY_NAMES = {"-4": "Any fish", "-5": "Any egg", "-6": "Any milk", "-777": "Any wild seeds", "-75": "Any vegetable", "-79": "Any fruit", "-81": "Any forage", "-80": "Any flower", "-14": "Any meat", "-7": "Any cooking", "-26": "Any artisan good"}


def item_name(iid):
    iid = str(iid)
    if iid in CATEGORY_NAMES:
        return CATEGORY_NAMES[iid]
    for q in (iid if iid.startswith("(") else "(O)" + iid, "(BC)" + iid):
        if q in items:
            return items[q]["name"]
    return iid.replace(SVE_PREFIX, "").replace("_", " ")


def qid_of(iid):
    iid = str(iid)
    if iid.startswith("(") or iid.startswith("-"):
        return iid
    return "(O)" + iid


images = {}  # key -> url (downloaded by build.py)


def add_img(key, name, sve):
    if key and name and key not in images:
        images[key] = wiki_img(name, sve)


# ---------------------------------------------------------------- crops & trees
v_crops = load("vanilla/crops.json")
v_trees = load("vanilla/fruitTrees.json")
s_crops_all = load("sve/crops.json")
crop_by_harvest = {}
for c in v_crops:
    crop_by_harvest["(O)" + c["harvestId"]] = {"seasons": [s.lower() for s in c["seasons"]], "grow": sum(c["daysInPhase"]), "regrow": c["regrowDays"], "seed": c["seedName"]}
for c in s_crops_all["crops"]:
    crop_by_harvest["(O)" + c["harvestId"]] = {"seasons": [s.lower() for s in c["seasons"]], "grow": c.get("growthDays") or sum(c["daysInPhase"]), "regrow": c["regrowDays"], "seed": c["seedName"]}
tree_by_fruit = {}
for t in v_trees:
    for fr in t.get("fruit", []) or []:
        fid = fr if isinstance(fr, str) else (fr.get("id") or fr.get("itemId"))
        if fid:
            tree_by_fruit[qid_of(fid)] = {"seasons": [s.lower() for s in t.get("seasons", [])], "sapling": t.get("saplingName") or t.get("displayName")}
for t in s_crops_all["fruitTrees"]:
    for fr in t["fruit"]:
        tree_by_fruit[qid_of(fr["id"])] = {"seasons": [s.lower() for s in t["seasons"]], "sapling": t["saplingName"]}

# ---------------------------------------------------------------- shipping
KIND = {-75: "crop", -79: "crop", -80: "crop", -81: "forage", -5: "animal", -6: "animal", -18: "animal", -14: "animal", -26: "artisan", -27: "artisan", -17: "forage", -23: "fish"}
shipping = []
ship_ids = ["(O)" + i if not str(i).startswith("(") else i for i in counts["shipping"]]
ship_ids += [o["qid"] for o in s_objs if o.get("countsForShipping") and o["qid"] not in ship_ids]
for q in ship_ids:
    it = items.get(q)
    if not it:
        continue
    cat = it.get("category")
    kind = KIND.get(cat, "other")
    entry = {"id": q, "name": it["name"], "price": it.get("price") or 0, "kind": kind, "sve": it["sve"]}
    seasons = [t.split("_")[1] for t in it["tags"] if t.startswith("season_") and t.split("_")[1] in SEASONS]
    if q in crop_by_harvest:
        c = crop_by_harvest[q]
        entry.update(seasons=c["seasons"], grow=c["grow"], regrow=c["regrow"], seed=c["seed"], kind="crop")
        entry["source"] = f"Grow from {c['seed']}"
    elif q in tree_by_fruit:
        t = tree_by_fruit[q]
        entry.update(seasons=t["seasons"], kind="fruit")
        entry["source"] = f"Grow a {t['sapling']}"
    else:
        if kind == "crop":  # fruit/veg/flowers that aren't grown from seed here are foraged
            kind = "forage"
            entry["kind"] = kind
        if seasons:
            entry["seasons"] = sorted(set(seasons), key=SEASONS.index)
        entry["source"] = {"forage": "Forage", "animal": "Raise animals", "artisan": "Make with an artisan machine", "fish": "Fishing or crab pots"}.get(kind, "")
    shipping.append(entry)
    add_img(q, it["name"], it["sve"])

# ---------------------------------------------------------------- fish
curated = json.loads((ROOT / "data" / "fish.json").read_text(encoding="utf-8"))
s_fish = load("sve/fish.json")
fish_count_ids = set("(O)" + i if not str(i).startswith("(") else i for i in counts["fish"])
sve_fish_by_name = {f["name"].lower(): f for f in s_fish["fish"]}
sve_fish_by_name["goldenfish"] = sve_fish_by_name.get("glowfish")

LOC_SPOILER = set(k for k in s_fish["spoilerLocations"])
fish = []
for f in curated:
    f = dict(f)
    if f["source"] == "sve":
        sf = sve_fish_by_name.get(f["name"].lower())
        if not sf:
            print("  ! no SVE id for", f["name"])
            continue
        f["id"] = sf["qid"]
        f["counts"] = bool(sf.get("countsForFishCollection"))
        if f["name"] == "Goldenfish":
            f["name"] = "Glowfish"
            f["notes"] = ((f.get("notes") or "") + " Listed as Goldenfish on older checklists.").strip()
    else:
        q = name_to_qid.get(f["name"].lower())
        if not q:
            print("  ! no vanilla id for", f["name"])
            continue
        f["id"] = q
        f["counts"] = q in fish_count_ids
    f.pop("image", None)
    fish.append(f)
    add_img(f["id"], f["name"], f["source"] == "sve" and f["name"] != "Glowfish")
images["(O)" + SVE_PREFIX + "Goldenfish"] = wiki_img("Goldenfish", True)

# SVE fish missing from the curated checklist: build from mod data
have = {f["id"] for f in fish}
BEH = {"mixed": "mixed", "dart": "dart", "smooth": "smooth", "floater": "floater", "sinker": "sinker"}
WX = {"both": "any", "sunny": "sun", "rainy": "rain"}


def place_name(loc):
    n = loc.get("locationName") or loc["location"]
    n = {"Western Cindersap Forest": "Forest West", "Adventurer's Summit": "Adventurer Summit"}.get(n, n)
    return n


for sf in s_fish["fish"]:
    if sf["qid"] in have:
        continue
    fd = sf.get("fishData") or {}
    locs, seen = [], set()
    for loc in sf.get("locations", []):
        p = place_name(loc)
        detail = ""
        ls = loc.get("seasons") or []
        if ls and len(ls) < 4:
            detail = ", ".join(s.capitalize() for s in sorted(ls, key=SEASONS.index)) + " only"
        if loc.get("fishArea"):
            detail = (loc["fishArea"].lower() + (", " + detail if detail else ""))
        k = (p, detail)
        if k in seen:
            continue
        seen.add(k)
        locs.append({"place": p, "detail": detail, "sve": True, "spoiler": bool(loc.get("spoiler"))})
    time = [[a / 100, b / 100] for a, b in fd.get("time", [[600, 2600]])]
    seasons = fd.get("seasons") or SEASONS
    if fd.get("trap"):
        cat = "crab-pot"
    else:
        cat = "fish"
    entry = {
        "id": sf["qid"], "name": sf["name"], "source": "sve", "category": cat, "price": sf.get("price", 0),
        "locations": locs or [{"place": "Unknown", "detail": "", "sve": True, "spoiler": False}],
        "seasons": [s for s in SEASONS if s in seasons], "seasonNote": "",
        "time": time if not fd.get("trap") else [[6, 26]], "weather": WX.get(fd.get("weather"), "any"),
        "minLevel": fd.get("minLevel", 0), "difficulty": None if fd.get("trap") else fd.get("difficulty"),
        "behavior": None if fd.get("trap") else BEH.get(fd.get("behavior")), "wiki": wiki_page(sf["name"], True),
        "notes": "Location data from the SVE 1.15 mod files." if locs else "", "recipes": [], "lovedBy": [],
        "counts": bool(sf.get("countsForFishCollection")),
    }
    fish.append(entry)
    add_img(entry["id"], sf["name"], True)
fish.sort(key=lambda f: f["name"])

# ---------------------------------------------------------------- cooking / crafting
cook_src = load("wiki/cookingSources.json")
craft_src = load("wiki/craftingSources.json")


def src_index(d):
    idx = {}
    for e in d["vanilla"] + d["sve"]:
        idx[e.get("recipeKey") or e["name"]] = e
        idx[e["name"]] = e
    return idx


cook_idx, craft_idx = src_index(cook_src), src_index(craft_src)


def source_group(s):
    s = (s or "").lower()
    if "queen of sauce" in s:
        return "Queen of Sauce"
    if "starter" in s or "default" in s:
        return "Known from the start"
    if "level" in s and ("farming" in s or "mining" in s or "foraging" in s or "fishing" in s or "combat" in s or "luck" in s):
        return "Skill levels"
    if "heart" in s or "mail" in s:
        return "Friendship"
    if "g" in s and any(w in s for w in ["shop", "saloon", "sells", "buy", "for ", "krobus", "dwarf", "cart", "store", "willy", "marnie", "robin", "pierre", "gus", "qi", "bear", "island trader"]):
        return "Shops"
    if "event" in s or "cutscene" in s:
        return "Events"
    return "Other"


def recipes(vlist, slist, idx, kind):
    out = []
    for r, sve in [(r, False) for r in vlist] + [(r, True) for r in slist]:
        key = r["name"]
        src = idx.get(key) or idx.get(r.get("displayName") or r.get("yieldName") or "")
        disp = r.get("yieldName") or r.get("displayName") or key
        if kind == "crafting" and disp in ("Wedding Ring",):
            counts_ = False
        else:
            counts_ = r.get("countsForPerfection", True) if kind == "crafting" else True
        yid = str(r.get("yieldId", ""))
        qos = None
        if src and src.get("queenOfSauce"):
            q = src["queenOfSauce"]
            qos = {"season": q["season"].lower(), "day": q["day"], "year": q.get("year")}
        e = {
            "id": key, "name": disp, "yieldId": yid, "sve": sve, "counts": counts_,
            "ingredients": [{"id": qid_of(i["id"]), "name": item_name(i["id"]) if str(i["id"]).startswith("-") or not i.get("name") else i["name"], "qty": i.get("qty", 1)} for i in r["ingredients"]],
            "source": (src or {}).get("source") or ("Known from the start" if r.get("unlock") == "default" else ""),
            "qos": qos,
            "spoiler": bool((src or {}).get("spoiler")),
        }
        e["sourceGroup"] = source_group(e["source"])
        out.append(e)
        yq = ("(BC)" if r.get("isBigCraftable") else "(O)") + yid
        e["img"] = yq
        add_img(yq, disp, sve)
    return out


cooking = recipes(load("vanilla/cooking.json"), load("sve/cooking.json")["recipes"], cook_idx, "cooking")
crafting = recipes(load("vanilla/crafting.json"), load("sve/crafting.json")["recipes"], craft_idx, "crafting")

# ---------------------------------------------------------------- villagers
v_chars = {c["id"]: c for c in load("vanilla/characters.json")}
s_chars = {c["id"]: c for c in load("sve/characters.json")["characters"]}
wiki_v = load("wiki/villagers.json")
wiki_by = {}
for v in wiki_v["vanilla"] + wiki_v["sve"]:
    wiki_by[v.get("internalName") or v["name"]] = v
villagers = []
ids = [k for k, c in v_chars.items() if c.get("countsForPerfection")] + [k for k, c in s_chars.items() if c.get("countsForPerfection") and c.get("isNew")]
# conditional villagers (from SVE's Content Patcher conditions):
#   MorrisTod: PerfectionScore true only when IsJojaMartComplete
#   Apples: the character only exists once event 7775927 (ApplesHere) has been seen
COUNTS_WHEN = {"MorrisTod": "joja", "Apples": "apples"}
if "MorrisTod" in s_chars and "MorrisTod" not in ids:
    ids.append("MorrisTod")
for vid in ids:
    vc = {**v_chars.get(vid, {}), **{k: v for k, v in s_chars.get(vid, {}).items() if v is not None}}
    if vid in s_chars and s_chars[vid].get("countsForPerfection") is False and vid not in COUNTS_WHEN:
        continue
    w = wiki_by.get(vid) or wiki_by.get(vc.get("displayName")) or {}
    name = w.get("name") or vc.get("displayName") or vid
    bs, bd = vc.get("birthSeason"), vc.get("birthDay")
    if isinstance(bs, int):
        bs = SEASONS[bs]
    if w.get("birthday"):
        bs, bd = w["birthday"]["season"].lower(), w["birthday"]["day"]
    loves = []
    for ln in (w.get("lovedGifts") or []) + (w.get("sveExtraLovedGifts") or []):
        q = name_to_qid.get(ln.lower())
        if q and not any(l["id"] == q for l in loves):
            loves.append({"id": q, "name": ln})
            add_img(q, items[q]["name"], items[q]["sve"])
    dateable = bool(vc.get("canBeRomanced"))
    is_sve = vid in s_chars and s_chars[vid].get("isNew", False)
    villagers.append({
        "id": vid, "name": name, "birthday": {"season": bs.lower(), "day": bd} if bs and bd else None,
        "dateable": dateable, "sve": is_sve, "spoiler": bool(w.get("spoiler") or (is_sve and s_chars[vid].get("spoiler"))),
        "loves": loves, "how": w.get("unlock", ""), "counts": True, "wiki": wiki_page(name, is_sve),
    })
    if vid in COUNTS_WHEN:
        villagers[-1]["countsWhen"] = COUNTS_WHEN[vid]
        villagers[-1]["note"] = {"joja": "Only counts toward Perfection once you've finished the JojaMart route.",
                                 "apples": "Only counts once Apples has arrived (his story event)."}[COUNTS_WHEN[vid]]
    images["npc:" + vid] = wiki_img(f"{name} Icon", is_sve)
villagers.sort(key=lambda v: v["name"])

# ---------------------------------------------------------------- monsters, stardrops, walnuts, buildings, skills
v_ms = {m["id"]: m for m in load("vanilla/monsterSlayer.json")}
w_ms = load("wiki/monsterSlayer.json")
monsters = []
for g in w_ms["goals"]:
    vm = v_ms.get(g["id"], {})
    sve_loc = [s["location"] for s in g.get("sve", [])]
    monsters.append({"id": g["id"], "name": g["name"], "targets": vm.get("targets") or g["targets"], "count": g["count"], "reward": g["reward"],
                     "where": "; ".join(g.get("bestLocations", [])[:3]), "whereSve": "; ".join(sve_loc)})

stardrops = [{"id": s["id"], "name": s["name"], "how": s["how"], "prereq": s.get("prerequisites")} for s in load("wiki/stardrops.json")["stardrops"]]

walnuts = []
wn = load("wiki/walnuts.json")
for i, w in enumerate(wn["walnuts"]):
    flags = [x.strip() for x in str(w.get("saveFlag") or "").split("+") if x.strip()]
    walnuts.append({"id": f"w{i}-{slug(w['title'])[:30]}", "area": w["area"], "count": w["count"], "title": w["title"], "hint": w["hint"],
                    "solution": w["solution"], "flags": flags, "store": w.get("saveFlagStore", "")})

sk = load("wiki/skills.json")
xp_totals = [lv["totalXp"] for lv in sk["xpTable"]]
buildings = []
for b in sk["wizardBuildings"]["buildings"]:
    if "Obelisk" not in b["name"] and "Clock" not in b["name"]:
        continue
    kind = "clock" if "Clock" in b["name"] else "obelisk"
    buildings.append({"id": b["name"], "name": b["name"], "kind": kind, "cost": b["gold"],
                      "materials": [{"name": m["name"], "qty": m["count"]} for m in b.get("materials", [])]})

# ---------------------------------------------------------------- museum
beyond = load("wiki/beyond.json")
museum = []
for kind, key in (("artifact", "artifacts"), ("mineral", "minerals")):
    for n in beyond["museum"][key]:
        q = {"strange doll (green)": "(O)126", "strange doll (yellow)": "(O)127"}.get(n.lower()) or name_to_qid.get(n.lower())
        if q:
            museum.append({"id": q, "name": n if "Strange Doll" in n else items[q]["name"], "kind": kind, "price": items[q].get("price", 0), "sve": False})
            add_img(q, items[q]["name"], False)
for o in s_objs:
    if o.get("museumDonatable") and not o.get("isEdit"):
        museum.append({"id": o["qid"], "name": o["name"], "kind": "artifact", "price": o.get("price", 0), "sve": True})
        add_img(o["qid"], o["name"], True)

# ---------------------------------------------------------------- bundles (default SVE normal set; the save overrides)
cc = beyond["communityCenter"]
sve_changes = {(b["room"], b["bundle"]): b for b in cc["sve"].get("normalModeChangedBundles", [])}
bundles = []
for room in cc["vanillaStandard"]:
    for i, b in enumerate(room["bundles"]):
        b2 = sve_changes.get((room["room"], b["bundle"]), b)
        its = []
        for j, it in enumerate(b2["items"]):
            q = name_to_qid.get(it["name"].lower())
            its.append({"key": str(j), "id": q, "name": it["name"], "qty": it.get("qty", 1), "quality": it.get("quality", "")})
            if q:
                add_img(q, items[q]["name"], items[q]["sve"])
        if not its and room["room"] == "Vault":  # gold bundles: one slot, the gold itself
            its = [{"key": "0", "id": None, "name": b2["bundle"].replace(" Bundle", "") + "g", "qty": 1, "quality": ""}]
        bundles.append({"id": f"{room['room']}/{i}", "room": room["room"], "name": b2["bundle"], "required": b2.get("slotsRequired") or len(its),
                        "items": its, "reward": b2.get("reward", "")})

# ---------------------------------------------------------------- calendar
cal = load("wiki/calendar.json")
festivals = []
for f in cal["vanilla"]["festivals"]:
    festivals.append({"name": f["name"], "season": f["season"].lower(), "days": f["days"], "fishing": (f.get("fishingAffected") or {}).get("detail", ""),
                      "shops": (f.get("shopsAffected") or {}).get("affected", False), "sve": False})
for f in cal["sve"].get("addedFestivals", []):
    seasons = SEASONS if f["season"] == "All" else [f["season"].lower()]
    for s in seasons:
        festivals.append({"name": f["name"], "season": s, "days": f["days"], "fishing": (f.get("fishingAffected") or {}).get("detail", ""), "shops": False, "sve": True, "note": f.get("unlock", "")})
qos = [{"recipe": q["recipe"], "season": q["season"].lower(), "day": q["day"], "year": q["year"]} for q in cal["queenOfSauce"]["year1"] + cal["queenOfSauce"]["year2"]]

# ---------------------------------------------------------------- write
item_names = {q: it["name"] for q, it in items.items()}
item_cats = {q: it.get("category") for q, it in items.items() if it.get("category") not in (None, 0)}
db = {
    "meta": {"gameVersion": "1.6.15", "sveVersion": "1.15.11", "built": datetime.date.today().isoformat()},
    "fish": fish, "shipping": shipping, "cooking": cooking, "crafting": crafting, "villagers": villagers,
    "monsters": monsters, "stardrops": stardrops, "walnuts": walnuts, "buildings": buildings,
    "skills": {"xp": xp_totals}, "museum": museum, "bundles": bundles,
    "calendar": {"festivals": festivals, "qos": qos},
    "itemName": item_names,
    "itemCat": item_cats,
    "images": images,
}
out = ROOT / "data" / "db.json"
out.write_text(json.dumps(db, ensure_ascii=False, indent=1), encoding="utf-8")
c = lambda l: sum(1 for x in l if x.get("counts", True))
print(f"db.json: fish {len(fish)} ({c(fish)} count), shipping {len(shipping)}, cooking {len(cooking)}, crafting {len(crafting)} ({c(crafting)} count), "
      f"villagers {len(villagers)}, monsters {len(monsters)}, stardrops {len(stardrops)}, walnuts {len(walnuts)} ({sum(w['count'] for w in walnuts)}), "
      f"buildings {len(buildings)}, museum {len(museum)}, bundles {len(bundles)}, festivals {len(festivals)}, qos {len(qos)}, images {len(images)}")
