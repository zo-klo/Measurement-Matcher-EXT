# Chrome Web Store — Measurement Matcher

Last updated: November 9, 2026. Candidate: **1.9.2**. Status: **prepared locally; not submitted**.

This is the single source of truth for the listing, permissions, privacy declarations, and submission readiness. Developer registration and non-trader status are already complete.

## Submission readiness

- [x] Manifest V3; storage is the only API permission; site access is limited to `https://www.therealreal.com/*`.
- [x] Local executable code only; original PNG icons; bundled privacy disclosure and confirmed observation deletion.
- [x] 177 automated checks, runtime syntax checks, mirror parity, exact ZIP contents, and ZIP integrity pass.
- [x] Release ZIP: `dist/measurement-matcher-1.9.2.zip` (39,436 bytes); SHA-256 `58916b84185511296182a650ecab8cc162c7fe041124e8094b7a8398c420fadc`.
- [ ] Merge the reviewed release/policy into the public repository, then verify the policy URL anonymously.
- [ ] Complete the current-version live TRR checks below. Fixtures do not establish compatibility with today's website.
- [ ] Capture at least one actual extension screenshot at 1280×800 or 640×400, without personal measurements or account details.
- [ ] Review publisher contact, data declarations, distribution, and dashboard draft; upload and submit for review.

The canonical public repository is https://github.com/zo-klo/Measurement-Matcher-EXT, verified public on November 9. Its existing main branch has version 1.2; this release should be reviewed in a draft PR before merging. No repository visibility change is required.

Submission by November 10 is a practical target once these items are complete. Publication depends on Chrome's review: typically a few days, sometimes a few weeks. No review date is guaranteed.

## Store listing

## Name

Measurement Matcher

## Summary (also in manifest; 109 characters)

Filter TheRealReal clothing by waist, bust, hip, inseam, rise, and leg opening. Export checked listings as CSV.

## Detailed description

Shop TheRealReal using garment measurements alongside tagged sizes. Measurement Matcher compares listed waist, bust, hip, inseam, rise, and leg-opening measurements with the measurements and directional allowances you enter, then filters supported product grids to help you find items in your chosen range.

HOW IT WORKS

• All six measurements are optional. Missing listing values are skipped. A match needs at least one entered, applicable measurement to compare and no known mismatch; otherwise, with nothing comparable, it is undetermined.

• Enter your desired measurements in inches: waist, bust, hip, inseam, rise, and/or leg opening. Leave a field blank to ignore it.
• Set separate Smaller by and Larger by allowances for each measurement. A 28-inch waist with 0.25 smaller and 1.5 larger accepts garments measuring 27.75–29.5 inches at the waist, including both endpoints.
• Dresses ignore inseam entirely. For other categories, inseam applies only when the listing reports it. Otherwise bust/waist matching stays unchanged, including for garments with no inseam. With inseam alone, an absent value is undetermined.
• Keep bust saved while shopping for jeans, pants, shorts, or skirts: bust is automatically ignored for recognized bottoms. Waist and any reported, configured inseam still apply. Other garments compare bust when it is available.
• Hip applies across clothing categories when reported. Rise and leg opening apply only to pants, jeans, and trousers when reported. Each has its own smaller/larger allowances; missing optional values are skipped. No width/circumference conversion is made.
• Save & apply restarts matching on the current TRR page. Reload page starts again with your saved settings.
• Bags, shoes, and accessories are skipped before measurement requests. Recognized sections stay idle with TRR's own grid and pagination; mixed results check eligible clothing only. Skipped products create no new CSV rows or undetermined counts.
• Matching products appear in the filtered grid. Items confirmed outside the range are hidden. If no matches are found on the current page, the extension can check up to five subsequent results pages for a match.
• Previous and Next browse checked results, with up to 24 listings per page. Find more matches checks additional listings in the same search. Page totals reflect the results checked so far, rather than TRR's unfiltered catalog.

CHECKED LISTING HISTORY AND CSV DOWNLOAD

As it checks products, the extension saves dated observations on your device: product URLs and available item IDs, scan identifiers and starting-page URLs, garment measurements, the measurements and twelve directional allowances used, which optional comparisons were applied, measurement differences, and match results. Price, currency, designer, sale information, fabric composition, and garment condition are included when extractable. This history includes products checked from results pages, even if you did not open them individually.

Use Export checked listings to download all saved observations as CSV for a spreadsheet or a manual PostgreSQL import. Clear checked listings removes saved observations after confirmation; open TRR pages can save new checks.

PRIVACY

Sizing preferences may sync through Chrome when Chrome sync is enabled. Checked listing observations stay in this Chrome installation. The extension requests TRR product pages using your existing browsing session, compares measurements inside the extension, and does not send your measurements or listing history to the developer. No analytics, advertising, or developer-operated server is included. The popup links to the full privacy policy.

PLEASE KNOW

Measurement Matcher supports TheRealReal only. Measurements and product details depend on what the site provides and the extension can extract; some fields may be unavailable. If TRR blocks or rate-limits measurement requests, checks pause and unverified listings remain visible with a label. This extension does not bypass site access controls. Measurements are a shopping aid, not a guarantee of fit.

Independent tool. Not affiliated with or endorsed by TheRealReal.

## Other dashboard fields

