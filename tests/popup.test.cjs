const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function popup(folder, { loadError = false, saveError = false, messageError = false, confirmClear = true, clearError = false, savedData = { waist: 28, bust: 36, tolerance: 2 } } = {}) {
  const elements = Object.fromEntries(['hip', 'hipSmaller', 'hipLarger', 'hip-range', 'rise', 'riseSmaller', 'riseLarger', 'rise-range', 'legOpening', 'legOpeningSmaller', 'legOpeningLarger', 'legOpening-range', 'pants-measurements', 'waist', 'bust', 'inseam', 'inseamSmaller', 'inseamLarger', 'inseam-range', 'waistSmaller', 'waistLarger', 'bustSmaller', 'bustLarger', 'waist-range', 'bust-range', 'save', 'reload', 'settings-status', 'settings-form', 'export', 'export-status', 'clear']
    .map(id => [id, { _value: '', get value() { return this._value; }, set value(value) { this._value = String(value); }, disabled: false, textContent: '', attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key] || null; }, removeAttribute(key) { delete this.attrs[key]; }, closest() { return elements['pants-measurements']; }, focus() { this.focused = true; }, addEventListener(type, handler) { this[type] = handler; } }]));
  const actions = [];
  const context = vm.createContext({ document: { getElementById(id) { return elements[id]; } },
    chrome: { storage: { sync: {
      async get() { if (loadError) throw new Error('load failed'); return savedData; },
      async set(settings) { if (saveError) throw new Error('sync failed'); actions.push(['save', { ...settings }]); }
    } }, tabs: {
      async query() { return [{ id: 7 }]; },
      async sendMessage(id, message) { if (messageError) throw new Error('no content script'); actions.push(['apply', id, message.type]); },
      async reload() { actions.push(['reload']); }
    } }, window: { confirm() { return confirmClear; }, close() { actions.push(['close']); } }, CheckedListings: { async clear() { if (clearError) throw new Error('local failed'); actions.push(['clear']); } }, console: { error() {} }
  });
  vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8'), context);
  vm.runInContext(fs.readFileSync(`${folder}/popup.js`, 'utf8'), context);
  elements.save.click = () => elements['settings-form'].submit({ preventDefault() {} });
  await new Promise(setImmediate);
  return { elements, actions };
}
for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: Enter/submit prevents navigation, validates and focuses the invalid field`, async () => {
    const { elements, actions } = await popup(folder);
    let prevented = false;
    elements.rise.value = '-1';
    await elements['settings-form'].submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(elements.rise.focused, true);
    assert.equal(elements.rise.getAttribute('aria-invalid'), 'true');
    assert.match(elements.rise.getAttribute('aria-describedby'), /settings-status/);
    assert.equal(elements['pants-measurements'].open, true);
    assert.deepEqual(actions, []);
    elements.rise.value = '10';
    elements.rise.input();
    assert.equal(elements.rise.getAttribute('aria-invalid'), null);
    await elements['settings-form'].submit({ preventDefault() {} });
    assert.equal(actions[0][0], 'save');
  });
  test(`${folder}: a failed initial settings read is visible and prevents overwriting preferences`, async () => {
    const { elements, actions } = await popup(folder, { loadError: true });
    assert.match(elements['settings-status'].textContent, /could not be loaded/);
    assert.equal(elements.save.disabled, true);
    await elements.save.click();
    assert.deepEqual(actions, []);
  });
  test(`${folder}: new measurements preview and persist independently, and pants details open for saved values`, async () => {
    const original = await popup(folder);
    assert.equal(original.elements['pants-measurements'].open, false);
    const targets = { hip: 39, rise: 10, legOpening: 15 };
    for (const [key, value] of Object.entries(targets)) {
      original.elements[key].value = String(value);
      original.elements[key + 'Smaller'].value = '0.25';
      original.elements[key + 'Larger'].value = '1.5';
      original.elements[key].input();
      assert.equal(original.elements[key + '-range'].textContent, `Accepts ${value - 0.25}–${value + 1.5} inches.`);
    }
    await original.elements.save.click();
    const savedData = original.actions[0][1];
    const reopened = await popup(folder, { savedData });
    assert.equal(reopened.elements['pants-measurements'].open, true);
    for (const [key, value] of Object.entries(targets)) {
      assert.equal(savedData[key], value);
      assert.equal(savedData[key + 'Smaller'], 0.25);
      assert.equal(savedData[key + 'Larger'], 1.5);
      assert.equal(reopened.elements[key].value, String(value));
      reopened.elements[key].value = '';
    }
    await reopened.elements.save.click();
    for (const key of Object.keys(targets)) assert.equal(reopened.actions[0][1][key], null);
    assert.equal(reopened.actions[0][1].waist, 28);
    const unsaved = await popup(folder);
    unsaved.elements.hip.value = '100';
    await unsaved.elements.reload.click();
    assert.deepEqual(unsaved.actions, [['reload'], ['close']]);
  });
  test(`${folder}: invalid new measurements and allowances cannot be saved`, async () => {
    for (const key of ['hip', 'rise', 'legOpening']) {
      for (const value of ['-1', '0', 'abc', 'Infinity']) {
        const { elements, actions } = await popup(folder);
        elements[key].value = value;
        await elements.save.click();
        assert.deepEqual(actions, []);
      }
      for (const direction of ['Smaller', 'Larger']) {
        const { elements, actions } = await popup(folder);
        elements[key + direction].value = '-0.1';
        await elements.save.click();
        assert.deepEqual(actions, []);
      }
    }
  });
  test(`${folder}: Save & apply clears an unused bust and applies only after preferences are saved`, async () => {
    const { elements, actions } = await popup(folder);
    elements.bust.value = '';
    await elements.save.click();
    assert.deepEqual(actions, [['save', { waist: 28, bust: null, inseam: null, waistSmaller: 2, waistLarger: 2, bustSmaller: 2, bustLarger: 2, inseamSmaller: 0, inseamLarger: 0, hip: null, rise: null, legOpening: null, hipSmaller: 0, hipLarger: 0, riseSmaller: 0, riseLarger: 0, legOpeningSmaller: 0, legOpeningLarger: 0 }], ['apply', 7, 'reload-fit-matcher'], ['close']]);
  });
  test(`${folder}: Reload page resets the active tab without saving unsaved edits`, async () => {
    const { elements, actions } = await popup(folder);
    elements.waist.value = '99';
    await elements.reload.click();
    assert.deepEqual(actions, [['reload'], ['close']]);
  });
  test(`${folder}: failed saves do not apply or close; saved settings survive a missing TRR content script`, async () => {
    const failed = await popup(folder, { saveError: true });
    await failed.elements.save.click();
    assert.equal(failed.actions.length, 0);
    assert.match(failed.elements['settings-status'].textContent, /could not be saved/);
    const elsewhere = await popup(folder, { messageError: true });
    await elsewhere.elements.save.click();
    assert.deepEqual(elsewhere.actions.map(action => action[0]), ['save']);
    assert.match(elsewhere.elements['settings-status'].textContent, /Saved/);
  });
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: clearing needs confirmation, preserves sizing preferences and reports errors`, async () => {
    const canceled = await popup(folder, { confirmClear: false });
    await canceled.elements.clear.click();
    assert.deepEqual(canceled.actions, []);
    const cleared = await popup(folder);
    await cleared.elements.clear.click();
    assert.deepEqual(cleared.actions, [['clear']]);
    assert.match(cleared.elements['export-status'].textContent, /cleared/);
    assert.equal(cleared.elements.export.disabled, false);
    const failed = await popup(folder, { clearError: true });
    await failed.elements.clear.click();
    assert.match(failed.elements['export-status'].textContent, /could not be cleared/);
    assert.equal(failed.elements.clear.disabled, false);
    assert.equal(failed.elements.export.disabled, false);
  });
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: loads old ± settings, previews ranges, and saves four independent allowances`, async () => {
    const { elements, actions } = await popup(folder);
    for (const key of ['waistSmaller', 'waistLarger', 'bustSmaller', 'bustLarger']) assert.equal(elements[key].value, '2');
    elements.waistSmaller.value = '0.25';
    elements.waistLarger.value = '1.5';
    elements.bustSmaller.value = '0.5';
    elements.bustLarger.value = '2.25';
    elements.waistSmaller.input();
    assert.equal(elements['waist-range'].textContent, 'Accepts 27.75–29.5 inches.');
    assert.equal(elements['bust-range'].textContent, 'Accepts 35.5–38.25 inches.');
    await elements.save.click();
    assert.deepEqual(actions[0], ['save', { waist: 28, bust: 36, inseam: null, waistSmaller: 0.25, waistLarger: 1.5, bustSmaller: 0.5, bustLarger: 2.25, inseamSmaller: 0, inseamLarger: 0, hip: null, rise: null, legOpening: null, hipSmaller: 0, hipLarger: 0, riseSmaller: 0, riseLarger: 0, legOpeningSmaller: 0, legOpeningLarger: 0 }]);
  });
  test(`${folder}: saved directional values persist across popup opens and blank allowances become zero`, async () => {
    const savedData = { waist: 28, bust: null, tolerance: 2, waistSmaller: 0, waistLarger: 1.5, bustSmaller: 0.25, bustLarger: 0 };
    const { elements, actions } = await popup(folder, { savedData });
    assert.equal(elements.waistSmaller.value, '0');
    assert.equal(elements.waistLarger.value, '1.5');
    assert.equal(elements.bustSmaller.value, '0.25');
    assert.equal(elements.bustLarger.value, '0');
    assert.equal(elements.bust.value, '');
    elements.waistLarger.value = '';
    await elements.save.click();
    assert.equal(actions[0][1].waistLarger, 0);
    assert.equal(actions[0][1].bust, null);
  });
  test(`${folder}: rejects negative allowances and invalid numbers before saving`, async () => {
    for (const key of ['waistSmaller', 'waistLarger', 'bustSmaller', 'bustLarger', 'inseamSmaller', 'inseamLarger']) {
      const { elements, actions } = await popup(folder);
      elements[key].value = '-0.25';
      await elements.save.click();
      assert.deepEqual(actions, []);
      assert.match(elements['settings-status'].textContent, /zero or positive/);
    }
    for (const value of ['abc', 'Infinity']) {
      const { elements, actions } = await popup(folder);
      elements.waistSmaller.value = value;
      await elements.save.click();
      assert.deepEqual(actions, []);
    }
    const { elements, actions } = await popup(folder);
    elements.bust.validity = { badInput: true };
    await elements.save.click();
    assert.deepEqual(actions, []);
  });
  test(`${folder}: inseam preferences preview, persist in sync, and can be cleared independently`, async () => {
    const savedData = { waist: 28, bust: null, inseam: 30, inseamSmaller: 0.25, inseamLarger: 1.5 };
    const { elements, actions } = await popup(folder, { savedData });
    assert.equal(elements.inseam.value, '30');
    assert.equal(elements['inseam-range'].textContent, 'Accepts 29.75–31.5 inches.');
    elements.inseamLarger.value = '2';
    elements.inseamLarger.input();
    assert.equal(elements['inseam-range'].textContent, 'Accepts 29.75–32 inches.');
    await elements.save.click();
    assert.equal(actions[0][1].inseam, 30);
    assert.equal(actions[0][1].inseamSmaller, 0.25);
    assert.equal(actions[0][1].inseamLarger, 2);
    const reopened = await popup(folder, { savedData: actions[0][1] });
    assert.equal(reopened.elements.inseamLarger.value, '2');
    reopened.elements.inseam.value = '';
    await reopened.elements.save.click();
    assert.equal(reopened.actions[0][1].inseam, null);
    assert.equal(reopened.actions[0][1].waist, 28);
  });
  test(`${folder}: invalid inseam measurements cannot be saved`, async () => {
    for (const value of ['-1', '0', 'abc', 'Infinity']) {
      const { elements, actions } = await popup(folder);
      elements.inseam.value = value;
      await elements.save.click();
      assert.deepEqual(actions, []);
      assert.match(elements['settings-status'].textContent, /positive measurements/);
    }
  });
}
