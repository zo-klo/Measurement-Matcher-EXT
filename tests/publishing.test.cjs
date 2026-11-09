const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function load(folder) {
  const context = vm.createContext({ URL, AbortController, crypto: webcrypto,
    console: { log() {}, warn() {} },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 },
    document: {}, window: { location: new URL('https://www.therealreal.com/sales/test'), setTimeout() {}, clearTimeout() {} },
    chrome: { storage: { sync: { get() {} } }, runtime: { onMessage: { addListener() {} } } } });
  vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8'), context);
  vm.runInContext(fs.readFileSync(`${folder}/contentscript.js`, 'utf8'), context);
  return context;
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: copied markup always passes through native sanitization when available`, () => {
    const context = load(folder);
    const safeCard = { style: { removeProperty() {} } };
    let sanitized;
    context.document.createElement = () => ({ firstElementChild: safeCard,
      setHTML(markup, options) { sanitized = { markup, options }; } });
    const markup = '<article onclick="attack()"><script>attack()</script><a href="/products/one">Product</a></article>';
    assert.equal(context.cloneCardForFilteredGrid({ outerHTML: markup }), safeCard);
    assert.equal(sanitized.markup, markup);
    assert.ok(Array.from(sanitized.options.sanitizer.removeElements).includes('button'));
  });
  test(`${folder}: fallback cards use text/DOM only and reject script links and image URLs`, () => {
    const context = load(folder);
    function element(tag) {
      const node = { tag, children: [], style: { removeProperty() {} }, appendChild(child) { this.children.push(child); } };
      Object.defineProperty(node, 'innerHTML', { set() { throw new Error('Raw HTML is forbidden'); } });
      return node;
    }
    context.document.createElement = element;
    const card = { nodeType: 1, matches() { return false; }, childNodes: [{ nodeType: 3, textContent: 'Product <script>as plain text</script>' }],
      querySelectorAll() { return [{ getAttribute() { return 'javascript:attack()'; } }, { getAttribute() { return '/products/women/clothing/dresses/safe'; } }]; },
      querySelector() { return { getAttribute(name) { return name === 'src' ? 'javascript:attack()' : 'Product'; } }; } };
    const clone = context.cloneCardForFilteredGrid(card);
    const link = clone.children[0];
    assert.equal(link.href, 'https://www.therealreal.com/products/women/clothing/dresses/safe');
    assert.equal(link.children.length, 1, 'unsafe image was omitted');
    assert.equal(link.children[0].tag, 'p');
    assert.equal(link.children[0].textContent, 'Product <script>as plain text</script>');
  });
  test(`${folder}: progress paints coalesce to the latest frame and do not update an old search`, () => {
    const context = load(folder);
    const frames = [];
    const painted = [];
    context.window.requestAnimationFrame = callback => { frames.push(callback); };
    context.paintStatusBadge = (text, model) => painted.push([text, model]);
    context.updateStatusBadge('first', { count: 1 });
    context.updateStatusBadge('latest', { count: 2 });
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(painted.length, 1);
    assert.equal(painted[0][0], 'latest');
    context.updateStatusBadge('stale');
    context.window.location.href = 'https://www.therealreal.com/sales/other';
    frames.shift()();
    assert.equal(painted.length, 1);
  });
  test(`${folder}: grid paints are batched and rapid page changes cannot render an earlier page`, () => {
    const context = load(folder);
    const frames = [];
    const painted = [];
    context.window.requestAnimationFrame = callback => { frames.push(callback); };
    context.paintGrid = (grid, cards) => painted.push(cards);
    context.reorganizeGrid({}, ['page 1'], []);
    context.reorganizeGrid({}, ['page 2'], []);
    frames.forEach(callback => callback());
    assert.equal(painted.length, 1);
    assert.deepEqual(painted[0], ['page 2']);
  });
  test(`${folder}: next links and document fetches cannot escape the source origin`, async () => {
    const context = load(folder);
    const document = { querySelector() { return { getAttribute() { return 'https://example.com/?page=2'; } }; }, querySelectorAll() { return []; } };
    assert.equal(context.getNextListingPageUrl(document, context.window.location.href), null);
    let requests = 0;
    context.fetch = async () => { requests++; };
    await assert.rejects(context.fetchDocument('https://example.com/products/one'), /same-origin/);
    assert.equal(requests, 0);
  });
}
