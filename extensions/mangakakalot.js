// Mangayomi JavaScript source: MangaKakalot (mangakakalot.gg).
// This file is standalone; Mangayomi supplies MProvider, Client and Document.
class DefaultExtension extends MProvider {
  get root() { return this.source.baseUrl.replace(/\/$/, ""); }

  getHeaders(url) {
    return { "Referer": this.root + "/" };
  }

  absolute(value) {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    return this.root + (value.startsWith("/") ? value : "/" + value);
  }

  async request(url) {
    const response = await new Client().get(this.absolute(url), this.getHeaders(url));
    if (response.statusCode >= 400) throw new Error("HTTP " + response.statusCode);
    if (/performing security verification|verify you are human|just a moment/i.test(response.body)) {
      throw new Error("The site requires browser verification; open it in Mangayomi WebView.");
    }
    return response.body;
  }

  async document(url) { return new Document(await this.request(url)); }
  attr(node, key) { return node ? node.attr(key) || "" : ""; }
  text(node) { return node ? node.text.trim() : ""; }

  imageUrl(node) {
    if (!node) return "";
    const candidates = ["data-src", "data-original", "data-lazy-src", "data-url", "src"]
      .map(key => this.attr(node, key));
    let value = candidates.find(item => item &&
      !/^(?:data:|blob:)/i.test(item) &&
      !/default_bat|404-avatar|loading|placeholder/i.test(item));
    if (!value) {
      const srcset = this.attr(node, "srcset");
      value = srcset ? srcset.split(",")[0].trim().split(/\s+/)[0] : "";
    }
    return this.absolute(value);
  }

  // Atsumaru-style date contract: always return epoch milliseconds as a string.
  // These mirrors also expose yearless dates, so anchorTime supplies the missing year.
  parseDate(value, anchorTime) {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "number") {
      const milliseconds = value < 100000000000 ? value * 1000 : value;
      return Number.isFinite(milliseconds) ? String(Math.trunc(milliseconds)) : "";
    }
    const text = String(value).trim();
    if (!text) return "";
    if (/^\d{10,13}$/.test(text)) {
      const number = Number(text);
      return String(text.length === 10 ? number * 1000 : number);
    }

