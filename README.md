# MangaBat + MangaKakalot for Mangayomi

Two independent English manga sources for Mangayomi. The sources target the current `mangabats.com` and `mangakakalot.gg` site layouts. They offer popular/latest lists, search, title details, chapters and reader pages.

## Install in Mangayomi

1. In Mangayomi, open **More → Settings → Browse → Manga extensions repo → Add** and enter:

   `https://raw.githubusercontent.com/Amry-droid/mangayomi-manga-pair/main/index.json`

2. Go to **Browse → Manga extensions**, install MangaBat and MangaKakalot, and try a search followed by a chapter.

Do not paste a local `file://` path or the GitHub repository page into Mangayomi: it needs the public raw `index.json` URL. No Mangayomi login is required for the repository.

## Current limits

- The websites contain some adult titles. Mangayomi may hide the sources unless adult sources are enabled. They are mirrors with largely overlapping catalogs. Keeping them separate lets you switch if one domain has trouble.
- MangaKakalot displayed a Cloudflare verification during inspection. Mangayomi may be blocked until the site allows its WebView; an extension cannot bypass that verification.
- MangaBat loaded in a browser and exposed chapter images, but the chapter API could not be reached from this environment. The parser supports common JSON and HTML response shapes and still needs an in-app chapter check. If a title shows no chapters, report the title and exact error so the API parser can be adjusted.
- A website layout or domain change may require a source update. When editing either `.js` file, increase its `version` in `index.json` before reuploading.

This repository contains source parsers only, no manga or images. It is unaffiliated with Mangayomi and the websites. Please respect the rights of creators and publishers.
