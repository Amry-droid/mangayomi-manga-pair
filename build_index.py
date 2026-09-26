#!/usr/bin/env python3
"""Set the GitHub owner and generate an importable Mangayomi index.json."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = "mangayomi-manga-pair"


def main() -> None:
    if len(sys.argv) != 2 or not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", sys.argv[1]):
        raise SystemExit("Usage: python3 build_index.py YOUR_GITHUB_USERNAME")
    owner = sys.argv[1]
    raw = f"https://raw.githubusercontent.com/{owner}/{REPO}/main/extensions"
    sources = [
        ("MangaBat", "https://www.mangabats.com", "mangabat", 2026092601, False),
        ("MangaKakalot", "https://www.mangakakalot.gg", "mangakakalot", 2026092602, True),
    ]
    index = []
    for name, base, filename, source_id, cloudflare in sources:
        index.append({
            "name": name,
            "id": source_id,
            "baseUrl": base,
            "lang": "en",
            "typeSource": "single",
            "iconUrl": base + "/favicon.ico",
            "dateFormat": "",
            "dateFormatLocale": "",
            "isNsfw": True,
            "hasCloudflare": cloudflare,
            "sourceCodeUrl": raw + f"/{filename}.js",
            "apiUrl": "",
            "version": "0.0.4",
            "isManga": True,
            "itemType": 0,
            "isFullData": False,
            "appMinVerReq": "0.5.0",
            "additionalParams": "",
            "sourceCodeLanguage": 1,
            "notes": "The website may require Cloudflare verification in WebView." if cloudflare else "",
        })
    (ROOT / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n")
    (ROOT / "repo.json").write_text(json.dumps({"name": "MangaBat + MangaKakalot", "website": f"https://github.com/{owner}/{REPO}"}, indent=2) + "\n")
    print(f"Mangayomi URL: https://raw.githubusercontent.com/{owner}/{REPO}/main/index.json")


if __name__ == "__main__":
    main()