    const now = Date.now();
    if (/^(?:just now|today)$/i.test(text)) return String(now);
    if (/^yesterday$/i.test(text)) return String(now - 86400000);
    const relative = text.match(/^(?:about\s+)?(\d+|an?|one)\s+(minute|hour|day|week|month|year)s?\s+ago$/i);
    if (relative) {
      const amount = /^\d+$/.test(relative[1]) ? Number(relative[1]) : 1;
      const units = { minute: 60000, hour: 3600000, day: 86400000,
        week: 604800000, month: 2592000000, year: 31536000000 };
      return String(now - amount * units[relative[2].toLowerCase()]);
    }

    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    let match = text.match(/^([A-Za-z]{3,9})[-\s](\d{1,2})[-,\s]+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
    if (match && months[match[1].slice(0, 3).toLowerCase()] !== undefined) {
      let hour = Number(match[4] || 0);
      const period = (match[7] || "").toUpperCase();
      if (period === "PM" && hour < 12) hour += 12;
      if (period === "AM" && hour === 12) hour = 0;
      const date = new Date(Number(match[3]), months[match[1].slice(0, 3).toLowerCase()],
        Number(match[2]), hour, Number(match[5] || 0), Number(match[6] || 0));
      return Number.isNaN(date.getTime()) ? "" : String(date.getTime());
    }

    match = text.match(/^(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
      const anchor = Number(anchorTime) || now;
      let year = new Date(anchor).getFullYear();
      let date = new Date(year, Number(match[1]) - 1, Number(match[2]),
        Number(match[3] || 0), Number(match[4] || 0), Number(match[5] || 0));
      if (date.getTime() > anchor + 129600000) {
        date = new Date(year - 1, Number(match[1]) - 1, Number(match[2]),
          Number(match[3] || 0), Number(match[4] || 0), Number(match[5] || 0));
      }
      return Number.isNaN(date.getTime()) ? "" : String(date.getTime());
    }

    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? "" : String(parsed);
  }

  chaptersFromRows(doc, anchorTime) {
    let rows = doc.select("#chapter-list-container .chapter-list .row");
    if (!rows.length) rows = doc.select(".chapter-list .row");
    const chapters = [];
    let previous = Number(anchorTime) || Date.now();
    for (const row of rows) {
      const link = row.selectFirst("a[href]");
      const url = this.absolute(this.attr(link, "href"));
      if (!url) continue;
      const cells = row.select("span");
      const dateText = cells.length ? this.text(cells[cells.length - 1]) : "";
      const dateUpload = this.parseDate(dateText, previous);
      if (dateUpload) previous = Number(dateUpload);
      chapters.push({ name: this.text(link), url, dateUpload });
    }
    return chapters;
  }

  cards(doc) {
    let nodes = doc.select(".list-comic-item-wrap");
    if (!nodes.length) nodes = doc.select(".story_item");
    if (!nodes.length) nodes = doc.select("#contentstory .itemupdate");
    const list = [];
    for (const node of nodes) {
      const title = node.selectFirst("h3 a[href*='/manga/']") ||
        node.selectFirst(".story_name a[href*='/manga/']");
      const image = node.selectFirst("img");
      const link = this.absolute(this.attr(title, "href"));
      if (link && this.text(title)) list.push({
        name: this.text(title), link,
        imageUrl: this.imageUrl(image),
      });
    }
    return list;
  }

  async listing(path, page) {
    page = Math.max(1, Number(page) || 1);
    const join = path.includes("?") ? "&" : "?";
    const url = path + (page > 1 ? join + "page=" + page : "");
    const doc = await this.document(url);
    const list = this.cards(doc);
    const links = doc.select("a[href]");
    const next = links.some(a => {
      const href = this.attr(a, "href");
      return /(?:\?|&)page=/.test(href) &&
        new RegExp("(?:\\?|&)page=" + (page + 1) + "(?:&|$)").test(href);
    });
    return { list, hasNextPage: list.length > 0 && next };
  }

  async getPopular(page) { return this.listing("/manga-list/hot-manga", page); }
  async getLatestUpdates(page) { return this.listing("/manga-list/latest-manga", page); }
  async search(query, page, filters) {
    if (!query || !query.trim()) return this.getPopular(page);
    const slug = encodeURIComponent(query.trim().replace(/\s+/g, "_"));
    return this.listing("/search/story/" + slug, page);
  }
  getFilterList() { return []; }

  parseChapters(raw, mangaUrl, anchorTime) {
    const chapters = [];
    let data;
    try { data = JSON.parse(raw); } catch (_) { data = raw; }
    for (let depth = 0; depth < 6 && data && !Array.isArray(data) && typeof data === "object"; depth++) {
      const next = data.chapters || data.items || data.results || data.list ||
        data.html || data.content || data.data;
      if (!next || next === data) break;
      data = next;
    }
    if (Array.isArray(data)) {
      let previous = Number(anchorTime) || Date.now();
      for (const chapter of data) {
        if (!chapter || typeof chapter !== "object") continue;
        let name = chapter.name || chapter.chapter_name || chapter.chapter_title ||
          chapter.title || chapter.chapter || chapter.chapter_number ||
          chapter.chapter_num || chapter.number || chapter.chap;
        const slug = chapter.slug || chapter.chapter_slug || "";
        const path = chapter.url || chapter.link || chapter.chapter_url || chapter.href ||
          (slug ? mangaUrl + "/" + slug : "");
        if (name && path) {
          name = String(name);
          if (/^\d+(?:\.\d+)?$/.test(name)) name = "Chapter " + name;
          const rawDate = chapter.dateUpload || chapter.date_upload || chapter.uploaded_at ||
            chapter.updated_at || chapter.created_at || chapter.upload_date || chapter.date || chapter.time;
          const dateUpload = this.parseDate(rawDate, previous);
          if (dateUpload) previous = Number(dateUpload);
          chapters.push({ name, url: this.absolute(path), dateUpload });
        }
      }
    } else if (typeof data === "string") {
      const doc = new Document(data);
      const rows = this.chaptersFromRows(doc, anchorTime);
      if (rows.length) return rows;
      for (const link of doc.select(".chapter-list a[href], #chapter-list-container a[href], a[href*='/chapter-']")) {
        const url = this.absolute(this.attr(link, "href"));
        if (url) chapters.push({ name: this.text(link), url, dateUpload: "" });
      }
    }
    return chapters;
  }

  chapterNumber(chapter) {
    let match = (chapter.url || "").match(/\/chapter-(\d+)(?:-(\d+))?(?:\/|$)/i);
    if (match) return Number(match[1] + (match[2] ? "." + match[2] : ""));
    match = (chapter.name || "").match(/chapter\s*(\d+(?:\.\d+)?)/i);
    return match ? Number(match[1]) : NaN;
  }

  mergeChapters(...lists) {
    const byUrl = new Map();
    for (const list of lists) {
      for (const chapter of list || []) {
        const url = this.absolute(chapter.url || chapter.link || "");
        if (!url) continue;
        const incoming = { name: chapter.name || "Chapter", url,
          dateUpload: chapter.dateUpload === null || chapter.dateUpload === undefined ? "" : String(chapter.dateUpload) };
        if (!byUrl.has(url)) byUrl.set(url, incoming);
        else if (!byUrl.get(url).dateUpload && incoming.dateUpload) byUrl.get(url).dateUpload = incoming.dateUpload;
      }
    }
    return Array.from(byUrl.values()).sort((a, b) => {
      const left = this.chapterNumber(a);
      const right = this.chapterNumber(b);
      if (!Number.isNaN(left) && !Number.isNaN(right)) return right - left;
      return 0;
    });
  }

  completeChapterRange(chapters, doc, mangaUrl) {
    const bounds = doc.select(".read-chapter a[href]");
    const startLink = bounds.find(a => /start reading/i.test(this.text(a)));
    const newestLink = bounds.find(a => /newest chapter/i.test(this.text(a)));
    if (!startLink || !newestLink) return chapters;
    const start = this.chapterNumber({ name: this.text(startLink), url: this.attr(startLink, "href") });
    const newest = this.chapterNumber({ name: this.text(newestLink), url: this.attr(newestLink, "href") });
    if (!Number.isInteger(start) || !Number.isInteger(newest) || start < 0 || newest < start || newest - start > 5000) {
      return chapters;
    }
    const expected = newest - start + 1;
    const existingIntegers = new Set(chapters.map(chapter => this.chapterNumber(chapter))
      .filter(number => Number.isInteger(number) && number >= start && number <= newest));
    if (existingIntegers.size >= expected) return chapters;
    const generated = [];
    for (let number = newest; number >= start; number--) {
      generated.push({ name: "Chapter " + number,
        url: mangaUrl.replace(/\/$/, "") + "/chapter-" + number, dateUpload: "" });
    }
    return this.mergeChapters(chapters, generated);
  }

  async getDetail(url) {
    const link = this.absolute(url);
    const doc = await this.document(link);
    const title = this.text(doc.selectFirst(".manga-info-text h1")) ||
      this.text(doc.selectFirst("h1"));
    const cover = doc.selectFirst(".manga-info-pic img") || doc.selectFirst(".manga-info-content img");
    const metadata = doc.select(".manga-info-text li").map(li => this.text(li));
    const authorLine = metadata.find(s => /^Author\(s\)\s*:/i.test(s)) || "";
    const statusLine = metadata.find(s => /^Status\s*:/i.test(s)) || "";
    const updatedLine = metadata.find(s => /^Last updated\s*:/i.test(s)) || "";
    const anchorTime = this.parseDate(updatedLine.replace(/^Last updated\s*:\s*/i, ""), Date.now());
    const statusText = statusLine.split(":").slice(1).join(":").trim().toLowerCase();
    const status = statusText.includes("ongoing") ? 0 :
      statusText.includes("complete") ? 1 : statusText.includes("hiatus") ? 2 : 5;
    const summary = this.text(doc.selectFirst("#contentBox"));
    const genre = doc.select(".manga-info-text .genres a").map(x => this.text(x));
    const container = doc.selectFirst("#chapter-list-container");
    let apiChapters = [];
    const apiTemplate = this.attr(container, "data-api-url");
    const slug = this.attr(container, "data-comic-slug") || link.split("/").pop();
    if (apiTemplate) {
      const endpoint = apiTemplate.replace("__SLUG__", encodeURIComponent(slug));
      try { apiChapters = this.parseChapters(await this.request(endpoint), link, anchorTime); }
      catch (error) { /* An inline chapter list may still be available. */ }
    }
    let inlineChapters = this.chaptersFromRows(doc, anchorTime);
    if (!inlineChapters.length) {
      inlineChapters = doc.select("#chapter-list-container .chapter-list a[href]").map(item => ({
        name: this.text(item), url: this.absolute(this.attr(item, "href")), dateUpload: "",
      }));
    }
    let chapters = this.mergeChapters(apiChapters, inlineChapters);
    chapters = this.completeChapterRange(chapters, doc, link);
    if (!chapters.length) {
      throw new Error("No chapters returned by the site. Its chapter API may be blocked or changed.");
    }
    return {
      name: title, link, description: summary.replace(/^.*?summary:\s*/i, ""),
      imageUrl: this.imageUrl(cover),
      author: authorLine.split(":").slice(1).join(":").trim(), genre, status, chapters,
    };
  }

  async getPageList(url) {
    const doc = await this.document(url);
    const pages = [];
    for (const img of doc.select(".container-chapter-reader img")) {
      const src = this.imageUrl(img);
      if (src) pages.push({ url: src, headers: this.getHeaders(src) });
    }
    if (!pages.length) throw new Error("No reader images found. The site layout may have changed.");
    return pages;
  }
}
