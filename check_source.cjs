// Small offline smoke test of the Mangayomi callbacks and response shapes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(text = '', attributes = {}, selectors = {}) {
  return {
    text,
    attr: name => attributes[name] || '',
    select: name => selectors[name] || [],
    selectFirst: name => (selectors[name] || [])[0] || null,
  };
}

const cover = element('', {
  src: 'data:image/gif;base64,placeholder',
  'data-src': 'https://img.example/cover.webp',
});
const title = element('Example Manga', { href: '/manga/example' });
const listingCard = element('', {}, {
  "h3 a[href*='/manga/']": [title], img: [cover],
});
const next = element('2', { href: '/manga-list/hot-manga?page=2' });
const chapter1 = element('Chapter 1', { href: '/manga/example/chapter-1' });
const chapter2 = element('Chapter 2', { href: '/manga/example/chapter-2' });
const chapter3 = element('Chapter 3', { href: '/manga/example/chapter-3' });
const startReading = element('Start Reading', { href: '/manga/example/chapter-1' });
const newestChapter = element('Newest Chapter', { href: '/manga/example/chapter-89' });
const row2 = element('', {}, {
  'a[href]': [chapter2],
  span: [element('Chapter 2'), element('100'), element('08-24 23:56')],
});
const row3 = element('', {}, {
  'a[href]': [chapter3],
  span: [element('Chapter 3'), element('120'), element('08-25 00:35')],
});

class Document {
  constructor(body) { this.body = body; }
  select(selector) {
    if (this.body.includes('class="chapter-list"')) return ({
      ".chapter-list a[href], #chapter-list-container a[href], a[href*='/chapter-']": [chapter3, chapter2],
    })[selector] || [];
    if (this.body === 'LIST') return ({
      '.list-comic-item-wrap': [listingCard], 'a[href]': [next],
    })[selector] || [];
    if (this.body === 'DETAIL') return ({
      '.manga-info-text li': [element('Author(s) : Example'), element('Status : Ongoing'),
        element('Last updated : Aug-25-2025 04:35:19 AM')],
      '.manga-info-text .genres a': [element('Action')],
      '#chapter-list-container .chapter-list a[href]': [chapter3],
      '#chapter-list-container .chapter-list .row': [row3],
      '.read-chapter a[href]': [startReading, newestChapter],
    })[selector] || [];
    if (this.body === 'PAGES') return ({
      '.container-chapter-reader img': [element('', {
        src: 'data:image/gif;base64,placeholder',
        'data-src': 'https://img.example/1.webp',
      })],
    })[selector] || [];
    return [];
  }
  selectFirst(selector) {
    if (this.body === 'DETAIL') return ({
      '.manga-info-text h1': element('Example Manga'),
      '.manga-info-pic img': cover,
      '#contentBox': element('Example Manga summary: A story.'),
      '#chapter-list-container': element('', {
        'data-comic-slug': 'example',
        'data-api-url': 'https://www.mangabats.com/api/manga/__SLUG__/chapters',
      }),
    })[selector] || null;
    return null;
  }
}

class Client {
  async get(url) {
    let body = 'LIST';
    if (url.includes('/api/manga/')) {
      const offsetMatch = url.match(/[?&]offset=(\d+)/);
      const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
      const allChapters = /[?&]limit=-1(?:&|$)/.test(url);
      const first = allChapters || offset === 0 ? 89 : 39;
      const last = allChapters ? 1 : offset === 0 ? 40 : 1;
      const chapters = [];
      for (let number = first; number >= last; number--) chapters.push({
        chapter_name: 'Chapter ' + number,
        chapter_slug: 'chapter-' + number,
        chapter_num: number,
        updated_at: new Date(Date.UTC(2025, 0, 1) + number * 86400000).toISOString(),
      });
      body = JSON.stringify({ data: { chapters, pagination: {
        total: 89, limit: allChapters ? -1 : 500, offset,
        ...(allChapters ? {} : { has_more: offset === 0 }),
      } } });
    }
    else if (url.includes('/manga/example/chapter-')) body = 'PAGES';
    else if (url.includes('/manga/example')) body = 'DETAIL';
    return { statusCode: 200, body };
  }
}

for (const [file, base] of [
  ['mangabat.js', 'https://www.mangabats.com'],
  ['mangakakalot.js', 'https://www.mangakakalot.gg'],
]) {
  const script = fs.readFileSync(__dirname + '/extensions/' + file, 'utf8');
  const context = vm.createContext({ MProvider: class {}, Document, Client });
  const Extension = vm.runInContext(script + '\nDefaultExtension', context);
  const ext = new Extension();
  ext.source = { baseUrl: base };
  (async () => {
    const popular = await ext.getPopular(1);
    assert.equal(popular.list[0].name, 'Example Manga');
    assert.equal(popular.list[0].imageUrl, 'https://img.example/cover.webp');
    assert.equal(popular.hasNextPage, true);
    const detail = await ext.getDetail('/manga/example');
    assert.equal(detail.status, 0);
    assert.equal(detail.name, 'Example Manga');
    assert.equal(detail.imageUrl, 'https://img.example/cover.webp');
    assert.equal(detail.genre[0], 'Action');
    assert.equal(detail.chapters.length, 89);
    assert.equal(detail.chapters[0].url, base + '/manga/example/chapter-89');
    assert.equal(detail.chapters[88].url, base + '/manga/example/chapter-1');
    assert.ok(detail.chapters.every(chapter => chapter.dateUpload),
      'every paginated chapter should keep its real release date');
    assert.equal(new Date(Number(detail.chapters[0].dateUpload)).getFullYear(), 2025);
    assert.equal(new Date(Number(detail.chapters[1].dateUpload)).getFullYear(), 2025);
    const isoDate = ext.parseDate('2025-08-25T00:35:00Z');
    assert.equal(isoDate, String(new Date('2025-08-25T00:35:00Z').getTime()));
    assert.equal(ext.parseDate(isoDate), isoDate);
    assert.equal(ext.parseDate(null), '');
    const newYearAnchor = ext.parseDate(ext.normalizeDate('Jan-02-2025 04:00:00 AM'));
    const previousYear = ext.parseDate(ext.normalizeDate('12-31 23:00', newYearAnchor));
    assert.equal(new Date(Number(previousYear)).getFullYear(), 2024);
    assert.equal(ext.parseDate(ext.normalizeDate('1756082100')), '1756082100000');
    assert.equal(ext.parseDate('2025-08-25T07:35:19.000000Z'),
      String(new Date('2025-08-25T07:35:19Z').getTime()));
    const longBounds = {
      select: selector => selector === '.read-chapter a[href]' ? [
        element('Start Reading', { href: '/manga/long/chapter-1' }),
        element('Newest Chapter', { href: '/manga/long/chapter-215' }),
      ] : [],
    };
    const complete = ext.completeChapterRange([
      { name: 'Chapter 215', url: base + '/manga/long/chapter-215' },
      { name: 'Chapter 192.5', url: base + '/manga/long/chapter-192-5' },
      { name: 'Chapter 167', url: base + '/manga/long/chapter-167' },
    ], longBounds, base + '/manga/long');
    assert.equal(complete.length, 216);
    assert.equal(complete[0].name, 'Chapter 215');
    assert.equal(complete.at(-1).name, 'Chapter 1');
    const pages = await ext.getPageList(detail.chapters[0].url);
    assert.equal(pages[0].url, 'https://img.example/1.webp');
    assert.equal(pages[0].headers.Referer, base + '/');
    assert.equal(ext.getHeaders(pages[0].url).Referer, base + '/');
    console.log(file + ': smoke test passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
