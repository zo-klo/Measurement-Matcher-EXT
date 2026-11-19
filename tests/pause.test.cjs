const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function fixture(folder, { paused, read, readError = false } = {}) {
  let changed;
  const calls = { starts: 0, syncReads: 0, reloads: 0, disconnects: 0, saves: 0, fetches: 0 };
  const frames = [];
  const warnings = [];
  const context = vm.createContext({ URL, AbortController,
    console: { log() {}, warn() {} }, document: { body: {} },
    window: {
      location: { href: 'https://www.therealreal.com/shop/women/clothing', reload() { calls.reloads++; } },
      setTimeout() { return 1; }, clearTimeout() {}, requestAnimationFrame(callback) { frames.push(callback); }
    },
    MutationObserver: class { observe() {} disconnect() { calls.disconnects++; } },
    CheckedListings: { async save() { calls.saves++; } },
    chrome: { runtime: { onMessage: { addListener() {} } }, storage: {
      onChanged: { addListener(callback) { changed = callback; } },
      local: { async get() { if (readError) throw Error('Local read failed'); return read ? await read : { matchingPaused: paused }; } },
      sync: { async get() { calls.syncReads++; return { waist: 28 }; } }
    } }
  });
  vm.runInContext(fs.readFileSync(`${folder}/matching.js`, 'utf8'), context);
  vm.runInContext(fs.readFileSync(`${folder}/contentscript.js`, 'utf8'), context);
  context.startMatcher = async () => { calls.starts++; };
  context.updateStatusBadge = message => warnings.push(message);
  await new Promise(setImmediate);
  return { context, calls, frames, warnings, changed,
    pause(value) { changed({ matchingPaused: { newValue: value } }, 'local'); } };
}

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: missing pause preference preserves matching; paused startup performs no scans or saves`, async () => {
    const enabled = await fixture(folder);
    assert.equal(enabled.calls.starts, 1);
    const paused = await fixture(folder, { paused: true });
    assert.equal(paused.calls.starts, 0);
    assert.equal(paused.calls.syncReads, 0);
    await paused.context.saveCheckedListing('https://www.therealreal.com/products/example', {}, {});
    assert.equal(paused.calls.saves, 0);
    assert.equal(paused.context.isCurrentView(), false);
    assert.equal(paused.calls.reloads, 0);
  });

  test(`${folder}: pause stops active requests and observers in every open tab and reloads once`, async () => {
    const tabs = await Promise.all([fixture(folder), fixture(folder)]);
    for (const f of tabs) {
      f.context.watchForNewProducts(() => {});
      f.context.fetch = (url, { signal }) => new Promise((resolve, reject) => {
        f.calls.fetches++;
        signal.addEventListener('abort', () => reject(Error('aborted')));
      });
      const request = f.context.fetchDocument('https://www.therealreal.com/products/example');
      const settled = assert.rejects(request, /aborted/);
      f.pause(true);
      f.pause(true);
      await settled;
      assert.equal(f.calls.fetches, 1);
      assert.equal(f.calls.disconnects, 1);
      assert.equal(f.calls.reloads, 1);
      assert.equal(f.context.isCurrentView(), false);
    }
  });

  test(`${folder}: late responses after pause cannot save, render or start new product checks`, async () => {
    const f = await fixture(folder);
    let finish;
    let paints = 0;
    f.context.getProductDocument = async () => {
      f.calls.fetches++;
      return new Promise(resolve => { finish = resolve; });
    };
    f.context.reorganizeGrid({}, [], []);
    f.context.paintGrid = () => { paints++; };
    const result = f.context.checkProduct('https://www.therealreal.com/products/example', () => ({}));
    const rejected = assert.rejects(result, error => error.constructor.name === 'StaleViewError');
    f.pause(true);
    finish({});
    await rejected;
    f.frames.forEach(callback => callback());
    await assert.rejects(f.context.checkProduct('https://www.therealreal.com/products/next', () => ({})));
    assert.equal(f.calls.fetches, 1);
    assert.equal(f.calls.saves, 0);
    assert.equal(paints, 0);
    assert.equal(f.context.summarizeScan().checkedCount, 0);
  });

  test(`${folder}: pausing discards queued worker checks`, async () => {
    const f = await fixture(folder);
    const started = [];
    let finish;
    const job = f.context.runWithConcurrency([1, 2, 3], 1, async item => {
      started.push(item);
      await new Promise(resolve => { finish = resolve; });
    });
    f.pause(true);
    finish();
    await job;
    assert.deepEqual(started, [1]);
  });

  test(`${folder}: resume reloads a paused tab and a fresh document restarts matching`, async () => {
    const f = await fixture(folder, { paused: true });
    f.pause(false);
    f.pause(false);
    assert.equal(f.calls.reloads, 1);
    const fresh = await fixture(folder, { paused: false });
    assert.equal(fresh.calls.starts, 1);
    assert.equal(fresh.calls.reloads, 0);
  });

  test(`${folder}: unrelated storage changes leave scans running and failed pause reads never start matching`, async () => {
    const f = await fixture(folder);
    f.changed({ 'checkedListing:one': { newValue: {} } }, 'local');
    f.changed({ matchingPaused: { newValue: true } }, 'sync');
    f.pause(false);
    assert.equal(f.calls.reloads, 0);
    assert.equal(f.context.isCurrentView(), true);
    const failed = await fixture(folder, { readError: true });
    assert.equal(failed.calls.starts, 0);
    assert.equal(failed.calls.syncReads, 0);
    assert.match(failed.warnings[0], /Matching could not start/);
  });

  test(`${folder}: a stale initial pause read cannot override a newer resume event`, async () => {
    let resolve;
    const read = new Promise(done => { resolve = done; });
    const f = await fixture(folder, { read });
    f.changed({ matchingPaused: { oldValue: true, newValue: false } }, 'local');
    resolve({ matchingPaused: true });
    await new Promise(setImmediate);
    assert.equal(f.calls.starts, 1);
    assert.equal(f.calls.reloads, 0);
    assert.equal(f.context.isCurrentView(), true);
  });
}
