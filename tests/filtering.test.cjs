const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

// A small DOM fixture representing detached DOMParser documents (no innerText).
// textContent includes script contents, just as it does in Chrome.
function text(value) { return { nodeType: 3, textContent: value }; }
function element(tag, children = [], attrs = {}) {
  const node = { nodeType: 1, childNodes: children, hidden: attrs.hidden || false,
    getAttribute(name) { return attrs[name] ?? null; },
    matches(selector) { return selector.split(',').some(t => t.trim() === tag); },
    querySelectorAll(selector) {
      const descendants = children.flatMap(child => child.nodeType === 1 ? [child, ...child.querySelectorAll('*')] : []);
      if (selector === '*') return descendants;
      if (selector === '.product-details-group li') return descendants.filter(n => n.details);
      return [];
    }
  };
  Object.defineProperty(node, 'textContent', { get() { return children.map(child => child.textContent).join(''); } });
  return node;
}
function product(bust, waist, withDetails = false) {
  const measurements = element('section', [element('p', [text(`Bust: ${bust} inches`)]),
    element('p', [text(`Waist: ${waist} inches`)])]);
  const detail = element('li', [text(`Bust: ${bust} inches Waist: ${waist} inches`)]);
  detail.details = true;
  const body = element('body', [
    element('script', [text('window.analytics = { bust: 1, waist: 2 };')]),
    element('style', [text('.bust: 3 { display: none; }')]),
    element('template', [text('Bust: 4')]),
    withDetails ? detail : measurements
  ]);
  return { body, querySelectorAll: body.querySelectorAll };
}
function load(folder) {
  const context = vm.createContext({ console: { log() {}, warn() {} }, URL, crypto: webcrypto, AbortController,
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
    document: {},
    window: { setTimeout() {}, clearTimeout() {}, location: new URL('https://www.therealreal.com/sales/test') },
    chrome: { runtime: { onMessage: { addListener() {} } }, storage: { sync: { get() {} } } } });
  vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8'), context);
  vm.runInContext(fs.readFileSync(`${folder}/contentscript.js`, 'utf8'), context);
  return context;
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: main product/component attributes supply hip, front rise and leg opening without borrowing other data`, () => {
    const context = load(folder);
    const main = { attributes: [
      { type: 'hips', label: 'Hips', measurement: true, values: ['39.5"'] },
      { type: 'back_rise', label: 'Back Rise', measurement: true, values: ['18"'] },
      { type: 'rise', label: 'Rise', measurement: true, values: ['10"'] }
    ], components: [{ attributes: [
      { type: 'front_rise', label: 'Front Rise', measurement: true, values: ['10.25"'] },
      { type: 'leg_opening', label: 'Leg Opening', measurement: true, values: ['14.75"'] }
    ] }], sizeGuide: { hip: 100, rise: 99, legOpening: 98 }, recommendations: [{ attributes: [
      { type: 'hip', measurement: true, values: ['100"'] }
    ] }] };
    const root = { querySelector() { return { textContent: JSON.stringify({ props: { pageProps: { product: main } } }) }; } };
    const values = context.extractMeasurements(root);
    assert.equal(values.itemHip, 39.5);
    assert.equal(values.itemRise, 10.25);
    assert.equal(values.itemLegOpening, 14.75, 'listing value is preserved, never doubled');
    main.attributes = [{ type: 'back_rise', measurement: true, values: ['18"'] }, { type: 'hip', measurement: false, values: ['100"'] }];
    main.components = [];
    const missing = context.extractMeasurements(root);
    assert.equal(missing.itemHip, null);
    assert.equal(missing.itemRise, null, 'back rise is not front/unspecified rise');
    assert.equal(missing.itemLegOpening, null);
  });
  test(`${folder}: legacy hip/rise/opening labels exclude recommendations, size charts and back rise`, () => {
    const context = load(folder);
    const unrelated = element('aside', [text('Hip: 100 Rise: 99 Leg Opening: 98')]);
    unrelated.matches = selector => selector.includes('recommend');
    const body = element('body', [unrelated, element('p', [text('Hips: 39.5 inches Back Rise: 18 inches Front Rise: 10.25 inches Leg Opening: 14.75 inches')])]);
    const root = { body, querySelectorAll: () => [] };
    const values = context.extractMeasurements(root);
    assert.equal(values.itemHip, 39.5);
    assert.equal(values.itemRise, 10.25);
    assert.equal(values.itemLegOpening, 14.75);
    root.body = element('body', [unrelated, element('p', [text('Back Rise: 18 inches')])]);
    const missing = context.extractMeasurements(root);
    assert.equal(missing.itemHip, null);
    assert.equal(missing.itemRise, null);
    assert.equal(missing.itemLegOpening, null);
  });
  test(`${folder}: mixed current/later grids apply new measurements by category and persist matching-consistent observations`, async () => {
    const context = load(folder);
    const stored = {};
    context.chrome.storage.local = { async set(values) { Object.assign(stored, values); }, async get() { return stored; } };
    vm.runInContext(fs.readFileSync(`${folder}/checked-listings.js`, 'utf8'), context);
    const cases = {
      dress: ['dresses', 36, 39.5, 100, 100], wrongHip: ['dresses', 36, 40.501, null, null],
      jeans: ['jeans', null, 39.5, 10.25, 14.75], wrongRise: ['pants', null, 39.5, 11.501, 15],
      wrongOpening: ['jeans', null, 39.5, 10, 16.501], missingOptional: ['pants', null, null, null, null],
      top: ['tops', 36, 39.5, 100, 100], missingBust: ['dresses', null, 39.5, null, null],
      later: ['trousers', null, 39.5, 10.25, 14.75]
    };
    const card = id => ({ url: `https://www.therealreal.com/products/women/clothing/${cases[id][0]}/${id}`, card: { id } });
    const current = Object.keys(cases).filter(id => id !== 'later').map(card);
    const laterUrl = 'https://www.therealreal.com/sales/test?page=2';
    context.document.next = laterUrl;
    context.findProductLinkCards = root => root.cards || current;
    context.getNextListingPageUrl = root => root.next || null;
    context.getProductDocument = async address => {
      if (address === laterUrl) return { cards: [card('later')] };
      const [, bust, hip, rise, opening] = cases[address.split('/').pop()];
      const attributes = [['Waist', 28], ['Bust', bust], ['Hip', hip], ['Rise', rise], ['Leg Opening', opening]]
        .filter(([, value]) => value !== null).map(([label, value]) => ({ label, measurement: true, values: [String(value) + '"'] }));
      const root = product(bust, 28);
      root.querySelector = selector => selector === 'script#__NEXT_DATA__' ? { textContent: JSON.stringify({ props: { pageProps: { product: { attributes } } } }) } : null;
      return root;
    };
    let shown;
    context.findGridContainer = () => ({});
    context.getOrCreateFilteredGridHost = () => ({});
    context.reorganizeGrid = (grid, cards) => { shown = Array.from(cards, card => card.id); };
    context.cloneCardForFilteredGrid = card => card;
    context.absolutizeCardNode = () => {};
    context.updateStatusBadge = () => {};
    await context.filterProductCards(context.buildMatcher({ waist: 28, bust: 36, hip: 39, hipSmaller: 0.25, hipLarger: 1.5,
      rise: 10, riseSmaller: 0.25, riseLarger: 1.5, legOpening: 15, legOpeningSmaller: 0.25, legOpeningLarger: 1.5 }));
    assert.deepEqual(shown, ['dress', 'jeans', 'missingOptional', 'top', 'missingBust']);
    assert.deepEqual({ ...context.summarizeScan() }, { checkedCount: 8, matchCount: 5, notMatchCount: 3, undeterminedCount: 0, uncheckedCount: 0 });
    await context.findMoreMatches();
    assert.deepEqual(shown, ['dress', 'jeans', 'missingOptional', 'top', 'missingBust', 'later']);
    const rows = await vm.runInContext('CheckedListings.all()', context);
    const jeans = rows.find(row => row.product_url.endsWith('/jeans'));
    assert.equal(jeans.hip_difference, 0.5);
    assert.equal(jeans.rise_difference, 0.25);
    assert.equal(jeans.leg_opening_difference, -0.25);
    assert.equal(jeans.hip_applied, true);
    assert.equal(jeans.rise_applied, true);
    assert.equal(jeans.leg_opening_applied, true);
    const dress = rows.find(row => row.product_url.endsWith('/dress'));
    assert.equal(dress.hip_applied, true);
    assert.equal(dress.rise_applied, false);
    assert.equal(dress.leg_opening_applied, false);
    assert.equal(rows.length, 9);
    assert.equal(rows.filter(row => row.result === 'match').length, context.summarizeScan().matchCount);
  });
  test(`${folder}: dress inseam is irrelevant in mixed grids, later pages, and persisted CSV results`, async () => {
    const context = load(folder);
    const stored = {};
    context.chrome.storage.local = { async set(values) { Object.assign(stored, values); }, async get() { return stored; } };
    vm.runInContext(fs.readFileSync(`${folder}/checked-listings.js`, 'utf8'), context);
    const cases = {
      noInseam: ['dresses', 28, 36, null], reportedInseam: ['dresses', 28, 36, 1],
      wrongWaist: ['dresses', 40, 36, 1], missingBust: ['dresses', 28, null, 1],
      wrongJeans: ['jeans', 28, null, 1], wrongJumpsuit: ['jumpsuits', 28, 36, 1],
      laterDress: ['dresses', 28, 36, 100]
    };
    const card = id => ({ url: `https://www.therealreal.com/products/women/clothing/${cases[id][0]}/${id}`, card: { id } });
    const current = Object.keys(cases).filter(id => id !== 'laterDress').map(card);
    const laterUrl = 'https://www.therealreal.com/sales/test?page=2';
    context.document.next = laterUrl;
    context.findProductLinkCards = root => root.cards || current;
    context.getNextListingPageUrl = root => root.next || null;
    context.getProductDocument = async address => {
      if (address === laterUrl) return { cards: [card('laterDress')] };
      const [, waist, bust, inseam] = cases[address.split('/').pop()];
      const root = product(bust, waist);
      const attributes = [['Waist', waist], ['Bust', bust], ['Inseam', inseam]].filter(([, value]) => value !== null)
        .map(([label, value]) => ({ label, type: label.toLowerCase(), measurement: true, values: [String(value) + '"'] }));
      root.querySelector = selector => selector === 'script#__NEXT_DATA__' ? { textContent: JSON.stringify({ props: { pageProps: { product: { attributes } } } }) } : null;
      return root;
    };
    let shown;
    context.findGridContainer = () => ({});
    context.getOrCreateFilteredGridHost = () => ({});
    context.reorganizeGrid = (grid, cards) => { shown = Array.from(cards, card => card.id); };
    context.cloneCardForFilteredGrid = card => card;
    context.absolutizeCardNode = () => {};
    context.updateStatusBadge = () => {};
    const matcher = context.buildMatcher({ waist: 28, bust: 36, inseam: 30 });
    const result = await context.filterProductCards(matcher);
    assert.deepEqual(shown, ['noInseam', 'reportedInseam', 'missingBust']);
    assert.deepEqual({ ...result.scan }, { checkedCount: 6, matchCount: 3, notMatchCount: 3, undeterminedCount: 0, uncheckedCount: 0 });
    await context.findMoreMatches();
    assert.deepEqual(shown, ['noInseam', 'reportedInseam', 'missingBust', 'laterDress']);
    const rows = await vm.runInContext('CheckedListings.all()', context);
    const dress = rows.find(row => row.product_url.endsWith('/reportedInseam'));
    assert.equal(dress.result, 'match');
    assert.equal(dress.garment_inseam, 1, 'raw observation is preserved');
    assert.equal(dress.user_inseam, 30, 'saved preference is preserved');
    assert.equal(dress.inseam_applied, false);
    assert.equal(dress.bust_applied, true);
    assert.equal(rows.find(row => row.product_url.endsWith('/missingBust')).result, 'match');
    assert.equal(rows.find(row => row.product_url.endsWith('/wrongJeans')).inseam_applied, true);
    assert.equal(rows.find(row => row.product_url.endsWith('/laterDress')).inseam_applied, false);
    assert.equal(rows.filter(row => row.result === 'match').length, context.summarizeScan().matchCount);
  });
  test(`${folder}: directly opened dresses ignore reported inseam while jumpsuits still use it`, async () => {
    for (const [category, expected] of [['dresses', 'match'], ['jumpsuits', 'not match']]) {
      const context = load(folder);
      context.window.location = new URL(`https://www.therealreal.com/products/women/clothing/${category}/item`);
      context.document = product(36, 28);
      context.extractMeasurements = () => ({ itemBust: 36, itemWaist: 28, itemInseam: 1 });
      context.watchForNavigation = () => {};
      let saved;
      context.saveCheckedListing = async (url, root, result) => { saved = result; };
      context.showProductPageResult = () => {};
      await context.startMatcher({ waist: 28, bust: 36, inseam: 30 });
      assert.equal(saved.result, expected);
      assert.equal(saved.inseamApplied, category !== 'dresses');
    }
  });
  test(`${folder}: garment category comes from each product path or same-site canonical, never a title or search section`, () => {
    const context = load(folder);
    const jeans = 'https://www.therealreal.com/products/women/clothing/jeans/designer-pants-name';
    const dress = 'https://www.therealreal.com/products/women/clothing/dresses/denim-jeans-print-dress';
    assert.equal(context.garmentCategory({}, jeans), 'jeans');
    assert.equal(context.garmentCategory({}, dress), 'dresses');
    assert.equal(context.garmentCategory({}, 'https://www.therealreal.com/products/denim-jeans-print-dress'), null);
    assert.equal(context.garmentCategory({}, 'https://www.therealreal.com/shop/women/clothing/jeans'), null);
    const canonical = { querySelector(selector) { return selector === 'link[rel="canonical"]' ? { getAttribute() { return jeans; } } : null; } };
    assert.equal(context.garmentCategory(canonical, 'https://www.therealreal.com/products/details/123'), 'jeans');
    assert.equal(context.garmentCategory(canonical, dress), 'dresses', 'a categorized item path takes precedence');
    const unrelated = { querySelector() { return { href: 'https://example.com/products/women/clothing/jeans/fake' }; } };
    assert.equal(context.garmentCategory(unrelated, 'https://www.therealreal.com/products/details/123'), null);
  });
  test(`${folder}: mixed current/later-page checks keep jeans matches with saved bust and CSV agrees with the scan`, async () => {
    const context = load(folder);
    const stored = {};
    context.chrome.storage.local = { async set(values) { Object.assign(stored, values); }, async get() { return stored; } };
    vm.runInContext(fs.readFileSync(`${folder}/checked-listings.js`, 'utf8'), context);
    const url = (category, id) => `https://www.therealreal.com/products/women/clothing/${category}/${id}`;
    const items = [
      { url: url('jeans', 'fit'), card: { id: 'fit' } },
      { url: url('dresses', 'missing-bust'), card: { id: 'missing-bust' } },
      { url: url('jeans', 'wrong-waist'), card: { id: 'wrong-waist' } }
    ];
    const laterUrl = 'https://www.therealreal.com/sales/test?page=2';
    context.document.next = laterUrl;
    const later = { cards: [{ url: url('pants', 'later-fit'), card: { id: 'later-fit' } }] };
    context.findProductLinkCards = root => root.cards || items;
    context.getNextListingPageUrl = root => root.next || null;
    context.getProductDocument = async address => {
      if (address === laterUrl) return later;
      const root = product('unavailable', address.endsWith('/wrong-waist') ? 40 : 28);
      root.querySelector = () => null;
      return root;
    };
    let shown;
    context.findGridContainer = () => ({});
    context.getOrCreateFilteredGridHost = () => ({});
    context.reorganizeGrid = (grid, cards) => { shown = Array.from(cards, card => card.id); };
    context.cloneCardForFilteredGrid = card => card;
    context.absolutizeCardNode = () => {};
    context.updateStatusBadge = () => {};
    const matcher = context.buildMatcher({ waist: 28, bust: 36 });
    const initial = await context.filterProductCards(matcher);
    assert.deepEqual(shown, ['fit', 'missing-bust']);
    assert.deepEqual({ ...initial.scan }, { checkedCount: 3, matchCount: 2, notMatchCount: 1, undeterminedCount: 0, uncheckedCount: 0 });
    await context.findMoreMatches();
    assert.deepEqual(shown, ['fit', 'missing-bust', 'later-fit']);
    assert.equal(context.summarizeScan().matchCount, 3);
    const rows = await vm.runInContext('CheckedListings.all()', context);
    const fit = rows.find(row => row.product_url.endsWith('/fit'));
    assert.equal(fit.result, 'match');
    assert.equal(fit.user_bust, 36);
    assert.equal(fit.garment_bust, null);
    assert.equal(fit.garment_category, 'jeans');
    assert.equal(fit.bust_applied, false);
    assert.equal(rows.find(row => row.product_url.endsWith('/missing-bust')).result, 'match');
    assert.equal(rows.find(row => row.product_url.endsWith('/wrong-waist')).result, 'not match');
    assert.equal(rows.find(row => row.product_url.endsWith('/later-fit')).result, 'match');
    assert.ok(vm.runInContext('CheckedListings.toCSV([])', context).includes('garment_category,bust_applied,garment_hip'));
    assert.equal(rows.length, 4);
  });
  test(`${folder}: directly opened jeans and dresses use the same applicability rule as grid checks`, async () => {
    for (const [category, expected] of [['jeans', 'match'], ['dresses', 'match']]) {
      const context = load(folder);
      context.window.location = new URL(`https://www.therealreal.com/products/women/clothing/${category}/item`);
      context.document = product('unavailable', 28);
      context.watchForNavigation = () => {};
      let saved;
      let displayed;
      context.saveCheckedListing = async (url, root, result) => { saved = result; };
      context.showProductPageResult = result => { displayed = result; };
      await context.startMatcher({ waist: 28, bust: 36 });
      assert.equal(saved.result, expected);
      assert.equal(displayed.result, expected);
      assert.equal(saved.userBust, 36);
    }
  });
  test(`${folder}: main-product inseam excludes size guides and recommendations; legacy labels still work`, () => {
    const context = load(folder);
    const root = product(36, 28);
    const main = { attributes: [{ type: 'inseam', label: 'Inseam', measurement: true, values: ['29.75"'] }],
      sizeGuide: { inseam: 99 }, recommendations: [{ attributes: [{ type: 'inseam', measurement: true, values: ['99"'] }] }] };
    root.querySelector = () => ({ textContent: JSON.stringify({ props: { pageProps: { product: main } } }) });
    assert.equal(context.extractMeasurements(root).itemInseam, 29.75);
    main.components = [{ attributes: main.attributes }];
    main.attributes = [];
    assert.equal(context.extractMeasurements(root).itemInseam, 29.75);
    main.components = [];
    assert.equal(context.extractMeasurements(root).itemInseam, null, 'no borrowed inseam from unrelated structured data');
    const legacy = { body: element('body', [element('p', [text('Inseam: 31.5 inches')])]), querySelectorAll: () => [] };
    assert.equal(context.extractMeasurements(legacy).itemInseam, 31.5);
    const recommendation = element('aside', [text('Recommended trousers Inseam: 99 inches')]);
    recommendation.matches = selector => selector.includes('recommend');
    const chart = element('aside', [text('Generic size guide Inseam: 98 inches')]);
    chart.matches = selector => selector.includes('size-guide');
    const dress = { body: element('body', [element('p', [text('Waist: 28 inches')]), recommendation, chart]), querySelectorAll: () => [] };
    assert.equal(context.extractMeasurements(dress).itemInseam, null, 'legacy fallbacks omit recommendation and size-guide text');
    assert.equal(context.extractMeasurementFromText('Outseam: 42 inches', 'inseam'), null);
    assert.equal(context.extractMeasurementFromText('Inseam: N/A', 'inseam'), null);
  });
  test(`${folder}: mixed garments retain missing-inseam matches and hide only confirmed inseam mismatches`, async () => {
    const context = load(folder);
    const measurements = { dress: { itemWaist: 28, itemBust: 36, itemInseam: null },
      trousers: { itemWaist: 28, itemBust: 36, itemInseam: 31.5 },
      shortTrousers: { itemWaist: 28, itemBust: 36, itemInseam: 29.74 },
      missingBust: { itemWaist: 28, itemBust: null, itemInseam: 30 },
      wrongWaist: { itemWaist: 32, itemBust: 36, itemInseam: null } };
    const candidates = Object.keys(measurements).map(id => ({ url: `https://www.therealreal.com/products/${id}`, card: { id } }));
    const saved = [];
    let rendered;
    context.findProductLinkCards = () => candidates;
    context.getProductDocument = async url => {
      const values = measurements[url.split('/').pop()];
      const attributes = ['Waist', 'Bust', 'Inseam'].filter(label => values['item' + label] !== null)
        .map(label => ({ label, type: label.toLowerCase(), measurement: true, values: [String(values['item' + label]) + '"'] }));
      return { querySelector() { return { textContent: JSON.stringify({ props: { pageProps: { product: { attributes } } } }) }; } };
    };
    context.saveCheckedListing = async (url, root, result) => saved.push(result);
    context.updateStatusBadge = () => {};
    context.findGridContainer = () => ({});
    context.reorganizeGrid = (grid, show) => { rendered = Array.from(show, card => card.id); };
    const result = await context.filterProductCards(context.buildMatcher({ waist: 28, bust: 36,
      inseam: 30, inseamSmaller: 0.25, inseamLarger: 1.5 }));
    assert.deepEqual(rendered, ['dress', 'trousers', 'missingBust']);
    assert.deepEqual({ ...result.scan }, { checkedCount: 5, matchCount: 3, notMatchCount: 2, undeterminedCount: 0, uncheckedCount: 0 });
    assert.equal(saved.filter(row => row.inseamApplied).length, 3);
  });
  test(`${folder}: detached product text excludes tracking scripts and matches real measurements`, () => {
    const context = load(folder);
    const fixture = product(36, 28);
    assert.ok(fixture.body.textContent.includes('bust: 1'));
    assert.deepEqual({ ...context.extractMeasurements(fixture) }, { itemBust: 36, itemWaist: 28, itemInseam: null, itemHip: null, itemRise: null, itemLegOpening: null });
    const result = context.buildMatcher({ bust: 36, waist: 28, tolerance: 0.25 })(context.extractMeasurements(fixture));
    assert.equal(result.overallMatch, true);
  });
  test(`${folder}: detail rows work without a wrapped label; unrelated words do not yield measurements`, () => {
    const context = load(folder);
    assert.deepEqual({ ...context.extractMeasurements(product(37, 30, true)) }, { itemBust: 37, itemWaist: 30, itemInseam: null, itemHip: null, itemRise: null, itemLegOpening: null });
    assert.equal(context.extractMeasurementFromText('Bustier size 1', 'bust'), null);
    assert.equal(context.extractMeasurementFromText('Bust enhancement offer 1', 'bust'), null);
    assert.equal(context.extractMeasurementFromText('Bust measures 36 inches', 'bust'), 36);
    assert.equal(context.extractMeasurementFromText('Waist measurement: 28.5 inches', 'waist'), 28.5);
  });
  test(`${folder}: result cards are filtered using the real extracted measurements`, async () => {
    const context = load(folder);
    const candidates = [{ url: 'https://www.therealreal.com/products/match', card: { id: 'match' } },
      { url: 'https://www.therealreal.com/products/miss', card: { id: 'miss' } }];
    let rendered;
    const saved = [];
    context.findProductLinkCards = () => candidates;
    context.getProductDocument = async url => url.endsWith('match') ? product(36, 28) : product(42, 34);
    context.saveCheckedListing = async (url, root, result) => saved.push(result);
    context.updateStatusBadge = () => {};
    context.findGridContainer = () => ({});
    context.reorganizeGrid = (grid, show, hide) => { rendered = { show, hide }; };
    const result = await context.filterProductCards(context.buildMatcher({ bust: 36, waist: 28, tolerance: 0.25 }));
    assert.equal(result.visibleCount, 1);
    assert.equal(result.hiddenCount, 1);
    assert.deepEqual(Array.from(rendered.show, card => card.id), ['match']);
    assert.deepEqual(Array.from(rendered.hide, card => card.id), ['miss']);
    assert.equal(saved.length, 2);
  });
  test(`${folder}: rejected local storage does not prevent showing matching cards`, async () => {
    const context = load(folder);
    let visible = false;
    context.CheckedListings = { async save() { throw new Error('QUOTA_BYTES'); } };
    context.findProductLinkCards = () => [{ url: 'https://www.therealreal.com/products/match', card: {} }];
    context.getProductDocument = async () => product(36, 28);
    context.updateStatusBadge = () => {};
    context.findGridContainer = () => ({});
    context.reorganizeGrid = (grid, show) => { visible = show.length === 1; };
    await context.filterProductCards(context.buildMatcher({ bust: 36, waist: 28, tolerance: 0.25 }));
    assert.equal(visible, true);
  });
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: current TRR product attributes supply the waist, not generic size charts`, () => {
    const context = load(folder);
    const data = { props: { pageProps: { product: {
      sizeGuide: { rows: [{ header: 'Waist', values: ['23-25', '26-27', '28-30'] }] },
      attributes: [{ __typename: 'Attribute', label: 'Fabric', measurement: false, values: ['65% Cotton'] }],
      components: [{ attributes: [
        { __typename: 'Attribute', label: 'Bust', type: 'bust', measurement: true, values: ['27"'] },
        { __typename: 'Attribute', label: 'Waist', type: 'waist', measurement: true, values: ['29"'] }
      ] }]
    } } } };
    const root = product(1, 23);
    root.querySelector = selector => selector === 'script#__NEXT_DATA__' ? { textContent: JSON.stringify(data) } : null;
    assert.deepEqual({ ...context.extractMeasurements(root) }, { itemWaist: 29, itemBust: 27, itemInseam: null, itemHip: null, itemRise: null, itemLegOpening: null });
    const result = context.buildMatcher({ waist: 28, tolerance: 2, bust: null })(context.extractMeasurements(root));
    assert.equal(result.overallMatch, true);
    assert.equal(result.userBust, null);
  });
  test(`${folder}: absent garment measurements are not borrowed from the size guide`, () => {
    const context = load(folder);
    const root = product(36, 23);
    root.querySelector = () => ({ textContent: JSON.stringify({ props: { pageProps: { product: {
      sizeGuide: { rows: [{ header: 'Waist', values: ['23-25'] }] }, attributes: [], components: []
    } } } }) });
    assert.deepEqual({ ...context.extractMeasurements(root) }, { itemWaist: null, itemBust: null, itemInseam: null, itemHip: null, itemRise: null, itemLegOpening: null });
  });
  test(`${folder}: waist-only range includes both boundaries and ignores bust`, () => {
    const context = load(folder);
    const matcher = context.buildMatcher({ waist: 28, tolerance: 2, bust: null });
    for (const itemWaist of [26, 28, 30]) assert.equal(matcher({ itemWaist, itemBust: 1 }).overallMatch, true);
    for (const itemWaist of [25.9, 30.1, null]) assert.equal(matcher({ itemWaist, itemBust: 36 }).overallMatch, false);
  });
  test(`${folder}: collapsed measurement sections are read without style/script contents`, () => {
    const context = load(folder);
    const body = element('body', [element('section', [
      element('div', [text('Waist')]), element('style', [text('.waist {margin:1px}')]),
      element('div', [text('29"')])
    ], { hidden: true, 'aria-hidden': 'true' })]);
    body.innerText = 'Product details';
    assert.equal(context.extractMeasurements({ body, querySelectorAll: () => [] }).itemWaist, 29);
  });
}

function gridFixture(context) {
  function style() { return { removeProperty(key) { delete this[key]; } }; }
  const body = { id: 'body' };
  const wrapper = { id: 'wrapper', parentElement: body };
  const source = { id: 'source', parentElement: wrapper, style: style(),
    insertAdjacentElement(position, host) { host.parentElement = wrapper; doc.host = host; } };
  function card(url, parent) {
    const node = { parentElement: parent, style: style(),
      cloneNode() { return card(url, null); } };
    const anchor = { href: url, offsetParent: null, sourceCard: node,
      closest() {
        let current = node;
        while (current) { if (current.id === 'fit-extension-grid-host') return current; current = current.parentElement; }
        return null;
      } };
    node.anchor = anchor;
    return node;
  }
  const cards = [card('https://www.therealreal.com/products/match', source), card('https://www.therealreal.com/products/miss', source)];
  const doc = { body, host: null,
    querySelectorAll() { return [...(this.host?.children || []).map(n => n.anchor), ...cards.map(n => n.anchor)]; },
    getElementById(id) { return this.host?.id === id ? this.host : null; },
    createElement() { return { id: '', style: style(), children: [], setAttribute() {},
      get isConnected() { return !!this.parentElement; },
      replaceChildren() { this.children = []; },
      appendChild(child) { child.parentElement = this; this.children.push(child); }
    }; }
  };
  context.document = doc;
  context.window = { location: new URL('https://www.therealreal.com/sales/test'),
    getComputedStyle() { return { display: 'grid' }; } };
  context.getCardContainer = anchor => anchor.sourceCard;
  context.getProductDocument = async url => url.endsWith('match') ? product(36, 28) : product(36, 35);
  context.saveCheckedListing = async () => {};
  context.updateStatusBadge = () => {};
  context.updateResultsControls = () => {};
  context.cloneCardForFilteredGrid = card => { const copy = card.cloneNode(true); context.normalizeCardForFilteredGrid(copy); return copy; };
  return { doc, source, cards };
}
for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: repeated filtering keeps matching cards visible and does not hide its own output grid`, async () => {
    const context = load(folder);
    const { doc, source, cards } = gridFixture(context);
    const matcher = context.buildMatcher({ waist: 28, bust: null, tolerance: 2 });
    const first = await context.filterProductCards(matcher);
    assert.equal(first.visibleCount, 1);
    assert.equal(doc.host.children.length, 1);
    assert.equal(doc.host.style.display, 'grid');
    assert.equal(source.style.display, 'none');
    assert.equal(cards[0].parentElement, source);
    const second = await context.filterProductCards(matcher);
    assert.equal(second.visibleCount, 1);
    assert.equal(doc.host.children.length, 1);
    assert.equal(doc.host.style.display, 'grid');
    assert.equal(doc.host.children[0].anchor.href, 'https://www.therealreal.com/products/match');
  });
  test(`${folder}: generated grid and badge mutations do not start another filtering loop`, () => {
    const context = load(folder);
    let onMutation;
    let scheduled = 0;
    context.MutationObserver = class { constructor(callback) { onMutation = callback; } observe() {} };
    context.document = { body: {} };
    context.window = { clearTimeout() {}, setTimeout() { scheduled++; } };
    context.watchForNewProducts(() => {});
    onMutation([{ target: { closest() { return {}; } }, addedNodes: [{}] }]);
    assert.equal(scheduled, 0);
    onMutation([{ target: { closest() { return null; } }, addedNodes: [{ nodeType: 1,
      closest() { return null; }, matches() { return true; } }] }]);
    assert.equal(scheduled, 1);
  });
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: HTTP denial pauses checks, retains unchecked cards, and saves no denied observations`, async () => {
    const context = load(folder);
    const candidates = Array.from({ length: 12 }, (_, i) => ({
      url: `https://www.therealreal.com/products/${i}`, card: { id: i }
    }));
    let requests = 0;
    let saved = 0;
    let supplemented = 0;
    let rendered;
    let status;
    context.fetch = async () => { requests++; return { ok: false, status: 403 }; };
    context.findProductLinkCards = () => candidates;
    context.saveCheckedListing = async () => { saved++; };
    context.updateStatusBadge = message => { status = message; };
    context.findGridContainer = () => ({});
    context.reorganizeGrid = (grid, show, hide, unverified) => { rendered = { show, hide, unverified }; };
    context.supplementFromNextPages = async () => { supplemented++; return 0; };
    const matcher = context.buildMatcher({ waist: 28, tolerance: 2, bust: null });
    const result = await context.filterProductCards(matcher);
    assert.equal(result.visibleCount, 0);
    assert.equal(result.failedCount, 12);
    assert.equal(rendered.show.length, 12);
    assert.equal(rendered.unverified.length, 12);
    assert.equal(rendered.hide.length, 0);
    assert.equal(saved, 0);
    assert.equal(supplemented, 0);
    assert.ok(requests <= 4, 'at most the already-started requests reach TRR');
    assert.match(status, /TRR blocked/);
    const firstRequests = requests;
    await context.filterProductCards(matcher);
    assert.equal(requests, firstRequests, 'DOM updates cannot retry a blocked page');
  });
  test(`${folder}: rate limiting and successful HTTP access-denied pages are not garments`, async () => {
    for (const status of [429, 200]) {
      const context = load(folder);
      let requests = 0;
      context.fetch = async () => {
        requests++;
        return { ok: status === 200, status, text: async () => '<title>Access denied</title>' };
      };
      context.DOMParser = class { parseFromString() { return { title: 'Access to this page has been denied.' }; } };
      await assert.rejects(context.getProductDocument('https://www.therealreal.com/products/blocked'), /blocked|denied/);
      await assert.rejects(context.getProductDocument('https://www.therealreal.com/products/next'), /paused/);
      assert.equal(requests, 1);
    }
  });
  test(`${folder}: partial failures keep matches and failed cards, while hiding confirmed mismatches`, async () => {
    const context = load(folder);
    const candidates = ['match', 'miss', 'failed'].map(id => ({ url: `https://www.therealreal.com/products/${id}`, card: { id } }));
    let rendered;
    const saved = [];
    context.findProductLinkCards = () => candidates;
    context.getProductDocument = async url => {
      if (url.endsWith('failed')) throw new Error('Network unavailable');
      return url.endsWith('match') ? product(36, 29) : product(36, 31);
    };
    context.saveCheckedListing = async url => { saved.push(url); };
    context.updateStatusBadge = () => {};
    context.findGridContainer = () => ({});
    context.reorganizeGrid = (grid, show, hide, unverified) => { rendered = { show, hide, unverified }; };
    const result = await context.filterProductCards(context.buildMatcher({ waist: 28, tolerance: 2, bust: null }));
    assert.equal(result.visibleCount, 1);
    assert.equal(result.hiddenCount, 1);
    assert.equal(result.failedCount, 1);
    assert.deepEqual(Array.from(rendered.show, c => c.id), ['match', 'failed']);
    assert.deepEqual(Array.from(rendered.hide, c => c.id), ['miss']);
    assert.deepEqual(Array.from(rendered.unverified, c => c.id), ['failed']);
    assert.equal(saved.length, 2);
  });
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: filtering uses each direction and saves the exact rule used`, async () => {
    const context = load(folder);
    const values = { lower: 27.75, upper: 29.5, tooSmall: 27.74, tooLarge: 29.51 };
    const candidates = Object.keys(values).map(id => ({ url: `https://www.therealreal.com/products/${id}`, card: { id } }));
    let rendered;
    const saved = [];
    context.findProductLinkCards = () => candidates;
    context.getProductDocument = async url => product(36, values[url.split('/').pop()]);
    context.saveCheckedListing = async (url, root, result) => saved.push(result);
    context.updateStatusBadge = () => {};
    context.findGridContainer = () => ({});
    context.reorganizeGrid = (grid, show, hide) => { rendered = { show, hide }; };
    await context.filterProductCards(context.buildMatcher({ waist: 28, bust: null, waistSmaller: 0.25, waistLarger: 1.5 }));
    assert.deepEqual(Array.from(rendered.show, c => c.id).sort(), ['lower', 'upper']);
    assert.deepEqual(Array.from(rendered.hide, c => c.id).sort(), ['tooLarge', 'tooSmall']);
    assert.equal(saved.length, 4);
    for (const result of saved) {
      assert.equal(result.waistSmaller, 0.25);
      assert.equal(result.waistLarger, 1.5);
    }
  });
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: no comparable requested measurements is reported as undetermined on product pages and grids`, async () => {
    const context = load(folder);
    const matcher = context.buildMatcher({ waist: 28, bust: 36, waistSmaller: 0.25, waistLarger: 1.5, bustSmaller: 0.25, bustLarger: 1.5 });
    const partial = matcher({ itemWaist: null, itemBust: null });
    let status;
    context.updateStatusBadge = text => { status = text; };
    context.showProductPageResult(partial);
    assert.match(status, /undetermined/);
    context.findProductLinkCards = () => [{ url: 'https://www.therealreal.com/products/partial', card: {} }];
    context.getProductDocument = async () => ({});
    context.extractMeasurements = () => ({ itemWaist: null, itemBust: null });
    context.saveCheckedListing = async () => {};
    context.findGridContainer = () => ({});
    context.reorganizeGrid = () => {};
    context.supplementFromNextPages = async () => 0;
    const result = await context.filterProductCards(matcher);
    assert.equal(result.unknownCount, 1);
    assert.equal(result.hiddenCount, 0);
  });
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: later-page undetermined results agree with CSV, survive reruns, and exclude older scan history`, async () => {
    const context = load(folder);
    const stored = { 'checkedListing:older': { observed_at: '2026-01-01T00:00:00.000Z', result: 'undetermined', scan_id: 'old-scan' } };
    context.chrome.storage.local = { async set(values) { Object.assign(stored, values); }, async get() { return stored; } };
    vm.runInContext(fs.readFileSync(`${folder}/checked-listings.js`, 'utf8'), context);
    const url = id => `https://www.therealreal.com/products/${id}`;
    const current = ['miss', 'unknown'].map(id => ({ url: url(id), card: { id } }));
    const pages = {
      'https://www.therealreal.com/sales/test?page=2': { cards: ['unknown', 'laterUnknown'].map(id => ({ url: url(id), card: { id } })), next: 'https://www.therealreal.com/sales/test?page=3' },
      'https://www.therealreal.com/sales/test?page=3': { cards: [{ url: url('match'), card: { id: 'match' } }] }
    };
    const host = { children: [], appendChild(card) { this.children.push(card); } };
    const statuses = [];
    let requests = 0;
    context.findProductLinkCards = root => root.cards || current;
    context.findGridContainer = () => ({});
    context.getOrCreateFilteredGridHost = () => host;
    context.reorganizeGrid = (grid, shown) => { host.children = [...shown]; };
    context.cloneCardForFilteredGrid = card => ({ ...card });
    context.absolutizeCardNode = () => {};
    context.getNextListingPageUrl = root => root.next || null;
    context.document.next = 'https://www.therealreal.com/sales/test?page=2';
    context.getProductDocument = async address => {
      requests++;
      if (pages[address]) return pages[address];
      const root = address.endsWith('/match') ? product(36, 28) : address.endsWith('/miss') ? product(36, 40) : product('unavailable', 'unavailable');
      root.querySelector = () => null;
      return root;
    };
    context.updateStatusBadge = message => { statuses.push(message); };
    const matcher = context.buildMatcher({ waist: 28, tolerance: 2, bust: null });
    const result = await context.filterProductCards(matcher);
    assert.deepEqual({ ...result.scan }, { checkedCount: 4, matchCount: 1, notMatchCount: 1, undeterminedCount: 2, uncheckedCount: 0 });
    const rows = await vm.runInContext('CheckedListings.all()', context);
    const scan = context.getScanContext();
    const currentRows = rows.filter(row => row.scan_id === scan.scanId);
    assert.equal(currentRows.length, result.scan.checkedCount);
    assert.equal(currentRows.filter(row => row.result === 'undetermined').length, result.scan.undeterminedCount);
    assert.ok(currentRows.every(row => row.search_url === 'https://www.therealreal.com/sales/test'));
    assert.equal(rows.filter(row => row.result === 'undetermined').length, 3, 'export history includes the earlier scan');
    assert.match(statuses.at(-1), /2 undetermined/);
    assert.match(statuses.at(-1), /Showing 1 matches/);
    assert.ok(statuses.at(-1).includes(scan.scanId.slice(0, 8)));
    assert.match(statuses.at(-1), /all saved scans/);
    assert.equal(host.children.length, 1);
    const before = requests;
    const repeat = await context.filterProductCards(matcher);
    assert.equal(requests, before, 'cached reruns do not request/save observations again');
    assert.equal((await vm.runInContext('CheckedListings.all()', context)).length, rows.length);
    assert.deepEqual({ ...repeat.scan }, { ...result.scan });
    assert.equal(host.children.length, 1, 'later-page match remains displayed after rebuilding the grid');
    assert.match(statuses.at(-1), /2 undetermined/);
  });
  test(`${folder}: load failures do not erase the undetermined count in the final toast`, async () => {
    const context = load(folder);
    const candidates = ['match', 'missing', 'failed'].map(id => ({ url: `https://www.therealreal.com/products/${id}`, card: { id } }));
    context.findProductLinkCards = () => candidates;
    context.getProductDocument = async url => {
      if (url.endsWith('/failed')) throw new Error('Network unavailable');
      return url.endsWith('/match') ? product(36, 28) : product('unavailable', 'unavailable');
    };
    context.saveCheckedListing = async () => {};
    context.findGridContainer = () => ({});
    context.reorganizeGrid = () => {};
    let status;
    context.updateStatusBadge = message => { status = message; };
    const result = await context.filterProductCards(context.buildMatcher({ waist: 28, tolerance: 2 }));
    assert.equal(result.scan.undeterminedCount, 1);
    assert.equal(result.scan.uncheckedCount, 1);
    assert.equal(result.scan.checkedCount, 2);
    assert.match(status, /1 undetermined/);
    assert.match(status, /1 unchecked/);
  });
  test(`${folder}: no-match and interrupted later-page summaries retain missing-measurement counts`, async () => {
    for (const failLater of [false, true]) {
      const context = load(folder);
      const current = [{ url: 'https://www.therealreal.com/products/currentMissing', card: {} }];
      const later = [{ url: 'https://www.therealreal.com/products/laterMissing', card: {} }];
      context.document.next = 'https://www.therealreal.com/sales/test?page=2';
      context.findProductLinkCards = root => root.later ? later : current;
      context.getNextListingPageUrl = root => root.next || null;
      context.getProductDocument = async url => {
        if (url.includes('page=2')) {
          if (failLater) throw new Error('Later results unavailable');
          return { later: true };
        }
        return product('unavailable', 'unavailable');
      };
      context.saveCheckedListing = async () => {};
      context.findGridContainer = () => ({});
      context.getOrCreateFilteredGridHost = () => ({});
      context.reorganizeGrid = () => {};
      let status;
      context.updateStatusBadge = message => { status = message; };
      const result = await context.filterProductCards(context.buildMatcher({ waist: 28, tolerance: 2 }));
      assert.equal(result.scan.undeterminedCount, failLater ? 1 : 2);
      assert.match(status, new RegExp(`${failLater ? 1 : 2} undetermined`));
      assert.match(status, failLater ? /could not be fully checked/ : /No confirmed matches/);
    }
  });
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: progress updates as each product finishes while other requests remain pending`, async () => {
    const context = load(folder);
    const pending = new Map();
    const statuses = [];
    const models = [];
    context.findProductLinkCards = () => Array.from({ length: 5 }, (_, i) => ({ url: `https://www.therealreal.com/products/${i}`, card: {} }));
    context.getProductDocument = url => new Promise(resolve => pending.set(url, resolve));
    context.saveCheckedListing = async () => {};
    context.findGridContainer = () => ({});
    context.reorganizeGrid = () => {};
    context.updateStatusBadge = (text, model) => { statuses.push(text); models.push(model); };
    const running = context.filterProductCards(context.buildMatcher({ waist: 28, tolerance: 2 }));
    assert.match(statuses.at(-1), /0 of 5 finished \(4 active, 1 queued\)/);
    assert.deepEqual({ ...models.at(-1).progress }, { finished: 0, total: 5 });
    assert.match(statuses.at(-1), /Results so far: 0 checked/);
    assert.doesNotMatch(statuses.at(-1), /Showing 0 matches/);
    pending.get('https://www.therealreal.com/products/0')(product(36, 28));
    await new Promise(setImmediate);
    assert.match(statuses.at(-1), /1 of 5 finished \(4 active, 0 queued\)/);
    assert.deepEqual({ ...models.at(-1).progress }, { finished: 1, total: 5 });
    assert.match(statuses.at(-1), /Results so far: 1 checked/);
    for (const resolve of pending.values()) resolve(product(36, 28));
    const result = await running;
    assert.equal(result.scan.matchCount, 5);
    assert.deepEqual({ ...models.at(-1).progress }, { finished: 5, total: 5 });
    assert.equal(models.at(-1).title, 'Scan complete');
    assert.match(statuses.at(-1), /This scan: 5 checked/);
    assert.doesNotMatch(statuses.at(-1), /Reading product measurements|Waiting for product measurements/);
  });
  test(`${folder}: deadlines cover both initial fetch and response body, cancel work, and pause new requests`, async () => {
    for (const stage of ['headers', 'body']) {
      const context = load(folder);
      let fireTimeout;
      let delay;
      let clearCount = 0;
      let signal;
      let requests = 0;
      context.window.setTimeout = (callback, ms) => { fireTimeout = callback; delay = ms; return 7; };
      context.window.clearTimeout = id => { assert.equal(id, 7); clearCount++; };
      context.fetch = async (url, options) => {
        requests++;
        signal = options.signal;
        if (stage === 'headers') return new Promise(() => {});
        return { ok: true, status: 200, text: () => new Promise(() => {}) };
      };
      const request = context.getProductDocument('https://www.therealreal.com/products/slow');
      const rejected = assert.rejects(request, /timed out after 15 seconds/);
      await new Promise(setImmediate);
      assert.equal(delay, 15000);
      fireTimeout();
      await rejected;
      assert.equal(signal.aborted, true);
      assert.equal(clearCount, 1);
      await assert.rejects(context.getProductDocument('https://www.therealreal.com/products/next'), /paused after a request timeout/);
      assert.equal(requests, 1);
    }
  });
  test(`${folder}: a stalled 120-product scan terminates with an unchecked count and makes no false observations`, async () => {
    const context = load(folder);
    const timers = [];
    let requests = 0;
    let saves = 0;
    let status;
    context.window.setTimeout = callback => { timers.push(callback); return timers.length; };
    context.window.clearTimeout = () => {};
    context.fetch = async () => { requests++; return new Promise(() => {}); };
    context.findProductLinkCards = () => Array.from({ length: 120 }, (_, i) => ({ url: `https://www.therealreal.com/products/${i}`, card: {} }));
    context.saveCheckedListing = async () => { saves++; };
    context.findGridContainer = () => ({});
    context.reorganizeGrid = () => {};
    context.updateStatusBadge = text => { status = text; };
    const running = context.filterProductCards(context.buildMatcher({ waist: 28, tolerance: 2 }));
    assert.equal(requests, 4);
    assert.match(status, /0 of 120 finished \(4 active, 116 queued\)/);
    timers.forEach(callback => callback());
    const result = await running;
    assert.equal(requests, 4, 'no remaining queued requests are issued after the timeout');
    assert.equal(saves, 0);
    assert.equal(result.scan.checkedCount, 0);
    assert.equal(result.scan.undeterminedCount, 0);
    assert.equal(result.scan.uncheckedCount, 120);
    assert.match(status, /120 unchecked/);
    assert.match(status, /timed out after 15 seconds/);
    assert.doesNotMatch(status, /Reading product measurements|Waiting for product measurements/);
  });
}
