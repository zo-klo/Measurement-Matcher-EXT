const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function setup(folder = '.') {
  const stored = { unrelated: 'keep' };
  const context = vm.createContext({ URL, crypto: webcrypto, console,
    chrome: { storage: { local: {
      async set(values) { Object.assign(stored, values); },
      async get() { return stored; },
      async remove(keys) { keys.forEach(key => delete stored[key]); }
    } } }
  });
  vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8'), context);
  vm.runInContext(fs.readFileSync(`${folder}/checked-listings.js`, 'utf8') + '\nthis.api = CheckedListings;', context);
  return { api: context.api, stored };
}
function productRoot(structured = {}, details = [], nodes = {}) {
  return {
    body: { textContent: 'Estimated 65% off retail' },
    querySelectorAll(selector) {
      return selector.includes('ld+json') ? [{ textContent: JSON.stringify(structured) }]
        : selector === '.product-details-group li' ? details.map(textContent => ({ textContent })) : [];
    },
    querySelector(selector) { return nodes[selector] || null; }
  };
}
const match = { itemBust: 36, itemWaist: 28, userBust: 35, userWaist: 29, tolerance: 1,
  overallMatch: true, comparableMeasurementFound: true };

test('concurrent observations persist independently with canonical URLs and numeric differences', async () => {
  const { api, stored } = setup();
  const root = productRoot({ '@type': 'Product', sku: '123', brand: { name: 'Brand' },
    offers: { price: '125.50', priceCurrency: 'USD' }, material: 'Silk' }, ['Condition: Very Good']);
  await Promise.all(Array.from({ length: 12 }, () => api.save('https://www.therealreal.com/products/dress?tracking=x#photos', root, match)));
  const rows = await api.all();
  assert.equal(rows.length, 12);
  assert.equal(stored.unrelated, 'keep');
  assert.equal(rows[0].product_url, 'https://www.therealreal.com/products/dress');
  assert.equal(rows[0].bust_difference, 1);
  assert.equal(rows[0].waist_difference, -1);
  assert.equal(rows[0].result, 'match');
  assert.equal(rows[0].product_price, 125.5);
  assert.equal(rows[0].garment_condition, 'Very Good');
  assert.equal(rows[0].estimated_percent_off_retail, 65);
  assert.ok(!Number.isNaN(Date.parse(rows[0].observed_at)));
});

test('missing requested measurements are skipped while known mismatches fail', async () => {
  const { api } = setup();
  await api.save('https://www.therealreal.com/products/one', productRoot(),
    { ...match, itemBust: null, overallMatch: false });
  await api.save('https://www.therealreal.com/products/two', productRoot(),
    { ...match, itemBust: null, itemWaist: 24, overallMatch: false });
  const rows = await api.all();
  assert.equal(rows.find(r => r.product_url.endsWith('one')).result, 'match');
  assert.equal(rows.find(r => r.product_url.endsWith('two')).result, 'not match');
  assert.equal(rows[0].garment_bust, null);
  assert.equal(rows[0].product_price, null);
  assert.equal(rows[0].on_sale, null);
});

test('metadata falls back to labeled details and detects explicit price reductions', () => {
  const { api } = setup();
  const metadata = api.productMetadata(productRoot({},
    ['Designer: Example', 'Fabric: 80% cotton, 20% silk', 'Condition: Pristine'], {
      '[data-testid="product-price"], .product-price': { textContent: '$100' },
      '.product-price del, .product-price s, [data-testid="original-price"]': { textContent: '$200' }
    }));
  assert.equal(metadata.designer, 'Example');
  assert.equal(metadata.fabric_composition, '80% cotton, 20% silk');
  assert.equal(metadata.on_sale, true);
  assert.equal(metadata.garment_condition, 'Pristine');
});

test('CSV preserves nulls, signed numbers, commas, quotes, line breaks and protects formula text', () => {
  const { api } = setup();
  const csv = api.toCSV([{ designer: '=formula', fabric_composition: 'Silk, "soft"\nBlend', waist_difference: -1,
    garment_condition: 'Good' }]);
  assert.ok(csv.includes('"\'=formula"'));
  assert.ok(csv.includes('"Silk, ""soft""\nBlend"'));
  assert.ok(csv.includes('"-1"'));
  assert.ok(csv.startsWith('product_url,item_id,observed_at,'));
  assert.ok(csv.includes('garment_condition,waist_smaller_allowance,waist_larger_allowance,bust_smaller_allowance,bust_larger_allowance,scan_id,search_url,garment_inseam,user_inseam,inseam_smaller_allowance,inseam_larger_allowance,inseam_difference,inseam_applied,garment_category,bust_applied,garment_hip'));
});

