// Mangayomi JavaScript source: MangaKakalot (mangakakalot.gg).
// This file is standalone; Mangayomi supplies MProvider, Client and Document.
class DefaultExtension extends MProvider {
  get root() { return this.source.baseUrl.replace(/\/$/, ""); }

  absolute(value) {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    return this.root + (value.startsWith("/") ? value : "/" + value);
  }

  async request(url) {
    const response = await new Client().get(this.absolute(url), {
      "Referer": this.root + "/",
    });
    if (response.statusCode >= 400) throw new Error("HTTP " + response.statusCode);
    if (/performing security verification|verify you are human|just a moment/i.test(response.body)) {
      throw new Error("The site requires browser verification; open it in Mangayomi WebView.");
    }
    return response.body;
  }

  async document(url) { return new Document(await this.request(url)); }
  attr(node, key) { return node ? node.attr(key) || "" : ""; }
  text(node) { return node ? node.text.trim() : ""; }

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
        imageUrl: this.absolute(this.attr(image, "data-src") || this.attr(image, "src")),
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
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      data = data.data || data.chapters || data.html || data;
      if (data && !Array.isArray(data) && typeof data === "object") {
        data = data.chapters || data.items || data.html || data.list || data;
      }
    }
    if (Array.isArray(data)) {
      for (const chapter of data) {
        const name = chapter.name || chapter.chapter_name || chapter.title || chapter.chapter;
        const slug = chapter.slug || chapter.chapter_slug || "";
        const path = chapter.url || chapter.link || (slug ? mangaUrl + "/" + slug : "");
        if (name && path) chapters.push({ name: String(name), url: this.absolute(path) });
      }
    } else if (typeof data === "string") {
      const doc = new Document(data);
      for (const link of doc.select(".chapter-list a[href], #chapter-list-container a[href]")) {
        const url = this.absolute(this.attr(link, "href"));
        if (url) chapters.push({ name: this.text(link), url });
      }
    }
    return chapters;
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
    let chapters = [];
    const apiTemplate = this.attr(container, "data-api-url");
    const slug = this.attr(container, "data-comic-slug") || link.split("/").pop();
    if (apiTemplate) {
      const endpoint = apiTemplate.replace("__SLUG__", encodeURIComponent(slug));
      try { chapters = this.parseChapters(await this.request(endpoint), link); }
      catch (error) { /* An inline chapter list may still be available. */ }
    }
    if (!chapters.length) {
      for (const item of doc.select("#chapter-list-container .chapter-list a[href]")) {
        chapters.push({ name: this.text(item), url: this.absolute(this.attr(item, "href")) });
      }
    }
    if (!chapters.length) {
      throw new Error("No chapters returned by the site. Its chapter API may be blocked or changed.");
    }
    return {
      name: title, link, description: summary.replace(/^.*?summary:\s*/i, ""),
      imageUrl: this.absolute(this.attr(cover, "src") || this.attr(cover, "data-src")),
      author: authorLine.split(":").slice(1).join(":").trim(), genre, status, chapters,
    };
  }

  async getPageList(url) {
    const doc = await this.document(url);
    const pages = [];
    for (const img of doc.select(".container-chapter-reader img")) {
      const src = this.attr(img, "data-src") || this.attr(img, "src");
      if (src && !/default_bat|404-avatar/i.test(src)) {
        pages.push({ url: this.absolute(src), headers: { Referer: this.root + "/" } });
      }
    }
    if (!pages.length) throw new Error("No reader images found. The site layout may have changed.");
    return pages;
  }
}