- Category: Shopping (or closest category offered by the dashboard).
- Primary language: English.
- Single purpose: Help users find clothing on TheRealReal within their chosen garment-measurement range and retain/export the checked listings used for those comparisons.
- Remote executable code: No.
- Homepage: https://github.com/zo-klo/Measurement-Matcher-EXT
- Support: https://github.com/zo-klo/Measurement-Matcher-EXT/issues
- Contact email: zfrazerklo@gmail.com, carried forward from the existing project; publisher should confirm.
- Publisher display name: use the registered publisher identity; verify in the dashboard.
- Visibility: Public is the intended launch; select regions and price in the dashboard after review.
- Publishing: deferred/manual publishing is available if approval should precede public availability.

## Privacy policy

Source: [PRIVACY.md](PRIVACY.md). The build produces identical bundled `privacy.html` and hostable `store/privacy-policy.html` copies.

Planned stable public URL after merge:
https://github.com/zo-klo/Measurement-Matcher-EXT/blob/main/PRIVACY.md

**This URL is not ready yet:** main does not contain the policy. After merging, verify it loads without a GitHub sign-in before entering it in the dashboard. GitHub Pages is not required for a publicly readable policy document.

## Permission justifications

- `storage`: saves six measurement preferences and twelve directional allowances in `chrome.storage.sync`, and saves dated checked-listing observations in `chrome.storage.local` for CSV download and deletion.
- Site access/content scripts, `https://www.therealreal.com/*`: reads TRR garment details and product links, fetches same-origin product pages, and updates supported results grids and status messages. It does not access other websites.
- Remote code: select **No**. All extension JavaScript ships in the ZIP. TRR HTML and JSON are parsed as data, not executed as downloaded extension code.
- The extension does not request `tabs`, `downloads`, `history`, `cookies`, `<all_urls>`, or `unlimitedStorage`.

## Data usage declarations

The dashboard disclosures must include data handled locally as well as data sent elsewhere. Do not select “no user data handled.” Review the dashboard's current category definitions against these concrete facts:

- Web history: checked TRR product URLs and observation dates, including pages fetched to compare products.
- Website content: garment measurements, prices, brand, condition, fabric, and other extracted listing details.
- Health information: conservatively disclose the user-entered physical body measurements (waist, bust, hip, inseam, rise, and leg opening). No diagnosis or medical records are involved.
- No names, email addresses, payment details, precise location, private communications, passwords, or cookie values are extracted or stored by the extension. A listing's public price is not the user's payment information. Normal same-origin page requests may carry Chrome-managed session cookies.
- No click, scroll, keystroke, or mouse tracking is implemented; entering measurement preferences is described above.
- The three Limited Use certifications can be affirmed for this code: data is not sold; it is used only for the stated single purpose; it is not used for creditworthiness or lending. Review the exact current wording before certifying.

### Data flow for dashboard review

| Data | Stored | Off-device handling |
| --- | --- | --- |
| Entered measurements and directional allowances | Chrome sync preferences; also copied into each local observation | Google may synchronize preferences when Chrome sync is enabled; never sent to the developer or TRR by this extension |
| Checked product URLs, dates, scan/start-page identifiers | Chrome local observations | Normal HTTPS requests to TRR; no developer transmission |
| Extracted garment details and comparison results | Chrome local observations | Read from TRR; exported only when the user downloads a CSV |
| CSV | User's download location | Any later import, sharing, or folder backup is controlled by the user |

The code supports the following certifications, but the publisher must review the exact dashboard wording before attesting:

- [ ] Data is not sold to third parties.
- [ ] Data is not used for purposes unrelated to the extension's single purpose.
- [ ] Data is not used for creditworthiness or lending.

## Graphics and assets

| Asset | Dimensions | Status | File |
| --- | --- | --- | --- |
| Store icon | 128×128 PNG | Ready, with transparent padding | `icons/icon-128.png` |
| Screenshot | 1280×800 or 640×400 | Required; pending actual capture | — |
| Small promotional tile | 440×280 PNG | Ready, optional | `store/promo-small-440x280.png` |

Capture the real popup and/or filtered TRR grid, using demonstration values. Show the left-side progress panel and checked-result navigation where possible. A blocked page or a mockup is not verification of working filtering.

## Version history and verification

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 1.9.2 | 2026-11-09 | Publishing audit: sanitized product-card insertion with a plain DOM fallback, same-origin paging guard, coalesced progress/grid updates, accessible form submission and validation, awaited preference initialization, explicit CSP and Chrome 99 minimum | Draft; not submitted |

Current behavior also includes six optional measurements, directional allowances, category applicability, non-clothing exclusions, checked-result pagination, left-side progress, and CSV history with condition/fabric metadata.

177 deterministic checks pass across both loadable copies. Fourteen new checks cover safe card construction, progress/grid frame scheduling and stale work, off-origin rejection, form submission/focused errors, and failed preference reads. Native Sanitizer invocation is tested with a mock; its actual browser rendering still needs the live check. On Chrome without native `setHTML`, cards use a simpler text/image/link layout built through DOM APIs. No runtime dependency was added.

Known limits: TRR can change markup, omit measurements, or block requests; unknown data is not proof of fit. Chrome local storage has a quota. History includes older scans until cleared; exporting today does not mean all rows were checked today. The latest candidate has not completed an independent end-to-end browser run. No CWS upload, legal attestation, submission, or publication has occurred. No rejection history is known.

## Reviewer test instructions

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
