"""Ship-layer pre-flight: what must be true before anything is published.

Run: python -m unittest discover -s tests
"""
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHIPPED = [ROOT / "almanac.html", ROOT / "docs" / "index.html"]
SECRET = re.compile(r"(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[bp]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})")


def tracked():
    try:
        out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return [ROOT / p for p in out.splitlines()]


class Preflight(unittest.TestCase):
    def test_no_secrets_in_tracked_files(self):
        files = tracked()
        if files is None:
            self.skipTest("not a git checkout")
        for f in files:
            if f.suffix in (".png", ".ico") or not f.exists():
                continue
            hit = SECRET.search(f.read_text(encoding="utf-8", errors="ignore"))
            self.assertIsNone(hit, f"credential-like string in {f.relative_to(ROOT)}")

    def test_private_data_not_tracked(self):
        files = tracked()
        if files is None:
            self.skipTest("not a git checkout")
        rel = [f.relative_to(ROOT).as_posix() for f in files]
        self.assertFalse([p for p in rel if p.startswith(("data/research/", "data/img/", "node_modules/"))])
        self.assertFalse([p for p in rel if p.endswith(".csv") or "SaveGameInfo" in p])

    def test_shipped_pages_have_no_local_links(self):
        for page in SHIPPED:
            html = page.read_text(encoding="utf-8")
            self.assertNotRegex(html, r"(?:src|href)=[\"'](?:https?://(?:localhost|127\.0\.0\.1)|file:|[A-Za-z]:[\\/])", page.name)

    def test_shipped_pages_enforce_csp(self):
        for page in SHIPPED:
            html = page.read_text(encoding="utf-8")
            self.assertIn('http-equiv="Content-Security-Policy"', html, page.name)
            self.assertNotIn(" onerror=", html, f"inline handler in {page.name}")
            self.assertNotIn(" onclick=", html, f"inline handler in {page.name}")

    def test_hosted_build_complete(self):
        for name in ("index.html", "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "og.png", "robots.txt"):
            self.assertTrue((ROOT / "docs" / name).exists(), name)


if __name__ == "__main__":
    unittest.main()
