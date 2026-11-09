const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

for (const folder of ['.', 'Measurement Matcher EXT']) {
  test(`${folder}: release keeps minimal permissions, packaged code and required icons`, () => {
    const manifest = JSON.parse(fs.readFileSync(`${folder}/manifest.json`, 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.name, 'Measurement Matcher');
    assert.ok(manifest.description.length <= 132);
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.therealreal.com/*']);
    assert.equal(manifest.host_permissions, undefined);
    for (const size of [16, 32, 48, 128]) {
      const data = fs.readFileSync(`${folder}/${manifest.icons[size]}`);
      assert.equal(data.subarray(1, 4).toString(), 'PNG');
      assert.equal(data.readUInt32BE(16), size);
      assert.equal(data.readUInt32BE(20), size);
    }
    const popup = fs.readFileSync(`${folder}/popup.html`, 'utf8');
    assert.match(popup, /for="waist"/);
    for (const key of ['hip', 'rise', 'legOpening']) {
      assert.ok(popup.includes(`for="${key}"`));
      assert.ok(popup.includes(`id="${key}Smaller"`));
      assert.ok(popup.includes(`id="${key}Larger"`));
      assert.ok(popup.includes(`id="${key}-range"`));
    }
    assert.match(popup, /id="data-disclosure"/);
    assert.match(popup, /href="privacy.html"/);
    assert.match(popup, /id="clear"/);
    for (const [, src] of popup.matchAll(/<script[^>]+src="([^"]+)"/g)) {
      assert.ok(!/^(?:https?:)?\/\//.test(src));
      assert.ok(fs.existsSync(`${folder}/${src}`));
    }
    const policy = fs.readFileSync(`${folder}/privacy.html`, 'utf8');
    assert.match(policy, /storage.sync/);
    assert.match(policy, /storage.local/);
    assert.match(policy, /Limited Use/);
    assert.match(policy, /zfrazerklo@gmail.com/);
  });
}
