# Measurement Matcher

A Chrome extension that compares TheRealReal garment measurements with saved waist, bust, hip, inseam, rise, and leg-opening preferences, supports independent smaller/larger allowances for each measurement, filters supported product grids, and saves checked listing observations for CSV download.

See [the project README](Measurement%20Matcher%20EXT/README.md) for the shopping workflow and [export specifications](EXPORTS.md) for CSV fields. This root directory is the source of truth for runtime code; the build keeps the older loadable `Measurement Matcher EXT` copy in sync.

Checked results now use their own **Previous / Next** controls with 24 listings per page. **Find more matches** continues checking additional TRR listings in the same scan. Result-page totals reflect the checked pool; changing the source search or sort starts a fresh scan.

The matcher automatically stays idle in recognized bags, shoes, and accessories sections. Those products are also skipped before measurement requests in mixed results and later-page checks, leaving them out of saved observations and outcome counts.

Bust is automatically ignored for recognized jeans, pants, shorts, and skirts. Keep bust saved for other garments; bottoms use waist and any reported, configured inseam. Dresses ignore inseam entirely. Hip applies across clothing when reported; rise and leg opening apply to recognized pants/jeans/trousers when reported. All six measurements are optional: missing listing values are skipped. A match needs at least one entered, applicable value to compare and no known mismatch.

## Chrome Web Store release

Version 1.9.2 is prepared as a release candidate. Run:

```sh
python3 scripts/build_release.py
```

The build runs the regression tests and JavaScript syntax checks, then creates `dist/measurement-matcher-1.9.2.zip` with the manifest at the ZIP root. It needs Python 3 and Node.js; no dependency installation is needed for packaging.

Use [the store submission document](CHROMEWEBSTORE.md) and [release checklist](store/RELEASE-CHECKLIST.md) to finish the submission. The [privacy policy](PRIVACY.md) is included in the popup and has a hostable HTML copy at `store/privacy-policy.html`. Before submission, a public policy URL, actual store screenshot, and current end-to-end TRR verification are still required. Building does not upload or publish the extension.
