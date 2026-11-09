const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const searchUrl = 'https://www.therealreal.com/sales/dresses';
const productUrl = id => `https://www.therealreal.com/products/${id}`;

function fixture(folder, ids) {
  const nodes = new Map();
  const pagination = { style: {} };
  function node() {
    return { style: {}, textContent: '', disabled: false,
      addEventListener(type, callback) { this[type] = callback; },
      insertAdjacentElement(position, child) { nodes.set(child.id, child); },
      attachShadow() {
        const children = new Map();
        this.shadowRoot = { querySelector(selector) {
          if (!children.has(selector)) children.set(selector, node());
          return children.get(selector);
        } };
        return this.shadowRoot;
      },
      remove() { nodes.delete(this.id); }
    };
  }
  const document = { next: null, createElement: node,
    getElementById: id => nodes.get(id),
    querySelectorAll: () => [pagination] };
  const context = vm.createContext({ URL, AbortController, crypto: webcrypto,
    console: { log() {}, warn() {} }, document,
    window: { location: new URL(searchUrl), setTimeout() {}, clearTimeout() {}, addEventListener() {}, setInterval() {} },
    chrome: { storage: { sync: { get() {} } }, runtime: { onMessage: { addListener() {} } } } });
  vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8'), context);
  vm.runInContext(fs.readFileSync(`${folder}/contentscript.js`, 'utf8'), context);
  const cards = values => values.map(id => ({ url: productUrl(id), card: { id } }));
  const current = cards(ids);
  const grid = node();
  const host = node();
  host.id = 'fit-extension-grid-host';
  nodes.set('fit-extension-grid-host', host);
  const rendered = [];
  const requests = [];
  const saves = [];
  const statuses = [];
  context.findProductLinkCards = root => root.cards || current;
  context.findGridContainer = () => grid;
  context.getOrCreateFilteredGridHost = () => host;
  context.reorganizeGrid = (grid, shown) => { rendered.push(Array.from(shown, card => card.id)); };
  context.getNextListingPageUrl = root => root.next || null;
  context.cloneCardForFilteredGrid = card => ({ ...card });
  context.absolutizeCardNode = () => {};
  context.extractMeasurements = root => root;
  context.getProductDocument = async url => { requests.push(url); return { itemWaist: 28 }; };
  context.saveCheckedListing = async url => { saves.push(url); };
  context.updateStatusBadge = (text, model) => statuses.push({ text, model });
  return { context, document, pagination, nodes, cards, rendered, requests, saves, statuses,
    matcher: context.buildMatcher({ waist: 28, waistSmaller: 0.25, waistLarger: 1.5 }),
    control: selector => nodes.get('fit-extension-results-controls').shadowRoot.querySelector(selector) };
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: 0 and 10 matches have real page totals and no Next page`, async () => {
    for (const count of [0, 10]) {
      const f = fixture(folder, Array.from({ length: 10 }, (_, i) => i));
      f.context.getProductDocument = async () => ({ itemWaist: count ? 28 : 40 });
      await f.context.filterProductCards(f.matcher);
      assert.equal(f.control('.page').textContent, `Results page ${count ? 1 : 0} of ${count ? 1 : 0}`);
      assert.equal(f.control('.summary').textContent, `${count} matching listings found`);
      assert.equal(f.control('.previous').disabled, true);
      assert.equal(f.control('.next').disabled, true);
      assert.equal(f.control('.more').disabled, true);
      assert.equal(f.pagination.style.display, 'none', 'unfiltered TRR pagination is hidden');
      assert.equal(f.rendered.at(-1).length, count);
    }
  });

  test(`${folder}: Next and Previous show distinct 24-item slices without checking products again`, async () => {
    const f = fixture(folder, Array.from({ length: 49 }, (_, i) => i));
    await f.context.filterProductCards(f.matcher);
    assert.equal(f.control('.page').textContent, 'Results page 1 of 3');
    assert.deepEqual(f.rendered.at(-1), Array.from({ length: 24 }, (_, i) => i));
    f.control('.next').click();
    assert.equal(f.control('.page').textContent, 'Results page 2 of 3');
    assert.deepEqual(f.rendered.at(-1), Array.from({ length: 24 }, (_, i) => i + 24));
    await f.context.filterProductCards(f.matcher);
    assert.equal(f.control('.page').textContent, 'Results page 2 of 3', 'DOM reruns preserve the selected page');
    f.control('.next').click();
    assert.deepEqual(f.rendered.at(-1), [48]);
    assert.equal(f.control('.next').disabled, true);
    f.control('.next').click();
    assert.deepEqual(f.rendered.at(-1), [48], 'cannot advance beyond the checked pool');
    f.control('.previous').click();
    assert.deepEqual(f.rendered.at(-1), Array.from({ length: 24 }, (_, i) => i + 24));
    assert.equal(f.requests.length, 49);
    assert.equal(f.saves.length, 49);
  });

  test(`${folder}: Find more resumes its pending source page and deduplicates already shown products`, async () => {
    const f = fixture(folder, Array.from({ length: 10 }, (_, i) => i));
    const next = searchUrl + '?page=2';
    f.document.next = next;
    const later = f.cards(Array.from({ length: 30 }, (_, i) => i + 10));
    later.unshift({ url: productUrl(0) + '?tracking=duplicate', card: { id: 0 } });
    f.context.getProductDocument = async url => {
      f.requests.push(url);
      return url === next ? { cards: later } : { itemWaist: 28 };
    };
    await f.context.filterProductCards(f.matcher);
    assert.equal(f.control('.more').disabled, false);
    await f.context.findMoreMatches();
    assert.equal(f.control('.summary').textContent, '34 matching listings found');
    assert.equal(f.control('.page').textContent, 'Results page 1 of 2');
    f.control('.next').click();
    assert.deepEqual(f.rendered.at(-1), Array.from({ length: 10 }, (_, i) => i + 24));
    await f.context.findMoreMatches();
    assert.equal(f.control('.summary').textContent, '40 matching listings found');
    assert.equal(f.control('.page').textContent, 'Results page 2 of 2');
    assert.deepEqual(f.rendered.at(-1), Array.from({ length: 16 }, (_, i) => i + 24));
    assert.equal(f.control('.more').disabled, true);
    assert.equal(f.requests.filter(url => url === next).length, 1, 'resume without fetching page 2 again');
    assert.equal(f.requests.length, 41, 'one source page request plus 40 unique garment checks');
    assert.equal(f.saves.length, 40);
    await f.context.filterProductCards(f.matcher);
    assert.equal(f.control('.summary').textContent, '40 matching listings found');
    assert.equal(f.saves.length, 40);
  });

  test(`${folder}: automatic first match leaves the rest of the source page for Find more`, async () => {
    const f = fixture(folder, ['miss']);
    const next = searchUrl + '?page=2';
    f.document.next = next;
    f.context.getProductDocument = async url => {
      f.requests.push(url);
      return url === next ? { cards: f.cards(Array.from({ length: 30 }, (_, i) => i)) }
        : { itemWaist: url.endsWith('/miss') ? 40 : 28 };
    };
    await f.context.filterProductCards(f.matcher);
    assert.deepEqual(f.rendered.at(-1), [0]);
    await f.context.findMoreMatches();
    assert.equal(f.control('.summary').textContent, '25 matching listings found');
    f.control('.next').click();
    assert.deepEqual(f.rendered.at(-1), [24]);
    await f.context.findMoreMatches();
    assert.deepEqual(f.rendered.at(-1), [24, 25, 26, 27, 28, 29]);
    assert.equal(f.control('.more').disabled, true);
    assert.equal(f.requests.filter(url => url === next).length, 1);
    assert.equal(f.saves.length, 31);
  });

  test(`${folder}: search/sort/source-page navigation aborts old requests and reloads once; hashes do not`, async () => {
    for (const destination of [searchUrl + '?page=2', searchUrl + '?sort=price', 'https://www.therealreal.com/sales/tops']) {
      const f = fixture(folder, [0]);
      let reloads = 0;
      let resolve;
      let signal;
      f.context.window.location.reload = () => { reloads++; };
      f.context.fetch = (url, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); };
      f.context.DOMParser = class { parseFromString() { return { itemWaist: 28 }; } };
      // Use the real request/cancellation path, rather than the fixture's product loader.
      f.context.getProductDocument = url => f.context.fetchDocument(url);
      const checkNavigation = f.context.watchForNavigation();
      const checking = f.context.filterProductCards(f.matcher);
      f.context.window.location.hash = '#filters';
      checkNavigation();
      assert.equal(reloads, 0);
      f.context.window.location.href = destination;
      checkNavigation();
      checkNavigation();
      assert.equal(reloads, 1);
      assert.equal(signal.aborted, true);
      assert.equal(f.nodes.has('fit-extension-grid-host'), false);
      resolve({ ok: true, status: 200, text: async () => 'old product response' });
      assert.equal(await checking, false);
      assert.equal(f.saves.length, 0, 'late response cannot save under the changed search');
      assert.equal(f.rendered.length, 0, 'old cards never render on the changed route');
      assert.equal(f.context.summarizeScan().checkedCount, 0);
    }
  });
}
