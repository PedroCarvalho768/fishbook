"""Build fishbook.html: bundle src/ (CSS + JS) with data/db.json and embed every sprite as a data URI,
so the output is one offline file.

Usage: python tools/build_db.py && python build.py
"""
import base64
import hashlib
import concurrent.futures as cf
import json
import pathlib
import subprocess
import urllib.parse

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
IMG_DIR = ROOT / "data" / "img"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"


def cache_path(url: str) -> pathlib.Path:
    name = url.split("/revision/")[0].rsplit("/", 1)[-1] if "/revision/" in url else url.rsplit("/", 1)[-1]
    prefix = "sve_" if "wikia" in url else ""
    return IMG_DIR / (prefix + urllib.parse.unquote(name))


def fetch(url: str) -> pathlib.Path | None:
    path = cache_path(url)
    if path.exists():
        return path if path.stat().st_size else None
    miss = path.with_suffix(path.suffix + ".missing")
    if miss.exists():
        return None
    # curl, not urllib: the fandom CDN rejects urllib's TLS client even with identical headers
    referer = "https://stardew-valley-expanded.fandom.com/" if "wikia" in url else "https://stardewvalleywiki.com/"
    cmd = ["curl", "-sfL", "--max-time", "20", "-A", UA, "-e", referer, "-H", "Accept: image/png,image/*;q=0.8", "-o", str(path), url]
    if subprocess.run(cmd).returncode != 0 or not path.exists() or path.stat().st_size == 0:
        path.unlink(missing_ok=True)
        miss.touch()
        return None
    return path


def sniff(data: bytes) -> str:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:3] == b"GIF":
        return "image/gif"
    return "image/png"


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    db = json.loads((ROOT / "data" / "db.json").read_text(encoding="utf-8"))
    urls = db.pop("images")
    with cf.ThreadPoolExecutor(16) as pool:
        paths = dict(zip(urls.keys(), pool.map(fetch, urls.values())))
    img, missing = {}, []
    for key, path in paths.items():
        if path:
            data = path.read_bytes()
            img[key] = f"data:{sniff(data)};base64," + base64.b64encode(data).decode()
        else:
            missing.append(key)
    db["img"] = img
    for f in db["fish"]:
        f["img"] = img.get(f["id"])
    for coll in ("shipping", "museum"):
        for x in db[coll]:
            x["img"] = img.get(x["id"])
    for coll in ("cooking", "crafting"):
        for x in db[coll]:
            x["img"] = img.get(x.pop("img", None) or "")
    for v in db["villagers"]:
        v["img"] = img.get("npc:" + v["id"])

    css = "\n".join((SRC / "css" / n).read_text(encoding="utf-8") for n in ["base.css", "shell.css", "fish.css", "views.css"])
    js = "\n".join(p.read_text(encoding="utf-8") for p in sorted((SRC / "js").glob("*.js")))
    payload = json.dumps(db, ensure_ascii=False, separators=(",", ":")).replace("</", r"<\/")
    html = (SRC / "index.html").read_text(encoding="utf-8")
    html = html.replace("/*__CSS__*/", css).replace("/*__JS__*/", js).replace("/*__DB__*/{}", payload)
    out = ROOT / "fishbook.html"
    out.write_text(html.replace("<!--__PWA__-->", ""), encoding="utf-8")

    # hostable site (GitHub Pages serves /docs): same app plus manifest, offline cache and icons
    site = ROOT / "docs"
    site.mkdir(exist_ok=True)
    version = hashlib.sha1(html.encode("utf-8")).hexdigest()[:10]
    pwa_head = '<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-192.png">'
    (site / "index.html").write_text(html.replace("<!--__PWA__-->", pwa_head), encoding="utf-8")
    for f in (SRC / "pwa").iterdir():
        if f.name == "sw.js":
            (site / f.name).write_text(f.read_text(encoding="utf-8").replace("__VERSION__", version), encoding="utf-8")
        else:
            (site / f.name).write_bytes(f.read_bytes())
    (site / ".nojekyll").write_text("", encoding="utf-8")
    print(f"Built {out.name}: {out.stat().st_size // 1024} KB, {len(img)} sprites, {len(missing)} missing")
    if missing:
        print("  missing:", ", ".join(missing[:40]), "..." if len(missing) > 40 else "")


if __name__ == "__main__":
    main()
