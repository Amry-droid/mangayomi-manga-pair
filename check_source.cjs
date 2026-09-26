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
const newestChapter = element('Newest Chapter', { href: '/manga/example/chapter-3' });

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
      '.manga-info-text li': [element('Author(s) : Example'), element('Status : Ongoing')],
      '.manga-info-text .genres a': [element('Action')],
      '#chapter-list-container .chapter-list a[href]': [chapter3],
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
    if (url.includes('/api/manga/')) body = JSON.stringify({
      data: { chapters: { items: [
        { chapter_number: 3, chapter_url: '/manga/example/chapter-3' },
        { chapter_number: 2, chapter_url: '/manga/example/chapter-2' },
      ] } },
    });
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
    assert.equal(detail.chapters.length, 3);
    assert.equal(detail.chapters[0].url, base + '/manga/example/chapter-3');
    assert.equal(detail.chapters[2].url, base + '/manga/example/chapter-1');
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