test('storage errors are propagated rather than silently reporting a successful save', async () => {
  const { api, stored } = setup();
  // A non-extensible store makes the mock write fail, like a rejected quota write.
  Object.preventExtensions(stored);
  await assert.rejects(api.save('https://www.therealreal.com/products/one', productRoot(), match));
});

test('both extension packages load helper before content script and popup', () => {
  for (const folder of ['.', 'Measurement Matcher EXT']) {
    const manifest = JSON.parse(fs.readFileSync(`${folder}/manifest.json`));
    assert.deepEqual(manifest.content_scripts[0].js, ['matching.js', 'checked-listings.js', 'contentscript.js']);
    const popup = fs.readFileSync(`${folder}/popup.html`, 'utf8');
    assert.ok(popup.indexOf('src="matching.js"') < popup.indexOf('src="checked-listings.js"'));
    assert.ok(popup.indexOf('src="checked-listings.js"') < popup.indexOf('src="popup.js"'));
    assert.ok(popup.includes('id="export"'));
    assert.ok(fs.readFileSync(`${folder}/popup.js`, 'utf8').includes('chrome.storage.sync.set'));
  }
  assert.equal(fs.readFileSync('checked-listings.js', 'utf8'), fs.readFileSync('Measurement Matcher EXT/checked-listings.js', 'utf8'));
});


test('clearing observations preserves unrelated local data and future checks still save', async () => {
  const { api, stored } = setup();
  await api.save('https://www.therealreal.com/products/one', productRoot(), match);
  await api.save('https://www.therealreal.com/products/two', productRoot(), match);
  await api.clear();
  assert.equal((await api.all()).length, 0);
  assert.equal(stored.unrelated, 'keep');
  await api.clear();
  await api.save('https://www.therealreal.com/products/three', productRoot(), match);
  assert.equal((await api.all()).length, 1);
});

test('directional allowances are saved and exported with matching-consistent results', async () => {
  const { api, stored } = setup();
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync('matching.js', 'utf8') + '\nthis.matcher = MeasurementMatching.createMatcher({ waist: 28, bust: 36, waistSmaller: 0.25, waistLarger: 1.5, bustSmaller: 0.5, bustLarger: 2 });', context);
  for (const [id, measurements] of Object.entries({
    match: { itemWaist: 27.75, itemBust: 38 },
    miss: { itemWaist: 27.74, itemBust: null },
    partial: { itemWaist: 29.5, itemBust: null },
    unknown: { itemWaist: null, itemBust: null }
  })) {
    await api.save(`https://www.therealreal.com/products/${id}`, productRoot(), context.matcher(measurements));
  }
  const rows = await api.all();
  assert.equal(rows.find(r => r.product_url.endsWith('/match')).result, 'match');
  assert.equal(rows.find(r => r.product_url.endsWith('/miss')).result, 'not match');
  assert.equal(rows.find(r => r.product_url.endsWith('/partial')).result, 'match');
  assert.equal(rows.find(r => r.product_url.endsWith('/unknown')).result, 'undetermined');
  for (const row of rows) {
    assert.equal(row.waist_smaller_allowance, 0.25);
    assert.equal(row.waist_larger_allowance, 1.5);
    assert.equal(row.bust_smaller_allowance, 0.5);
    assert.equal(row.bust_larger_allowance, 2);
    assert.equal(row.tolerance, null);
  }
  const csv = api.toCSV(rows);
  assert.ok(csv.includes(',"0.25","1.5","0.5","2",,'));
  // A historical observation remains immutable; export fills its four bounds
  // from its recorded symmetric rule, not from current preferences.
  stored['checkedListing:legacy'] = { observed_at: '2026-01-01T00:00:00.000Z', tolerance: 3, result: 'not match' };
  const historical = (await api.all())[0];
  assert.ok(api.toCSV([historical]).includes(',"3","3","3","3",,'));
  assert.equal(historical.waist_smaller_allowance, undefined);
  assert.equal(historical.result, 'not match');
});

test('scan provenance is exported without rewriting historical records', async () => {
  const { api, stored } = setup();
  await api.save('https://www.therealreal.com/products/current', productRoot(), match,
    { scanId: 'this-scan', searchUrl: 'https://www.therealreal.com/sales/dresses?page=2' });
  const row = (await api.all())[0];
  assert.equal(row.scan_id, 'this-scan');
  assert.equal(row.search_url, 'https://www.therealreal.com/sales/dresses?page=2');
  assert.ok(api.toCSV([row]).includes('"this-scan","https://www.therealreal.com/sales/dresses?page=2"'));
  stored['checkedListing:old'] = { observed_at: '2026-01-01T00:00:00.000Z', result: 'undetermined' };
  const historical = (await api.all())[0];
  assert.ok(api.toCSV([historical]).includes(',,\r\n'));
  assert.equal(historical.scan_id, undefined);
});


