# Chrome Web Store — Measurement Matcher

Last updated: November 11, 2026. Candidate: **1.9.2**. Status: **Chrome Web Store draft saved**.

This is the single source of truth for the listing, permissions, privacy declarations, and submission readiness. Developer registration and non-trader status are already complete.

## Submission readiness

- [x] Manifest V3; storage is the only API permission; site access is limited to `https://www.therealreal.com/*`.
- [x] Local executable code only; original PNG icons; bundled privacy disclosure and confirmed observation deletion.
- [x] 177 automated checks, runtime syntax checks, mirror parity, exact ZIP contents, and ZIP integrity pass.
- [x] Release ZIP: `dist/measurement-matcher-1.9.2.zip` (39,436 bytes); SHA-256 `58916b84185511296182a650ecab8cc162c7fe041124e8094b7a8398c420fadc`.
- [x] Merge the release and policy into the public repository and verify that the policy loads anonymously.
- [x] Live TRR spot checks recorded for a filtered results page, a direct product match, missing knitwear measurements, and an out-of-range coat.
- [x] Two 1280×800 screenshots captured with demonstration measurements.
- [x] Upload the ZIP, store icon, and two screenshots. Save the listing, privacy disclosures, and reviewer test instructions.
- [x] Save the publisher’s three data-use certifications.
- [ ] Verify the publisher contact and submit for review.

