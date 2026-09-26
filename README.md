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
- Version 0.0.6 sends the required image referrer, understands lazy-loaded image attributes, follows the chapter API's `has_more` pagination until every batch has been collected, merges API and inline chapter lists, fills integer chapter gaps, and uses Atsumaru's exact `parseDate` implementation so Mangayomi receives epoch-millisecond chapter dates. A separate normalizer supplies the missing year in the mirrors' `MM-DD HH:mm` values before calling `parseDate`. Special decimal chapters returned by the site are kept too.
- Mangayomi does not overwrite `dateUpload` for chapters already stored in its database. If a title was added before date support, mass-migrate it to the other mirror once so Mangayomi rebuilds its chapter records.
- A website layout or domain change may require a source update. When editing either `.js` file, increase its `version` in `index.json` before reuploading.

This repository contains source parsers only, no manga or images. It is unaffiliated with Mangayomi and the websites. Please respect the rights of creators and publishers.
