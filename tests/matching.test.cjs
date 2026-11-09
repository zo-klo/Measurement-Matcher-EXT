const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const folder of ['.', 'Measurement Matcher EXT']) {
  function matching() {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8') + '\nthis.api = MeasurementMatching;', context);
    return context.api;
  }
  test(`${folder}: every measurement can establish a partial match while absent values are skipped uniformly`, () => {
    const api = matching();
    const targets = { waist: 28, bust: 36, inseam: 30, hip: 39, rise: 10, legOpening: 15 };
    const settings = { ...targets, ...Object.fromEntries(Object.keys(targets).flatMap(key => [[key + 'Smaller', 0.25], [key + 'Larger', 1.5]])) };
    const matcher = api.createMatcher(settings);
    for (const [key, value] of Object.entries(targets)) {
      const itemKey = 'item' + key[0].toUpperCase() + key.slice(1);
      const garmentCategory = key === 'bust' ? 'tops' : 'pants';
      const partial = matcher({ garmentCategory, [itemKey]: value });
      assert.equal(partial.result, 'match', `${key} alone can establish a match despite other missing values`);
      assert.equal(partial.comparableMeasurementFound, true);
      assert.equal(api.classify(partial), 'match');
      const mismatch = matcher({ garmentCategory, [itemKey]: value + 2 });
      assert.equal(mismatch.result, 'not match', `${key} mismatch still fails`);
      assert.equal(api.classify(mismatch), 'not match');
      for (const missing of [null, undefined, NaN, Infinity]) {
        const result = matcher({ garmentCategory, [itemKey]: missing });
        assert.equal(result.result, 'undetermined', `${key}: no available applicable measurement is not a match`);
        assert.equal(result.comparableMeasurementFound, false);
        assert.equal(api.classify(result), 'undetermined');
      }
    }
    assert.equal(api.createMatcher({}), null, 'no entered preferences leaves matching disabled');
    const mixed = matcher({ garmentCategory: 'tops', itemWaist: 28, itemBust: 100 });
    assert.equal(mixed.result, 'not match', 'one passing value cannot override a known mismatch');
  });
  test(`${folder}: hip works across clothing categories with independent inclusive allowances`, () => {
    const api = matching();
    const matcher = api.createMatcher({ hip: 39, hipSmaller: 0.25, hipLarger: 1.5 });
    for (const garmentCategory of ['dresses', 'tops', 'skirts', 'jeans', 'pants', 'jumpsuits', null]) {
      for (const itemHip of [38.75, 39, 40.5]) {
        const result = matcher({ garmentCategory, itemHip });
        assert.equal(result.result, 'match');
        assert.equal(result.hipApplied, true);
        assert.equal(api.classify(result), 'match');
      }
      for (const itemHip of [38.749, 40.501]) assert.equal(matcher({ garmentCategory, itemHip }).result, 'not match');
      assert.equal(matcher({ garmentCategory, itemHip: null }).result, 'undetermined');
    }
    const withWaist = api.createMatcher({ waist: 28, hip: 39, hipSmaller: 0.25, hipLarger: 1.5 });
    assert.equal(withWaist({ itemWaist: 28, itemHip: null }).result, 'match');
    assert.equal(withWaist({ itemWaist: null, itemHip: 39 }).result, 'match', 'missing waist is skipped');
  });
  test(`${folder}: rise and leg opening are optional pants-only comparisons with separate boundaries`, () => {
    const api = matching();
    const matcher = api.createMatcher({ waist: 28, rise: 10, riseSmaller: 0.25, riseLarger: 1.5,
      legOpening: 15, legOpeningSmaller: 0.5, legOpeningLarger: 2 });
    for (const garmentCategory of ['jeans', 'pants', 'trousers', ' Pants ']) {
      for (const itemRise of [9.75, 11.5]) for (const itemLegOpening of [14.5, 17]) {
        const result = matcher({ garmentCategory, itemWaist: 28, itemRise, itemLegOpening });
        assert.equal(result.result, 'match');
        assert.equal(result.riseApplied, true);
        assert.equal(result.legOpeningApplied, true);
        assert.equal(api.classify(result), 'match');
      }
      assert.equal(matcher({ garmentCategory, itemWaist: 28, itemRise: 9.749, itemLegOpening: 15 }).result, 'not match');
      assert.equal(matcher({ garmentCategory, itemWaist: 28, itemRise: 11.501, itemLegOpening: 15 }).result, 'not match');
      assert.equal(matcher({ garmentCategory, itemWaist: 28, itemRise: 10, itemLegOpening: 14.499 }).result, 'not match');
      assert.equal(matcher({ garmentCategory, itemWaist: 28, itemRise: 10, itemLegOpening: 17.001 }).result, 'not match');
      assert.equal(matcher({ garmentCategory, itemWaist: 28 }).result, 'match', 'missing optional values are skipped');
    }
    for (const garmentCategory of ['dresses', 'tops', 'skirts', 'shorts', 'jumpsuits', 'suits-and-sets', null]) {
      const result = matcher({ garmentCategory, itemWaist: 28, itemRise: 100, itemLegOpening: 100 });
      assert.equal(result.result, 'match');
      assert.equal(result.riseApplied, false);
      assert.equal(result.legOpeningApplied, false);
    }
    const onlyRise = api.createMatcher({ rise: 10 });
    assert.equal(onlyRise({ garmentCategory: 'pants', itemRise: 10 }).result, 'match');
    assert.equal(onlyRise({ garmentCategory: 'pants' }).result, 'undetermined');
    assert.equal(onlyRise({ garmentCategory: 'dresses', itemRise: 10 }).result, 'undetermined');
  });
  test(`${folder}: blank new preferences preserve existing matching and legacy defaults`, () => {
    const api = matching();
    const settings = { waist: 28, bust: 36, inseam: 30, tolerance: 1 };
    const previous = api.createMatcher(settings);
    const disabled = api.createMatcher({ ...settings, hip: '', rise: null, legOpening: '', hipSmaller: 5, riseLarger: 9 });
    for (const garmentCategory of ['dresses', 'jeans', null]) for (const itemWaist of [null, 25, 28]) for (const itemBust of [null, 30, 36]) {
      const item = { garmentCategory, itemWaist, itemBust, itemInseam: 30, itemHip: 1, itemRise: 1, itemLegOpening: 1 };
      assert.equal(disabled(item).result, previous(item).result);
    }
    const migrated = api.normalize({ tolerance: 2 });
    assert.equal(migrated.tolerance, 2);
    for (const key of ['hip', 'rise', 'legOpening']) {
      assert.equal(migrated[key], null);
      assert.equal(migrated[key + 'Smaller'], 0);
      assert.equal(migrated[key + 'Larger'], 0);
    }
    assert.equal(api.normalize({ tolerance: 2, hip: 39 }).tolerance, null);
    assert.equal(api.normalize({ tolerance: 2, hip: 39, hipSmaller: 2, hipLarger: 2 }).tolerance, 2);
  });
  test(`${folder}: waist accepts 0.25 smaller and 1.5 larger, inclusively`, () => {
    const api = matching();
    const matcher = api.createMatcher({ waist: 28, bust: null, waistSmaller: 0.25, waistLarger: 1.5 });
    for (const waist of [27.75, 28, 29.5]) {
      const result = matcher({ itemWaist: waist, itemBust: null });
      assert.equal(result.overallMatch, true, `waist ${waist}`);
      assert.equal(result.result, 'match');
    }
    for (const waist of [27.749, 29.501]) {
      const result = matcher({ itemWaist: waist, itemBust: 36 });
      assert.equal(result.overallMatch, false);
      assert.equal(result.result, 'not match');
    }
  });
  test(`${folder}: bust and waist have independent directional ranges and both must pass`, () => {
    const matcher = matching().createMatcher({ waist: 28, bust: 36,
      waistSmaller: 0.25, waistLarger: 1.5, bustSmaller: 0.5, bustLarger: 2 });
    for (const itemWaist of [27.75, 29.5]) for (const itemBust of [35.5, 38]) {
      assert.equal(matcher({ itemWaist, itemBust }).overallMatch, true);
    }
    for (const item of [ { itemWaist: 27.74, itemBust: 36 }, { itemWaist: 29.51, itemBust: 36 },
      { itemWaist: 28, itemBust: 35.49 }, { itemWaist: 28, itemBust: 38.01 } ]) {
      assert.equal(matcher(item).result, 'not match');
    }
  });
  test(`${folder}: bust-only matching ignores waist, including missing waist`, () => {
    const matcher = matching().createMatcher({ bust: 36, bustSmaller: 0.25, bustLarger: 1.5 });
    assert.equal(matcher({ itemWaist: null, itemBust: 35.75 }).result, 'match');
    assert.equal(matcher({ itemWaist: 100, itemBust: 37.5 }).result, 'match');
    assert.equal(matcher({ itemWaist: 28, itemBust: 35.749 }).result, 'not match');
    assert.equal(matcher({ itemWaist: 28, itemBust: null }).result, 'undetermined');
  });
  test(`${folder}: missing requested measurements are skipped unless none can be compared`, () => {
    const matcher = matching().createMatcher({ waist: 28, bust: 36,
      waistSmaller: 0.25, waistLarger: 1.5, bustSmaller: 0.25, bustLarger: 1.5 });
    assert.equal(matcher({ itemWaist: 28, itemBust: null }).result, 'match');
    assert.equal(matcher({ itemWaist: 27.74, itemBust: null }).result, 'not match');
    assert.equal(matcher({ itemWaist: null, itemBust: 37.51 }).result, 'not match');
    assert.equal(matcher({ itemWaist: null, itemBust: null }).result, 'undetermined');
    assert.equal(matching().createMatcher({ waist: null, bust: '' }), null);
  });
  test(`${folder}: legacy tolerance fills missing allowances but never overrides explicit zero`, () => {
    const api = matching();
    const old = api.normalize({ waist: 28, tolerance: 2 });
    for (const key of ['waistSmaller', 'waistLarger', 'bustSmaller', 'bustLarger']) assert.equal(old[key], 2);
    assert.equal(old.inseamSmaller, 0);
    assert.equal(old.inseamLarger, 0);
    assert.equal(old.tolerance, 2);
    const migrated = api.normalize({ tolerance: 2, waistSmaller: 0, bustLarger: 1.5 });
    assert.equal(migrated.waistSmaller, 0);
    assert.equal(migrated.waistLarger, 2);
    assert.equal(migrated.bustSmaller, 2);
    assert.equal(migrated.bustLarger, 1.5);
    assert.equal(migrated.tolerance, null);
    const exact = api.createMatcher({ waist: 28, tolerance: 2, waistSmaller: 0, waistLarger: 0 });
    assert.equal(exact({ itemWaist: 28, itemBust: null }).result, 'match');
    assert.equal(exact({ itemWaist: 27.999, itemBust: null }).result, 'not match');
    assert.equal(exact({ itemWaist: 28.001, itemBust: null }).result, 'not match');
  });
  test(`${folder}: decimal boundaries tolerate machine rounding but reject genuinely out-of-range values`, () => {
    const matcher = matching().createMatcher({ waist: 28.1, waistSmaller: 0.2, waistLarger: 0.2 });
    assert.equal(matcher({ itemWaist: 27.9, itemBust: null }).result, 'match');
    assert.equal(matcher({ itemWaist: 28.3, itemBust: null }).result, 'match');
    assert.equal(matcher({ itemWaist: 27.899999, itemBust: null }).result, 'not match');
    assert.equal(matcher({ itemWaist: 28.300001, itemBust: null }).result, 'not match');
  });
  test(`${folder}: adding inseam leaves all existing outcomes unchanged when a listing has no inseam`, () => {
    const api = matching();
    const settings = { waist: 28, bust: 36, tolerance: 1 };
    const previous = api.createMatcher(settings);
    const withInseam = api.createMatcher({ ...settings, inseam: 30, inseamSmaller: 0.25, inseamLarger: 1.5 });
    for (const itemWaist of [null, 26, 28, 30]) for (const itemBust of [null, 34, 36, 38]) {
      const item = { itemWaist, itemBust };
      for (const itemInseam of [undefined, null, NaN]) {
        const result = withInseam({ ...item, itemInseam });
        assert.equal(result.result, previous(item).result);
        assert.equal(result.overallMatch, previous(item).overallMatch);
        assert.equal(result.inseamApplied, false);
        assert.equal(api.classify(result), result.result);
      }
    }
  });
  test(`${folder}: reported inseam uses its own inclusive range alongside available bust/waist`, () => {
    const api = matching();
    const matcher = api.createMatcher({ waist: 28, bust: 36, tolerance: 1,
      inseam: 30, inseamSmaller: 0.25, inseamLarger: 1.5 });
    for (const itemInseam of [29.75, 30, 31.5]) {
      const result = matcher({ itemWaist: 28, itemBust: 36, itemInseam });
      assert.equal(result.result, 'match');
      assert.equal(result.inseamApplied, true);
      assert.equal(api.classify(result), 'match');
    }
    for (const itemInseam of [29.749, 31.501]) {
      const result = matcher({ itemWaist: 28, itemBust: 36, itemInseam });
      assert.equal(result.result, 'not match');
      assert.equal(api.classify(result), 'not match');
    }
    assert.equal(matcher({ itemWaist: null, itemBust: 36, itemInseam: 30 }).result, 'match');
    assert.equal(matcher({ itemWaist: 25, itemBust: 36, itemInseam: 30 }).result, 'not match');
    assert.equal(matcher({ itemWaist: 28, itemBust: null, itemInseam: 32 }).result, 'not match');
  });
  test(`${folder}: inseam-only needs a comparable value; leaving inseam blank disables its rule`, () => {
    const api = matching();
    const matcher = api.createMatcher({ inseam: 30, inseamSmaller: 0.25, inseamLarger: 1.5 });
    assert.equal(matcher({ itemInseam: 29.75 }).result, 'match');
    assert.equal(matcher({ itemInseam: 31.501 }).result, 'not match');
    assert.equal(matcher({ itemWaist: 28, itemBust: 36 }).result, 'undetermined');
    const disabled = api.createMatcher({ waist: 28, inseam: '', inseamSmaller: 0.25, inseamLarger: 1.5 });
    assert.equal(disabled({ itemWaist: 28, itemInseam: 100 }).result, 'match');
    assert.equal(api.normalize({ tolerance: 2 }).tolerance, 2);
    assert.equal(api.normalize({ tolerance: 2, inseam: 30 }).tolerance, null);
    assert.equal(api.normalize({ tolerance: 2, inseam: 30, inseamSmaller: 2, inseamLarger: 2 }).tolerance, 2);
  });
  test(`${folder}: bottoms ignore saved bust while available waist/inseam and non-bottoms comparisons remain in force`, () => {
    const api = matching();
    const settings = { waist: 28, bust: 36, waistSmaller: 0.25, waistLarger: 1.5,
      inseam: 30, inseamSmaller: 0.25, inseamLarger: 1.5 };
    const matcher = api.createMatcher(settings);
    for (const garmentCategory of ['jeans', 'pants', 'trousers', 'shorts', 'skirts', 'bottoms']) {
      for (const itemBust of [null, 1, 100]) {
        const result = matcher({ garmentCategory, itemWaist: 28, itemBust, itemInseam: 30 });
        assert.equal(result.result, 'match', garmentCategory);
        assert.equal(result.bustApplied, false);
        assert.equal(result.userBust, 36, 'saved preference is retained');
        assert.equal(api.classify(result), 'match', 'status and CSV classification preserve category context');
      }
      assert.equal(matcher({ garmentCategory, itemWaist: 27.74, itemBust: null, itemInseam: 30 }).result, 'not match');
      assert.equal(matcher({ garmentCategory, itemWaist: 28, itemBust: null, itemInseam: 31.51 }).result, 'not match');
      assert.equal(matcher({ garmentCategory, itemWaist: null, itemBust: null, itemInseam: 30 }).result, 'match');
      assert.equal(matcher({ garmentCategory, itemWaist: 28, itemBust: null, itemInseam: null }).result, 'match');
    }
    for (const garmentCategory of ['dresses', 'tops', 'jumpsuits', 'suits-and-sets', null]) {
      assert.equal(matcher({ garmentCategory, itemWaist: 28, itemBust: null, itemInseam: 30 }).result, 'match');
      assert.equal(matcher({ garmentCategory, itemWaist: 28, itemBust: 100, itemInseam: 30 }).result, 'not match');
      assert.equal(matcher({ garmentCategory, itemWaist: 28, itemBust: 36, itemInseam: 30 }).bustApplied, true);
    }
    assert.equal(api.createMatcher({ bust: 36 })({ garmentCategory: 'jeans', itemWaist: 28 }).result, 'undetermined');
    assert.equal(api.createMatcher({ bust: 36, inseam: 30 })({ garmentCategory: 'jeans', itemInseam: 30 }).result, 'match');
  });
  test(`${folder}: dresses ignore inseam without changing bust/waist outcomes or disabling legged-garment checks`, () => {
    const api = matching();
    const settings = { waist: 28, bust: 36, tolerance: 1 };
    const withoutInseam = api.createMatcher(settings);
    const withInseam = api.createMatcher({ ...settings, inseam: 30, inseamSmaller: 0.25, inseamLarger: 1.5 });
    for (const garmentCategory of ['dresses', ' Dresses ']) {
      for (const itemWaist of [null, 25, 28, 32]) for (const itemBust of [null, 33, 36, 40]) {
        for (const itemInseam of [null, 1, 29.75, 30, 31.5, 100]) {
          const item = { garmentCategory, itemWaist, itemBust, itemInseam };
          const result = withInseam(item);
          assert.equal(result.result, withoutInseam(item).result);
          assert.equal(result.inseamApplied, false);
          assert.equal(result.userInseam, 30);
          assert.equal(api.classify(result), result.result);
        }
      }
    }
    assert.equal(api.createMatcher({ inseam: 30 })({ garmentCategory: 'dresses', itemInseam: 30 }).result, 'undetermined');
    for (const garmentCategory of ['jeans', 'pants', 'shorts', 'jumpsuits', 'suits-and-sets', null]) {
      const result = withInseam({ garmentCategory, itemWaist: 28, itemBust: 36, itemInseam: 1 });
      assert.equal(result.result, 'not match');
      assert.equal(result.inseamApplied, true);
    }
  });
}