The public repository is [Measurement Matcher EXT](https://github.com/zo-klo/Measurement-Matcher-EXT). [Pull request #1](https://github.com/zo-klo/Measurement-Matcher-EXT/pull/1) contains the release update. Chrome Web Store item ID: `oiogmchnbpebanjkndjncckiejjjmdib`. Publication depends on Chrome’s review.

## Store listing

## Name

Measurement Matcher

## Summary (also in manifest; 109 characters)

Filter TheRealReal clothing by waist, bust, hip, inseam, rise, and leg opening. Export checked listings as CSV.

## Detailed description

Sizes like S, M, and L only tell you so much. Measurement Matcher helps you find better-fitting clothes on TheRealReal, a luxury resale site, by comparing the measurements in each listing with the ranges you choose.

Start with whatever matters for the garment you’re shopping for: waist, bust, hip, inseam, rise, or leg opening. You can give each measurement a different allowance in either direction. For example, for a 28-inch waist you might allow 0.25 inches smaller and 1.5 inches larger.

Save your settings and the extension checks clothing listings as you browse. See what matched, what was outside your range, and which items couldn’t be compared. Select Find more matches to check more listings in the same search. The matcher skips bags, shoes, and accessories.

Want to keep a record of what you checked? Export checked listings downloads a CSV with listing links, dates, measurements, match results, and available details like price, fabric, and condition. You can clear saved listings from the popup.

Checked listings stay in this Chrome installation. Your sizing preferences can sync through Chrome. The extension uses your existing TheRealReal browsing session and compares measurements in your browser. It has no developer-operated server, ads, or analytics.

Fit depends on the measurements available for each garment. Measurement Matcher is independent and is not affiliated with or endorsed by TheRealReal.

## Other dashboard fields

- Category: Shopping (or closest category offered by the dashboard).
- Primary language: English.
- Single purpose: Help users find clothing on TheRealReal within their chosen garment-measurement range and retain/export the checked listings used for those comparisons.
- Remote executable code: No.
- Homepage: https://github.com/zo-klo/Measurement-Matcher-EXT
- Support: https://github.com/zo-klo/Measurement-Matcher-EXT/issues
- Contact email: zfrazerklo@gmail.com, carried forward from the existing project; publisher should confirm.
- Publisher display name: use the registered publisher identity; verify in the dashboard.
- Distribution: Free of charge, public, and all regions, using the dashboard defaults.
- Publishing: deferred/manual publishing is available if approval should precede public availability.

## Privacy policy

Source: [PRIVACY.md](PRIVACY.md). The build produces identical bundled `privacy.html` and hostable `store/privacy-policy.html` copies.

Dashboard privacy policy URL: [Measurement Matcher Privacy Policy](https://github.com/zo-klo/Measurement-Matcher-EXT/blob/main/PRIVACY.md). An unauthenticated fetch matched the policy source after the release merge.

## Permission justifications

- `storage`: saves six measurement preferences and twelve directional allowances in `chrome.storage.sync`, and saves dated checked-listing observations in `chrome.storage.local` for CSV download and deletion.
- Site access/content scripts, `https://www.therealreal.com/*`: reads TRR garment details and product links, fetches same-origin product pages, and updates supported results grids and status messages. It does not access other websites.
- Remote code: select **No**. All extension JavaScript ships in the ZIP. TRR HTML and JSON are parsed as data, not executed as downloaded extension code.
- The extension does not request `tabs`, `downloads`, `history`, `cookies`, `<all_urls>`, or `unlimitedStorage`.

## Data usage declarations

The dashboard disclosures must include data handled locally as well as data sent elsewhere. Do not select “no user data handled.” Review the dashboard's current category definitions against these concrete facts:

- Web history: checked TRR product URLs and observation dates, including pages fetched to compare products.
- Website content: garment measurements, prices, brand, condition, fabric, and other extracted listing details.
- Sizing preferences: the user enters waist, bust, hip, inseam, rise, leg opening, and directional allowances to compare clothing. The listing and policy describe these inputs and Chrome sync. The dashboard’s Health information category is unchecked because the inputs are used for clothing fit.
- No names, email addresses, payment details, precise location, private communications, passwords, or cookie values are extracted or stored by the extension. A listing's public price is not the user's payment information. Normal same-origin page requests may carry Chrome-managed session cookies.
- No click, scroll, keystroke, or mouse tracking is implemented; entering measurement preferences is described above.

### Data flow for dashboard review

| Data | Stored | Off-device handling |
| --- | --- | --- |
| Entered measurements and directional allowances | Chrome sync preferences; also copied into each local observation | Google may synchronize preferences when Chrome sync is enabled; never sent to the developer or TRR by this extension |
| Checked product URLs, dates, scan/start-page identifiers | Chrome local observations | Normal HTTPS requests to TRR; no developer transmission |
| Extracted garment details and comparison results | Chrome local observations | Read from TRR; exported only when the user downloads a CSV |
| CSV | User's download location | Any later import, sharing, or folder backup is controlled by the user |

The publisher reviewed and confirmed the three data-use certifications, which were saved on November 11:

- [x] Data is not sold or transferred outside approved use cases.
- [x] Data is not used for purposes unrelated to the extension's single purpose.
- [x] Data is not used for creditworthiness or lending.

## Graphics and assets

| Asset | Dimensions | Status | File |
| --- | --- | --- | --- |
| Store icon | 128×128 PNG | Ready, with transparent padding | `icons/icon-128.png` |
| Filtered results screenshot | 1280×800 JPEG | Ready | [Filtered results](store/screenshot-filtered-results-1280x800.jpg) |
| Individual product screenshot | 1280×800 JPEG | Ready | [Product match](store/screenshot-product-match-1280x800.jpg) |
| Small promotional tile | 440×280 PNG | Available, optional | `store/promo-small-440x280.png` |

The first screenshot shows the settings popup, filtered grid, and 17 matches from 120 checked products. The second shows an individual garment match alongside TRR’s waist and hip measurements. Both are actual captures from the publisher’s November 11 browser test.

## Version history and verification

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 1.9.2 | 2026-11-09 | Publishing audit: sanitized product-card insertion with a plain DOM fallback, same-origin paging guard, coalesced progress/grid updates, accessible form submission and validation, awaited preference initialization, explicit CSP and Chrome 99 minimum | Draft; not submitted |

Current behavior also includes six optional measurements, directional allowances, category applicability, non-clothing exclusions, checked-result pagination, left-side progress, and CSV history with condition/fabric metadata.

177 deterministic checks pass across both loadable copies. Fourteen new checks cover safe card construction, progress/grid frame scheduling and stale work, off-origin rejection, form submission/focused errors, and failed preference reads. Automated fixtures cover native Sanitizer invocation. The November 11 results screenshot shows the rendered filtered grid during the publisher’s browser test. On Chrome without native `setHTML`, cards use a simpler text/image/link layout built through DOM APIs. No runtime dependency was added.

Known limits: TRR can change markup, omit measurements, or block requests; unknown data is not proof of fit. Chrome local storage has a quota. History includes older scans until cleared; exporting today does not mean all rows were checked today. Live spot checks establish the flows listed above. The reviewer scenarios below include additional coverage for pagination, optional measurements, and category handling.

## Reviewer test instructions

The dashboard’s 500-character field contains the short waist, filtered listing, and CSV walkthrough. Use the fuller scenarios below for release verification.

1. Install version 1.9.2 and pin Measurement Matcher to the toolbar.
2. Open the popup. Enter waist 28, leave bust blank, and set waist Smaller by to 0.25 and Larger by to 1.5. Click Save & apply on a TRR results page. The requested waist range is inclusive, 27.75–29.5 inches.
3. Use a current TRR clothing results page, for example `https://www.therealreal.com/sales/womens%20dresses`. TRR may require its own sign-in or human verification. The extension has no separate account, password, or subscription. Supply access instructions through the dashboard if the reviewer cannot reach product measurements; do not put personal TRR credentials in this file.
4. Compare a retained listing's measurements with its actual product page. Listings known outside the range should be hidden. If TRR blocks requests, the status explicitly reports paused/incomplete checks and unverified items remain visible. This is an access limitation, not a successful end-to-end filtering test.
5. Open the popup and choose Export checked listings. Verify the CSV header, URLs, UTC timestamps, measurements/differences, result values, and any available product metadata against the corresponding listing. Blank metadata means it was unavailable to the extractor.
6. Change an allowance and use Save & apply. Use Reload page to restart without saving unsaved edits.
7. Test Clear checked listings using disposable test observations: cancel first to verify preservation; then confirm and verify the saved observation list is cleared while sizing preferences and previously downloaded CSVs remain. Open TRR pages may save new observations.
8. Open Privacy & data and verify the bundled privacy policy loads without a network request.
9. Check that ten matches produce one results page and that Next/Previous show distinct slices when more than 24 results exist. Use Find more matches twice to verify it resumes rather than repeating products. Change the search or sort and verify the old grid is cleared and matching starts afresh.
10. Set inseam 30, Smaller by 0.25 and Larger by 1.5. Confirm that a garment with no reported inseam keeps its bust/waist outcome, while reported inseams outside 29.75–31.5 inches are excluded. Test inseam alone (missing garment value is undetermined), clear the input to disable it, and check the six appended CSV fields on fresh observations.
11. Visit bags, shoes, and accessories sections, including a New Arrivals category filter, and directly open a product from each. Confirm the matcher stays idle, native browsing remains available, and no fresh garment observations appear. In a mixed search, confirm clothing is checked while recognized non-clothing product URLs are never fetched for measurements. Navigate back to clothing and confirm matching restarts.
12. Save bust and waist, then check jeans without garment bust measurements. A waist/inseam fit should match; waist/inseam mismatches should not. A dress with matching waist but missing bust should also match; a dress with no comparable entered measurement remains undetermined. Verify the fresh CSV's garment_category and bust_applied fields without clearing saved bust settings.

13. Keep inseam saved while checking dresses. Ordinary missing-inseam dresses should retain their existing results. A reported/spurious inseam must also be ignored for a recognized dress; waist/bust remain in effect. Jeans and jumpsuits still compare reported inseams. Verify inseam_applied is false for dresses.
14. Configure hip, rise, and leg opening with independent directional allowances. Verify hip on dresses and pants, rise/opening only on pants/jeans/trousers, inclusive boundaries, missing optional values, and unknown categories. Confirm all new settings survive reopening the popup and that the 18 appended CSV fields match the garment values, rules, differences, and applicability flags. Rise/front rise must not borrow back rise; leg opening is not automatically doubled.

## Build and official references

Run `python3 scripts/build_release.py`. The build regenerates policy HTML, synchronizes the legacy loadable copy, checks JavaScript/tests/package contents, and creates the ZIP and checksum. The upload excludes docs, tests, artwork, private CSV/database files, and development artifacts.

Guidance checked November 9, 2026:
- [Publishing](https://developer.chrome.com/docs/webstore/publish)
- [Review timing](https://developer.chrome.com/docs/webstore/review-process/)
- [Required images](https://developer.chrome.com/docs/webstore/images)
- [Privacy fields and minimum permissions](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Local-data disclosures](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
