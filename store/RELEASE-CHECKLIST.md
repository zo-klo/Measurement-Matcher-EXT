# Release checklist — Measurement Matcher 1.9.2

Updated November 11, 2026. This is a release candidate, not a claim of Chrome Web Store approval. Developer registration and non-trader status are already handled by the publisher.

## Prepared in this workspace

- [x] Manifest V3 with a consistent public name, updated version and descriptive summary.
- [x] 16/32/48/128-pixel PNG icons and optional 440×280 promotional tile.
- [x] Only the `storage` API permission; content scripts restricted to TheRealReal.
- [x] All JavaScript packaged locally; no remote executable code or analytics.
- [x] Labeled popup controls, visible data disclosure, privacy link, CSV export, confirmed deletion of saved observations.
- [x] Source privacy policy plus identical bundled and hostable HTML copies.
- [x] Copy-ready listing text, single purpose, permission explanations, data declarations, and reviewer instructions in `../CHROMEWEBSTORE.md`.
- [x] Automated regression and package checks run by the build script.
- [x] Clean ZIP containing only runtime files, with `manifest.json` at its root and a SHA-256 checksum beside it.

## Required before submission

- [x] Confirmed the listing and data-use disclosures with the publisher.
- [x] Merged `PRIVACY.md` into the public repository, verified anonymous access, and entered its URL in the dashboard.
- [x] Live TRR spot checks: filtered grid, direct product match, missing-measurement handling, and a garment outside the saved range.
- [x] Capture actual screenshots using demonstration measurements. [Filtered results](screenshot-filtered-results-1280x800.jpg) and [product match](screenshot-product-match-1280x800.jpg) are both 1280×800 JPEGs.
- [x] Verified the publisher contact email in the developer dashboard.
- [x] Uploaded the 1.9.2 ZIP, store icon, and both screenshots. Saved the listing, privacy disclosures, and reviewer test instructions. Distribution is free and public in all regions.
- [x] Submitted 1.9.2 on November 11, 2026. The dashboard confirmed Pending review.

## Additional live regression coverage

- [ ] Complete a fresh live test on accessible TRR listings, including waist-only, bust-only, and inseam-only inputs, mixed garments with and without reported inseams, known matches and known mismatches, Save & apply, Reload page, metadata accuracy, CSV download, and missing-measurement behavior. The November 11 spot checks cover part of this matrix.
- [ ] Verify idle behavior on bags, shoes, and accessories sections and direct products, mixed-result exclusions, no new observations for skipped products, and automatic resumption on clothing navigation.
- [ ] Verify that saved inseam leaves ordinary dress results unchanged, reported/spurious dress inseam is ignored, waist/bust checks remain in force, and jeans/jumpsuits still compare inseam.
- [ ] Verify all six measurements individually and together: partial data can match, known mismatches still fail, no comparable data is undetermined, and blank preferences disable comparisons.
- [ ] Keep bust saved while checking jeans/bottoms with no bust measurement; verify waist/inseam matching, mixed-result and direct-product consistency, CSV category/application fields, and optional missing bust on dresses/tops.
- [ ] Verify hip across clothing and rise/leg opening on pants/jeans/trousers, directional boundaries, missing/inapplicable values, popup expansion/persistence, and all 18 appended export fields against real listings.

## Rebuild

From the project root:

```sh
python3 scripts/build_release.py
```

The root directory is the source of truth for runtime files. The build generates the policy HTML, updates the runtime files in `Measurement Matcher EXT` to match the root (preserving its README), runs the tests and JavaScript syntax checks, and writes the ZIP plus checksum into `dist`. Tests, docs, OS metadata, and store artwork are excluded from the upload ZIP. Every subsequent store upload needs a higher manifest version.

The asset generator requires Pillow for development only. Icons are already included, so rebuilding the ZIP has no Python package dependency.

## Official references (checked November 9, 2026)

- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare): production testing, manifest fields, ZIP layout.
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish): draft upload, listing tabs, review and deferred publishing.
- [Supplying images](https://developer.chrome.com/docs/webstore/images): required 128-pixel icon and at least one screenshot; screenshot dimensions; optional promotion sizes.
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy): single purpose, permissions, remote code, data declarations, public policy URL.
- [User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq): local data handling still requires disclosure.
- [Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use): purpose limitation and data-use statement.
