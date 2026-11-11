const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const origin = 'https://www.therealreal.com';
const nav = [
  { href: origin + '/sales/shop-new-arrivals-5753?taxons%5B%5D=493', textContent: 'Bags' },
  { href: origin + '/sales/shop-new-arrivals-5753?taxons%5B%5D=494', textContent: 'Shoes' },
  { href: origin + '/sales/shop-new-arrivals-5753?taxons%5B%5D=495', textContent: 'Accessories' },
  { href: origin + '/sales/shop-new-arrivals-5753?taxons%5B%5D=1290', textContent: 'Clothing' }
];
function link(path) {
  return { href: origin + path, offsetParent: {}, closest() { return null; }, card: { path, style: {} } };
}
function root(paths = []) {
  const links = paths.map(link);
  return { links, querySelectorAll(selector) { return selector === 'a[href]' ? [...nav.map(anchor => ({ ...anchor, closest() { return null; } })), ...links] : []; }, querySelector() { return null; } };
}
function load(folder, path = '/sales/all-items', document = root()) {
  const context = vm.createContext({ URL, AbortController, crypto: webcrypto,
    console: { log() {}, warn() {} }, document,
    window: { location: new URL(origin + path), setTimeout() {}, clearTimeout() {} },
    chrome: { runtime: { onMessage: { addListener() {} } }, storage: { sync: { get() {} } } } });
  vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8'), context);
  vm.runInContext(fs.readFileSync(`${folder}/contentscript.js`, 'utf8'), context);
  context.getCardContainer = anchor => anchor.card;
  return context;
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: excluded sections and directly opened non-clothing products stay idle without checks, saves or grid changes`, async () => {
    const paths = ['/shop/women/handbags', '/shop/men/bags/backpacks', '/shop/women/shoes/boots',
      '/shop/women/accessories/belts', '/sales/womens%20bags', '/sales/mens-shoes',
      '/sales/women%27s%20accessories', '/sales/shop-new-arrivals-5753?taxons%5B%5D=493',
      '/sales/shop-new-arrivals-5753?taxons%5B%5D=494', '/sales/shop-new-arrivals-5753?taxons%5B%5D=495',
      '/products/women/handbags/crossbody-bags/coach-leather-crossbody-bag-xk1in',
      '/products/women/shoes/pumps/loewe-patent-leather-slingback-pumps-xj85h',
      '/products/women/accessories/belts/salvatore-ferragamo-leather-belt-xfrjc'];
    for (const path of paths) {
      const document = root(['/products/women/clothing/dresses/recommended-dress']);
      const context = load(folder, path, document);
      const calls = [];
      let status;
      context.watchForNavigation = () => calls.push('navigation');
      context.watchForNewProducts = () => calls.push('observer');
      context.extractMeasurements = () => { calls.push('extract'); return {}; };
      context.fetch = async () => { calls.push('fetch'); throw new Error('Must not fetch'); };
      context.filterProductCards = async () => calls.push('filter');
      context.saveCheckedListing = async () => calls.push('save');
      context.updateStatusBadge = message => { status = message; };
      await context.startMatcher({ waist: 28 });
      assert.deepEqual(calls, ['navigation'], path);
      assert.match(status, /idle.*bags, shoes, and accessories.*skipped/i);
      assert.equal(document.links[0].card.style.display, undefined, 'native grid stays intact');
      assert.equal(context.summarizeScan().checkedCount, 0);
      assert.equal(context.summarizeScan().undeterminedCount, 0);
    }
  });

  test(`${folder}: numeric category IDs are learned from local links and mixed clothing selections remain eligible`, () => {
    const context = load(folder);
    const document = root();
    const excluded = path => context.isExcludedSection(document, origin + path);
    assert.equal(excluded('/sales/new?taxons[]=493&taxons[]=495'), true);
    assert.equal(excluded('/sales/new?taxons[]=493&taxons[]=1290'), false);
    assert.equal(excluded('/sales/new?taxons[]=1290'), false);
    assert.equal(excluded('/sales/new?taxons[]=999'), false, 'unknown IDs are not guessed');
    assert.equal(excluded('/sales/new'), false, 'global menus alone do not exclude the page');
    const updated = { querySelectorAll() { return [{ href: origin + '/sales/new?taxons[]=12345', textContent: 'Shop All Shoes' }]; } };
    assert.equal(context.isExcludedSection(updated, origin + '/sales/new?taxons[]=12345'), true);
    assert.equal(context.isExcludedSection(updated, origin + '/sales/new?taxons[]=494'), false, 'no dependency on hardcoded IDs');
    const foreign = { querySelectorAll() { return [{ href: 'https://example.com/sales/new?taxons[]=1290', textContent: 'Bags' }]; } };
    assert.equal(context.isExcludedSection(foreign, origin + '/sales/new?taxons[]=1290'), false);
  });

  test(`${folder}: mixed results check clothing only, including clothing with bag/shoe words in its name`, async () => {
    const dress = '/products/women/clothing/dresses/bag-print-dress';
    const pants = '/products/men/clothing/pants/shoes-pattern-pants';
    const unknown = '/products/details/123456';
    const document = root([dress, '/products/women/handbags/totes/bag', pants,
      '/products/men/shoes/sneakers/pair', '/products/women/accessories/belts/belt', unknown]);
    const context = load(folder, '/sales/all-items', document);
    const fetched = [];
    const saved = [];
    let rendered;
    context.getProductDocument = async url => { fetched.push(url); return { itemWaist: 28 }; };
    context.extractMeasurements = value => value;
    context.saveCheckedListing = async url => saved.push(url);
    context.updateStatusBadge = () => {};
    context.findGridContainer = () => ({});
    context.reorganizeGrid = (grid, shown) => { rendered = Array.from(shown, card => card.path); };
    const result = await context.filterProductCards(context.buildMatcher({ waist: 28 }));
    assert.deepEqual(fetched.sort(), [dress, pants, unknown].map(path => origin + path).sort());
    assert.deepEqual(saved.sort(), fetched);
    assert.deepEqual(rendered, [dress, pants, unknown]);
    assert.deepEqual({ ...result.scan }, { checkedCount: 3, matchCount: 3, notMatchCount: 0, undeterminedCount: 0, uncheckedCount: 0 });
    assert.equal(context.isExcludedCategoryUrl(origin + '/sales/bags-and-dresses'), false);
    assert.equal(context.isExcludedCategoryUrl(origin + '/shop/women/clothing/dresses'), false);
  });

  test(`${folder}: automatic later-page search skips non-clothing product requests and observations`, async () => {
    const first = '/products/women/clothing/dresses/miss';
    const match = '/products/women/clothing/dresses/match';
    const context = load(folder, '/sales/all-items', root([first]));
    const later = root(['/products/women/handbags/totes/bag', '/products/women/shoes/boots/pair',
      '/products/women/accessories/belts/belt', match]);
    const fetched = [];
    const saved = [];
    context.document.next = origin + '/sales/all-items?page=2';
    context.getNextListingPageUrl = root => root.next || null;
    context.getProductDocument = async url => {
      fetched.push(url);
      return url.includes('page=2') ? later : { itemWaist: url.endsWith('/miss') ? 40 : 28 };
    };
    context.extractMeasurements = value => value;
    context.saveCheckedListing = async url => saved.push(url);
    context.updateStatusBadge = () => {};
    context.findGridContainer = () => ({});
    context.getOrCreateFilteredGridHost = () => ({});
    context.reorganizeGrid = () => {};
    context.cloneCardForFilteredGrid = card => card;
    context.absolutizeCardNode = () => {};
    const result = await context.filterProductCards(context.buildMatcher({ waist: 28 }));
    assert.deepEqual(fetched, [origin + first, origin + '/sales/all-items?page=2', origin + match]);
    assert.deepEqual(saved, [origin + first, origin + match]);
    assert.equal(result.scan.checkedCount, 2);
    assert.equal(result.scan.undeterminedCount, 0);
  });

  test(`${folder}: later-page search stops before fetching an excluded section`, async () => {
    const context = load(folder, '/sales/all-items', root(['/products/women/clothing/dresses/miss']));
    const fetched = [];
    context.document.next = origin + '/sales/shop-new-arrivals-5753?taxons[]=494&page=2';
    context.getNextListingPageUrl = root => root.next || null;
    context.getProductDocument = async url => { fetched.push(url); return { itemWaist: 40 }; };
    context.extractMeasurements = value => value;
    context.saveCheckedListing = async () => {};
    context.updateStatusBadge = () => {};
    context.findGridContainer = () => ({});
    context.getOrCreateFilteredGridHost = () => ({});
    context.reorganizeGrid = () => {};
    const result = await context.filterProductCards(context.buildMatcher({ waist: 28 }));
    assert.deepEqual(fetched, [origin + '/products/women/clothing/dresses/miss']);
    assert.equal(result.scan.notMatchCount, 1);
  });

  test(`${folder}: excluded sections still restart on navigation back to clothing`, () => {
    const context = load(folder, '/shop/women/shoes');
    let reloads = 0;
    context.window.addEventListener = () => {};
    context.window.setInterval = () => {};
    context.window.location.reload = () => { reloads++; };
    context.document.getElementById = () => null;
    const checkNavigation = context.watchForNavigation();
    context.window.location.href = origin + '/shop/women/clothing/dresses';
    checkNavigation();
    checkNavigation();
    assert.equal(reloads, 1);
    assert.equal(context.isExcludedSection(root(), context.window.location.href), false);
  });

  test(`${folder}: a generic sale containing only excluded product cards does not start a later-page scan`, async () => {
    const document = root(['/products/women/handbags/totes/bag', '/products/women/shoes/flats/pair',
      '/products/women/accessories/scarves/scarf']);
    const context = load(folder, '/sales/designer-event', document);
    let requests = 0;
    let saves = 0;
    let rendered = 0;
    context.fetch = async () => { requests++; throw new Error('Must not fetch'); };
    context.getNextListingPageUrl = () => origin + '/sales/designer-event?page=2';
    context.saveCheckedListing = async () => { saves++; };
    context.reorganizeGrid = () => { rendered++; };
    context.updateStatusBadge = () => {};
    assert.equal(await context.filterProductCards(context.buildMatcher({ waist: 28 })), false);
    assert.equal(requests, 0);
    assert.equal(saves, 0);
    assert.equal(rendered, 0);
  });
}
