#!/usr/bin/env python3
"""Build a clean Chrome Web Store ZIP from the root extension sources."""
import hashlib
import html
import json
from pathlib import Path
import struct
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MIRROR = ROOT / 'Measurement Matcher EXT'
manifest = json.loads((ROOT / 'manifest.json').read_text())
assert manifest['manifest_version'] == 3
assert manifest['permissions'] == ['storage'], 'Review any new permissions before packaging'
assert len(manifest['description']) <= 132
assert manifest['content_scripts'][0]['matches'] == ['https://www.therealreal.com/*']

# Keep the bundled and publicly hosted policy readable from one source.
policy = (ROOT / 'PRIVACY.md').read_text()
assert f'version {manifest["version"]}' in policy, 'Update the privacy policy for this release'
blocks = []
for paragraph in policy.strip().split('\n\n'):
    if paragraph.startswith('# '):
        blocks.append('<h1>' + html.escape(paragraph[2:]) + '</h1>')
    elif paragraph.startswith('## '):
        blocks.append('<h2>' + html.escape(paragraph[3:]) + '</h2>')
    else:
        blocks.append('<p>' + html.escape(paragraph).replace('\n', ' ') + '</p>')
page = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Measurement Matcher — Privacy Policy</title>
<style>body{max-width:760px;margin:40px auto;padding:0 24px 40px;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172d34;background:#f7f9f8}h1{font-size:30px;line-height:1.2}h2{font-size:20px;margin-top:30px}p{margin:14px 0}</style>
</head><body>''' + '\n'.join(blocks) + '</body></html>\n'
(ROOT / 'privacy.html').write_text(page)
(ROOT / 'store' / 'privacy-policy.html').write_text(page)
files = ['manifest.json', 'popup.html', 'popup.css', 'popup.js', 'contentscript.js', 'checked-listings.js', 'matching.js', 'privacy.html']
files += [f'icons/icon-{size}.png' for size in [16, 32, 48, 128]]
for size in [16, 32, 48, 128]:
    data = (ROOT / f'icons/icon-{size}.png').read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II', data[16:24]) == (size, size)
# The older loadable folder is a runtime mirror. Preserve its README.
for name in files:
    target = MIRROR / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes((ROOT / name).read_bytes())
subprocess.run(['node', '--test', *[str(p) for p in sorted((ROOT / 'tests').glob('*.test.cjs'))]], cwd=ROOT, check=True)
for name in ['popup.js', 'contentscript.js', 'checked-listings.js', 'matching.js']:
    subprocess.run(['node', '--check', str(ROOT / name)], check=True)
dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
archive = dist / f'measurement-matcher-{manifest["version"]}.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
    for name in sorted(files):
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 22, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        bundle.writestr(info, (ROOT / name).read_bytes())
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    assert sorted(bundle.namelist()) == sorted(files)
    assert json.loads(bundle.read('manifest.json')) == manifest
    for name in files:
        assert bundle.read(name) == (ROOT / name).read_bytes()
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(archive.with_suffix('.sha256')).write_text(f'{digest}  {archive.name}\n')
print(f'Built {archive} ({archive.stat().st_size:,} bytes)\nSHA-256 {digest}')