function nextProductRoot(pageProduct, structured = {}, details = [], nodes = {}) {
  return productRoot(structured, details, {
    'script#__NEXT_DATA__': { textContent: JSON.stringify({ props: { pageProps: { product: pageProduct } } }) }, ...nodes
  });
}
function detailRow(label, value, { recommendation = false, button = false } = {}) {
  const text = value => ({ nodeType: 3, textContent: value });
  const valueNode = { nodeType: 1, nodeName: button ? 'BUTTON' : 'DIV', childNodes: [
    { nodeType: 1, nodeName: 'STYLE', childNodes: [text('unrelated CSS fabric: silk')] }, text(value)
  ] };
  return { childNodes: [text(label)], nextElementSibling: button ? null : valueNode,
    closest() { return recommendation ? {} : null; }, querySelector() { return button ? valueNode : null; }
  };
}
for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: new CSV columns append values/rules/flags and stay blank for historical observations`, async () => {
    const { api, stored } = setup(folder);
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8') + '\nthis.matcher = MeasurementMatching.createMatcher({ hip: 39, hipSmaller: 0.25, hipLarger: 1.5, rise: 10, riseSmaller: 0.25, riseLarger: 1.5, legOpening: 15, legOpeningSmaller: 0.25, legOpeningLarger: 1.5 });', context);
    const result = context.matcher({ garmentCategory: 'pants', itemHip: 39.5, itemRise: 10.25, itemLegOpening: 14.75 });
    await api.save('https://www.therealreal.com/products/women/clothing/pants/one', productRoot(), result);
    const [row] = await api.all();
    assert.equal(row.result, 'match');
    for (const [key, garment, user, difference] of [['hip', 39.5, 39, 0.5], ['rise', 10.25, 10, 0.25], ['leg_opening', 14.75, 15, -0.25]]) {
      assert.equal(row['garment_' + key], garment);
      assert.equal(row['user_' + key], user);
      assert.equal(row[key + '_smaller_allowance'], 0.25);
      assert.equal(row[key + '_larger_allowance'], 1.5);
      assert.equal(row[key + '_difference'], difference);
      assert.equal(row[key + '_applied'], true);
    }
    assert.equal(row.tolerance, null);
    assert.deepEqual(Array.from(api.columns.slice(-18)), ['hip', 'rise', 'leg_opening'].flatMap(key =>
      ['garment_' + key, 'user_' + key, key + '_smaller_allowance', key + '_larger_allowance', key + '_difference', key + '_applied']));
    assert.ok(api.toCSV([row]).includes('"39.5","39","0.25","1.5","0.5","true"'));
    stored['checkedListing:old'] = { observed_at: '2026-01-01T00:00:00.000Z', tolerance: 2, result: 'not match' };
    const [old] = await api.all();
    assert.deepEqual(api.toCSV([old]).trim().split('\r\n')[1].split(',').slice(-18), Array(18).fill(''));
    assert.equal(old.hip_smaller_allowance, undefined);
    assert.equal(old.result, 'not match');
  });
  test(`${folder}: inseam CSV records values, differences and application without inventing historical data`, async () => {
    const { api, stored } = setup(folder);
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8') + '\nthis.matcher = MeasurementMatching.createMatcher({ waist: 28, inseam: 30, inseamSmaller: 0.25, inseamLarger: 1.5 });', context);
    for (const [id, itemInseam] of [['dress', null], ['pants', 29.75], ['shortPants', 29.74]]) {
      await api.save(`https://www.therealreal.com/products/${id}`, productRoot(), context.matcher({ itemWaist: 28, itemInseam }));
    }
    const rows = await api.all();
    const dress = rows.find(row => row.product_url.endsWith('/dress'));
    const pants = rows.find(row => row.product_url.endsWith('/pants'));
    const shortPants = rows.find(row => row.product_url.endsWith('/shortPants'));
    assert.equal(dress.result, 'match');
    assert.equal(dress.garment_inseam, null);
    assert.equal(dress.user_inseam, 30);
    assert.equal(dress.inseam_difference, null);
    assert.equal(dress.inseam_applied, false);
    assert.equal(pants.result, 'match');
    assert.equal(pants.garment_inseam, 29.75);
    assert.equal(pants.inseam_difference, -0.25);
    assert.equal(pants.inseam_applied, true);
    assert.equal(shortPants.result, 'not match');
    for (const row of rows) {
      assert.equal(row.inseam_smaller_allowance, 0.25);
      assert.equal(row.inseam_larger_allowance, 1.5);
    }
    assert.ok(api.toCSV([pants]).includes('"29.75","30","0.25","1.5","-0.25","true"'));
    assert.ok(api.toCSV([dress]).includes(',"30","0.25","1.5",,"false"'));
    stored['checkedListing:old'] = { observed_at: '2026-01-01T00:00:00.000Z', result: 'match', tolerance: 2 };
    const [old] = await api.all();
    const csvFields = api.toCSV([old]).trim().split('\r\n')[1].split(',');
    assert.deepEqual(csvFields.slice(-26), Array(26).fill(''));
    assert.equal(old.inseam_smaller_allowance, undefined);
    assert.equal(old.result, 'match');
  });
  test(`${folder}: current TRR product attributes supply fabric, condition, and item number`, async () => {
    const { api } = setup(folder);
    const root = nextProductRoot({ sku: 'LEL72737', condition: 'Excellent', attributes: [
      { __typename: 'Attribute', label: 'Fabric', measurement: false, type: 'fabric', values: ['51% Wool, 49% Silk; Lining 100% Silk'] }
    ], components: [{ attributes: [{ label: 'Bust', measurement: true, type: 'bust', values: ['32.75"'] }] }] },
      { '@type': 'Product', offers: { price: 125, priceCurrency: 'USD' }, brand: { name: 'Lela Rose' } });
    const metadata = api.productMetadata(root);
    assert.equal(metadata.fabric_composition, '51% Wool, 49% Silk; Lining 100% Silk');
    assert.equal(metadata.garment_condition, 'Excellent');
    assert.equal(metadata.item_id, 'LEL72737');
    await api.save('https://www.therealreal.com/products/women/clothing/dresses/lela-rose-wool-knee-length-dress-xhu6l', root, match);
    const [row] = await api.all();
    assert.equal(row.fabric_composition, metadata.fabric_composition);
    assert.equal(row.garment_condition, metadata.garment_condition);
    assert.ok(api.toCSV([row]).includes('"51% Wool, 49% Silk; Lining 100% Silk","Excellent"'));
  });
  test(`${folder}: component attributes retain multiple fabric values and ignore measurement attributes`, () => {
    const { api } = setup(folder);
    const metadata = api.productMetadata(nextProductRoot({ condition: 'Very Good', attributes: [], components: [{ attributes: [
      { label: 'Fabric', type: 'fabric', measurement: true, values: ['incorrect measurement field'] },
      { label: 'Fabric', type: 'fabric', measurement: false, values: ['80% Cotton, 20% Silk', 'Lining 100% Silk'] }
    ] }] }));
    assert.equal(metadata.fabric_composition, '80% Cotton, 20% Silk; Lining 100% Silk');
    assert.equal(metadata.garment_condition, 'Very Good');
  });
  test(`${folder}: metadata never borrows fabric or condition from recommendations or a condition guide`, () => {
    const { api } = setup(folder);
    const scope = { querySelectorAll() { return [detailRow('Fabric', 'Recommended silk', { recommendation: true }),
      detailRow('Condition:', 'Pristine', { recommendation: true }), detailRow('Condition', 'As Is Fair Good Very Good Excellent Pristine')]; } };
    const root = nextProductRoot({ sku: 'MAIN', attributes: [], components: [], recommendations: [
      { condition: 'Pristine', attributes: [{ type: 'fabric', values: ['Recommended silk'] }] }
    ] }, { '@type': 'Product', sku: 'RECOMMENDED', material: 'Recommended silk' }, [],
      { 'main#main-content, main, [role="main"]': scope });
    const metadata = api.productMetadata(root);
    assert.equal(metadata.garment_condition, null);
    assert.equal(metadata.fabric_composition, null);
    assert.equal(metadata.item_id, 'MAIN');
  });
  test(`${folder}: label/value rows work without old classes, colons or rendered innerText`, () => {
    const { api } = setup(folder);
    const scope = { querySelectorAll() { return [detailRow('Fabric', '51% Wool, 49% Silk; Lining 100% Silk'),
      detailRow('Condition:', 'Excellent', { button: true })]; } };
    const metadata = api.productMetadata(productRoot({}, [], { 'main#main-content, main, [role="main"]': scope }));
    assert.equal(metadata.fabric_composition, '51% Wool, 49% Silk; Lining 100% Silk');
    assert.equal(metadata.garment_condition, 'Excellent');
  });
  test(`${folder}: malformed data retains legacy fallback and missing fields stay null`, () => {
    const { api } = setup(folder);
    const legacy = productRoot({ '@type': 'Product', material: 'Silk' }, ['Condition: Good'], { 'script#__NEXT_DATA__': { textContent: '{invalid' } });
    assert.equal(api.productMetadata(legacy).fabric_composition, 'Silk');
    assert.equal(api.productMetadata(legacy).garment_condition, 'Good');
    const missing = api.productMetadata(nextProductRoot({ condition: { code: 3 }, attributes: [
      { label: 'Fabric', type: 'fabric', values: ['N/A', null, { value: 'not readable' }] }
    ] }));
    assert.equal(missing.fabric_composition, null);
    assert.equal(missing.garment_condition, null);
  });
}
