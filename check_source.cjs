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

const cover = element('', { src: 'https://img.example/cover.webp' });
const title = element('Example Manga', { href: '/manga/example' });
const listingCard = element('', {}, {
  "h3 a[href*='/manga/']": [title], img: [cover],
});
const next = element('2', { href: '/manga-list/hot-manga?page=2' });
const chapter = element('Chapter 1', { href: '/manga/example/chapter-1' });

class Document {
  constructor(body) { this.body = body; }
  select(selector) {
    if (this.body.includes('class="chapter-list"')) return ({
      '.chapter-list a[href], #chapter-list-container a[href]': [chapter],
    })[selector] || [];
    if (this.body === 'LIST') return ({
      '.list-comic-item-wrap': [listingCard], 'a[href]': [next],
    })[selector] || [];
    if (this.body === 'DETAIL') return ({
      '.manga-info-text li': [element('Author(s) : Example'), element('Status : Ongoing')],
      '.manga-info-text .genres a': [element('Action')],
      '#chapter-list-container .chapter-list a[href]': [chapter],
    })[selector] || [];
    if (this.body === 'PAGES') return ({
      '.container-chapter-reader img': [element('', {src:'https://img.example/1.webp'})],
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
      data: { html: '<div class="chapter-list"><a href="/manga/example/chapter-1">Chapter 1</a></div>' },
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
    assert.equal(popular.hasNextPage, true);
    const detail = await ext.getDetail('/manga/example');
    assert.equal(detail.status, 0);
    assert.equal(detail.name, 'Example Manga');
    assert.equal(detail.genre[0], 'Action');
    assert.equal(detail.chapters[0].url, base + '/manga/example/chapter-1');
    const pages = await ext.getPageList(detail.chapters[0].url);
    assert.equal(pages[0].url, 'https://img.example/1.webp');
    assert.equal(pages[0].headers.Referer, base + '/');
    console.log(file + ': smoke test passed');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
