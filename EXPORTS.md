# Checked listing exports

Sizing preferences are saved in `chrome.storage.sync`. Each successful garment evaluation saves a dated observation in `chrome.storage.local`, including checks from results pages, later pages, and directly opened products. Failed, denied, timed-out, or skipped non-clothing checks do not create observations.

## Matching and download workflow (version 1.9.0)

1. Enter any of waist, bust, hip, inseam, rise, or leg opening in inches, with independent **Smaller by / Larger by** allowances. Leave unused measurements blank. Blank allowances mean zero.
2. Click **Save & apply** to save preferences and reload TRR. **Reload page** restarts with saved settings without saving unsaved popup edits.
3. Browse supported clothing. All measurements are optional when missing from a listing. A match requires at least one entered, applicable measurement that the garment reports, and every comparison made must pass its inclusive range. Any known out-of-range comparison gives `not match`; no comparable entered measurement gives `undetermined`.
4. Click **Export checked listings** to download a UTF-8 `checked-listings-YYYY-MM-DD.csv`. The filename and observation timestamps use UTC. Export includes all saved history in chronological order, keeps saved records, and does not re-fetch or reclassify historical observations.

For example, waist 28 with 0.25 smaller and 1.5 larger accepts 27.75–29.5 inches. A matching waist can establish a match when configured bust is missing. A known bust mismatch still fails when bust applies. If neither requested measurement is available, the result is undetermined.

Bust is ignored for recognized jeans, pants/trousers, shorts, skirts, and bottoms. Dresses ignore inseam. Hip applies across clothing. Rise and leg opening apply only to recognized pants, jeans, and trousers. Other/unknown categories retain the reported-inseam rule, with rise/opening skipped. Applicability comes from each garment's categorized URL or same-site canonical URL, rather than the search-page category.

## CSV columns

Columns are appended as features are introduced; existing column positions are preserved. Measurements, allowances, and differences use inches. Differences are garment minus user target.

| Columns | Meaning |
| --- | --- |
| `product_url`, `item_id`, `observed_at` | Canonical product URL, available item number, and ISO 8601 UTC observation time. |
| `garment_bust`, `garment_waist`, `user_bust`, `user_waist` | Observed garment measurements and saved preferences used. |
| `tolerance`, `bust_difference`, `waist_difference`, `result` | Legacy symmetric rule, signed differences, and `match` / `not match` / `undetermined`. |
| `product_price`, `currency`, `on_sale`, `designer` | Available price, currency, explicit/comparable-price sale status, and brand. |
| `estimated_percent_off_retail`, `fabric_composition`, `garment_condition` | Available listed retail discount, full fabric/lining composition, and condition. |
| `waist_smaller_allowance`, `waist_larger_allowance`, `bust_smaller_allowance`, `bust_larger_allowance` | Directional waist/bust bounds used for the check. |
| `scan_id`, `search_url` | Random page-load scan ID and its starting page URL, including later-page evaluations. |
| `garment_inseam`, `user_inseam`, `inseam_smaller_allowance`, `inseam_larger_allowance`, `inseam_difference`, `inseam_applied` | Inseam observation, preference, rule, difference, and whether comparison ran. |
| `garment_category`, `bust_applied` | Recognized per-product category and whether bust comparison ran. |
| `garment_hip`, `user_hip`, `hip_smaller_allowance`, `hip_larger_allowance`, `hip_difference`, `hip_applied` | Corresponding fields for hip. |
| `garment_rise`, `user_rise`, `rise_smaller_allowance`, `rise_larger_allowance`, `rise_difference`, `rise_applied` | Corresponding fields for rise. |
| `garment_leg_opening`, `user_leg_opening`, `leg_opening_smaller_allowance`, `leg_opening_larger_allowance`, `leg_opening_difference`, `leg_opening_applied` | Corresponding fields for leg opening. |

Missing values are stored as null and exported as empty fields. Raw listing values and preferences remain in observations even when their comparison is inapplicable. Application flags distinguish a comparison that ran from one skipped for missing, disabled, or inapplicable data. Leg opening is not doubled or converted between width and circumference. Rise/front rise never substitutes back rise.

The legacy `tolerance` field is populated for new observations only when the four waist/bust allowances and all configured additional measurements' allowances agree. Historical symmetric tolerance fills only the original four directional columns at export. New inseam/hip/rise/opening allowances default to zero rather than inheriting old tolerance. Fields introduced after an old observation remain blank: scan provenance since 1.4.2, inseam since 1.6.0, category/bust applicability since 1.7.1, hip/rise/opening since 1.8.0. Existing results and stored records are never rewritten.

## Extraction, counts, and retention

Main-product/component measurement attributes in TRR's `__NEXT_DATA__` take priority over legacy detail text. Generic size charts and recommendations do not supply main-product measurements. Aliases include Hip/Hips, Rise/Front Rise, and Leg Opening. Main-product condition, SKU, and fabric attributes supply metadata, with semantic/legacy fallbacks. Rechecking a listing creates a fresh observation; it does not repair older blank records.

The progress panel counts the current page-load scan, including later-page checks. Compare its scan ID with CSV rows using `scan_id`; earlier scans remain in the export. Cached rerenders and Previous/Next result pages do not save or count a product again. Find more matches resumes the same scan/cursor. Changing TRR search/sort/source-page URL resets the document and scan. Missing-data `undetermined` and failed-load `unchecked` counts remain distinct.

Recognized bags/handbags, shoes, and accessories sections stay idle. Their product links are excluded before measurement fetches in mixed searches and later-page checks. Unknown categories remain eligible so clothing is not accidentally skipped. Excluded products do not create records or outcome counts; older observations stay in history.

Observations use independent storage keys to avoid concurrent overwrites. They remain on this Chrome installation, subject to Chrome's storage quota, until cleared or uninstalled; there is no expiry. **Clear checked listings** removes observations after confirmation while preserving synced preferences and downloaded files. Open TRR pages can save fresh records. Storage errors are reported while filtering continues.

Requests have a 15-second deadline covering headers and response body. Timeout or TRR denial/rate limiting pauses new checks for the page. Unchecked listings remain labeled and are not saved as garments. Reload later to retry; access controls are not bypassed.

CSV preserves commas, quotes, and line breaks. Scraped text that could execute as a spreadsheet formula receives an apostrophe prefix. No PostgreSQL connection or SQL script is included; import downloads with your preferred tools.

Run `python3 scripts/build_release.py` from the project root to regenerate privacy HTML, synchronize both loadable copies, run regression/syntax/package checks, and create the release ZIP. Run `node --test tests/*.test.cjs` for regression checks alone.
