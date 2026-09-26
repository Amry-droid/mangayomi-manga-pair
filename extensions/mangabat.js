// Mangayomi JavaScript source: MangaBat (mangabats.com).
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

  parseChapters(raw, mangaUrl) {
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
          chapters.push({ name, url: this.absolute(path) });
        }
      }
    } else if (typeof data === "string") {
      const doc = new Document(data);
      for (const link of doc.select(".chapter-list a[href], #chapter-list-container a[href], a[href*='/chapter-']")) {
        const url = this.absolute(this.attr(link, "href"));
        if (url) chapters.push({ name: this.text(link), url });
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
        if (url && !byUrl.has(url)) byUrl.set(url, { name: chapter.name || "Chapter", url });
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
      generated.push({ name: "Chapter " + number, url: mangaUrl.replace(/\/$/, "") + "/chapter-" + number });
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
      try { apiChapters = this.parseChapters(await this.request(endpoint), link); }
      catch (error) { /* An inline chapter list may still be available. */ }
    }
    const inlineChapters = [];
    for (const item of doc.select("#chapter-list-container .chapter-list a[href]")) {
      inlineChapters.push({ name: this.text(item), url: this.absolute(this.attr(item, "href")) });
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
