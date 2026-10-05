"""Build fishbook.html: bundle src/ (CSS + JS) with data/db.json and embed every sprite as a data URI,
so the output is one offline file.

Usage: python tools/build_db.py && python build.py
"""
import base64
import hashlib
import concurrent.futures as cf
import json
import re
import pathlib
import subprocess
import urllib.parse

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
DOMAIN = "sdve.rikode.com.br"  # GitHub Pages custom domain; also written to docs/CNAME
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


def csp_meta(html: str) -> str:
    """Strict Content Security Policy: the two inline scripts are allowed by hash, nothing else runs.
    Inline style attributes stay allowed (the UI sets CSS variables per element)."""
    scripts = re.findall(r"<script>(.*?)</script>", html, flags=re.S)
    hashes = " ".join("'sha256-" + base64.b64encode(hashlib.sha256(s.encode("utf-8")).digest()).decode() + "'" for s in scripts)
    policy = "; ".join([
        "default-src 'none'",
        f"script-src {hashes}",
        "style-src 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src data: blob:",
        "connect-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
    ])
    return f'<meta http-equiv="Content-Security-Policy" content="{policy}">'


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
    html = html.replace("<!--__CSP__-->", csp_meta(html))
    out = ROOT / "fishbook.html"
    out.write_text(html.replace("<!--__PWA__-->", ""), encoding="utf-8")

    # hostable site (GitHub Pages serves /docs): same app plus manifest, offline cache and icons
    site = ROOT / "docs"
    site.mkdir(exist_ok=True)
    origin = "https://" + DOMAIN
    version = hashlib.sha1(html.encode("utf-8")).hexdigest()[:10]
    pwa_head = "\n".join([
        '<link rel="manifest" href="manifest.webmanifest">',
        '<link rel="apple-touch-icon" href="icon-192.png">',
        '<meta property="og:type" content="website">',
        '<meta property="og:title" content="Fishbook: Stardew Valley Expanded perfection tracker">',
        '<meta property="og:description" content="Load your save and see what\'s left for Perfection in SVE: fish, shipping, recipes, friends, walnuts and more.">',
        f'<link rel="canonical" href="{origin}/">',
        f'<meta property="og:url" content="{origin}/">',
        f'<meta property="og:image" content="{origin}/og.png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta name="twitter:card" content="summary_large_image">',
    ])
    (site / "index.html").write_text(html.replace("<!--__PWA__-->", pwa_head), encoding="utf-8")
    for f in (SRC / "pwa").iterdir():
        if f.name == "sw.js":
            (site / f.name).write_text(f.read_text(encoding="utf-8").replace("__VERSION__", version), encoding="utf-8")
        else:
            (site / f.name).write_bytes(f.read_bytes())
    (site / ".nojekyll").write_text("", encoding="utf-8")
    (site / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
    (site / "CNAME").write_text(DOMAIN + "\n", encoding="utf-8")
    print(f"Built {out.name}: {out.stat().st_size // 1024} KB, {len(img)} sprites, {len(missing)} missing")
    if missing:
        print("  missing:", ", ".join(missing[:40]), "..." if len(missing) > 40 else "")


if __name__ == "__main__":
    main()
