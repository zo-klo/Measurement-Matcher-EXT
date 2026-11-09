# TRR Measurement Matcher EXT

As a big fan of second-hand shopping and the luxury consignment site TheRealReal, I found myself constantly having to check product measurements, even when I filtered by size. I decided to build Measurement Matcher for my own personal use, inspired by sites like [Secondsense](https://secondsense.co/), who do a great service to the second-hand fashion community. Vintage sizing is notoriously inconsistent; The purpose of this project is to improve the user experience of second-hand shoppers by enabling shoppers to filter products according to clothing measurements rather than label size.

## What It Does

Measurement Matcher is a Chrome extension built to help shoppers browse resale listings with more confidence. Instead of relying on a tagged size like `S`, `M`, or `8`, the extension compares a shopper's saved waist, bust, hip, inseam, rise, and leg-opening preferences against the measurements listed on product pages.

When a listing page is loaded, the extension:

- skips bags, shoes, and accessories before requesting product measurements
- checks product measurements in the background
- shows checked results in pages of up to 24 listings
- hides items outside the selected range
- can pull in matching products from later pages when the current page has no matches
- provides **Find more matches** to check additional listings when you want more results
- saves dated observations of checked listings locally and lets users download them as a CSV

## How It Works

Users enter:

- waist measurement
- bust measurement
- optional hip and inseam measurements
- optional rise and leg-opening targets for pants
- separate smaller and larger allowances for each measurement, in inches

The extension stores those preferences, reads measurement details from supported product pages, and filters product grids based on whether an item falls within the shopper's preferred range.

Hip applies to any clothing category, including dresses, skirts, tops, and pants, when the listing reports it. Rise and leg opening apply only to recognized pants, jeans, and trousers. All six measurements have independent smaller/larger allowances and are ignored when absent. A match needs at least one entered, applicable measurement to compare; if none can be compared, the result is undetermined. Leave a measurement blank to disable its rule. Inseam, rise, and leg opening are grouped in an expandable popup section that opens automatically when one of those preferences is saved.

Use the listing's inch values for rise and leg opening; the extension does not double widths or convert them to circumference. Rise reads the listed rise/front rise and never substitutes back rise. New allowances default to zero and do not inherit old symmetric tolerance.

Bust is ignored for recognized jeans, pants/trousers, shorts, skirts, and bottoms, even when a bust preference is saved. Those garments use the configured waist and any reported, configured inseam. Bust still applies to other categories, including tops, dresses, jumpsuits, and suits/sets. If bust is missing, it is skipped; available requested measurements determine the result. Entering bust alone cannot establish a fit for bottoms; at least one applicable measurement must be comparable. Category recognition uses each garment's product URL or its same-site canonical URL, rather than applying the search-page category to every item in mixed results.

On recognized bags, shoes, and accessories sections, the matcher stays idle and leaves TRR's grid and pagination intact. It makes no product-measurement requests or listing observations there, including when you directly open a recognized product from those categories. In mixed searches and later-page checks, those product links are excluded before fetching. Skipped products are not matches, mismatches, undetermined results, or new CSV rows; historical observations remain saved. Navigation back to clothing restarts matching automatically.

Dresses ignore inseam entirely, even if a value is reported. For other categories, inseam is applied only when the listing reports one. For example, inseam 30 with 0.25 smaller and 1.5 larger accepts 29.75–31.5 inches. A listing without a reported inseam keeps its existing bust/waist result, so adding inseam does not exclude dresses, skirts, or tops just because the field is absent. This also means an unreported trouser inseam is skipped rather than inferred from category. With inseam as the only configured measurement, an absent garment inseam is undetermined. Leave the inseam input blank to disable its rule entirely.

### Browsing checked matches

**Previous** and **Next** move through the results already checked in this scan, with up to 24 listings per page. Ten matches make one results page; zero matches show page 0 of 0. TRR's original pagination is hidden while the filtered grid is active. Unchecked listings remain visible with a label if their product pages fail to load, and are counted separately from matches.

**Find more matches** resumes from the next unchecked listing in the same search. Each click looks for up to 24 additional matches, loading at most five additional TRR source pages. It retains the rest of a partly checked source page for the next click and avoids adding duplicate products. If the starting page has no results, the extension still automatically searches up to five later source pages for an initial match.

The results-page total describes the results checked so far. TRR's original item total still describes its unfiltered catalog. Changing the TRR search, sort, or source-page URL reloads the document and starts a fresh scan so previous results do not carry over. Your saved settings and listing history remain available.

**Development note**: I developed this as a personal project and used LLM assistance with the JavaScript implementation. The shopping problem, measurement-based matching criteria, and feature decisions came from my own experience using resale sites.

## Project Goal

The goal of this project is to make resale shopping faster, less frustrating, and more accessible for people who need clothing to match their actual measurements, not just a nominal size tag. This is especially important for women outside of the standard size range, or with proportions that do not match typical industry patterns. 

Eventually, we intend to expand Measurement Matcher compatibility to include other measurements and other popular sites. Please reach out to zfrazerklo@gmail.com for more information.

## Export checked listings

The extension records garments as the matcher checks them, including products checked from later results pages and product pages opened directly. Use the popup's **Export checked listings** button to download the saved observations for spreadsheet analysis or import into PostgreSQL.

### Download workflow

1. Enter the desired measurements and each measurement’s smaller/larger allowances in the popup, then click **Save & apply**. This saves the preferences and reloads the current TRR page to restart matching. Leave an unused measurement blank.
2. Browse TRR with saved measurements. Each fresh product evaluation saves a dated observation. **Reload page** restarts the current page with already-saved settings without saving unsaved popup edits.
3. Click **Export checked listings**. The browser downloads a UTF-8 CSV named `checked-listings-YYYY-MM-DD.csv`, containing all saved observations in chronological order. If no observations exist yet, the popup asks you to browse TRR first.

Exporting keeps the saved observations, so they remain available for later downloads. Revisiting a product can produce another dated row; cached results within the same page are not saved again.

### CSV fields

The CSV includes a header row with these column names:

| Column(s) | Contents |
| --- | --- |
| `product_url`, `item_id` | Product URL with query parameters and fragments removed; item ID when available. |
| `observed_at` | Date and time checked, as an ISO 8601 UTC timestamp. |
| `scan_id`, `search_url` | Page-load scan identifier and starting page URL; available for new observations in version 1.4.2. Use the ID shown in the toast to compare one scan with its CSV rows. |
| `garment_bust`, `garment_waist` | Measurements extracted from the garment listing, in inches. |
| `user_bust`, `user_waist` | Saved measurements used for that check, in inches. |
| `waist_smaller_allowance`, `waist_larger_allowance` | Maximum permitted amounts below and above the user’s waist measurement, in inches. |
| `bust_smaller_allowance`, `bust_larger_allowance` | Maximum permitted amounts below and above the user’s bust measurement, in inches. |
| `tolerance` | Legacy symmetric allowance; populated when all waist/bust allowances and the allowances for each configured optional measurement agree. |
| `bust_difference`, `waist_difference` | Garment measurement minus user measurement, in inches; positive values mean the garment is larger. |
| `result` | `match`, `not match`, or `undetermined`. |
| `product_price`, `currency` | Observed listing price and currency when available. |
| `on_sale` | `true` or `false` when explicit sale details or comparable original/current prices establish sale status; otherwise blank. |
| `designer` | Garment designer or brand when available. |
| `estimated_percent_off_retail` | Listed percentage off estimated retail, as a number such as `65` for 65%. |
| `fabric_composition` | Listed fabric or material composition when available. |
| `garment_condition` | Listed garment condition when available. |
| `garment_inseam`, `user_inseam` | Reported garment inseam and saved inseam used for this check, in inches. |
| `inseam_smaller_allowance`, `inseam_larger_allowance` | Permitted amounts below and above the saved inseam, in inches. |
| `inseam_difference` | Garment inseam minus saved inseam, in inches; blank if either is absent. |
| `inseam_applied` | `true` when inseam was configured, applicable to the category, and reported; otherwise `false`. These six appended columns are blank for observations saved before inseam support. |
| `garment_category` | Category from the garment's categorized product URL, such as `jeans` or `dresses`; blank when unknown. |
| `bust_applied` | `true` when bust was configured, applicable to the category, and available for comparison; otherwise `false`. These two appended columns are blank for observations saved before version 1.7.1. |
| `garment_hip`, `user_hip`, `hip_smaller_allowance`, `hip_larger_allowance`, `hip_difference`, `hip_applied` | Reported hip, saved target, allowances, garment-minus-user difference, and whether the comparison ran. |
| `garment_rise`, `user_rise`, `rise_smaller_allowance`, `rise_larger_allowance`, `rise_difference`, `rise_applied` | The corresponding values for rise; comparison is limited to recognized pants/jeans/trousers. |
| `garment_leg_opening`, `user_leg_opening`, `leg_opening_smaller_allowance`, `leg_opening_larger_allowance`, `leg_opening_difference`, `leg_opening_applied` | The corresponding values for leg opening, using the listing's unconverted inch value; comparison is limited to recognized pants/jeans/trousers. All 18 new fields are blank for observations from before version 1.8.0. |

A `match` has at least one available, applicable, configured measurement and satisfies all comparisons that can be made within their respective smaller/larger allowances, including the endpoints. For example, a 28-inch waist with 0.25 smaller and 1.5 larger accepts 27.75–29.5 inches. Enter allowances as positive amounts or zero; leave an unused measurement blank. Existing ± settings initially fill both directions for both measurements. A `not match` has at least one known requested measurement outside the range. `undetermined` means none of the entered, applicable measurements is reported by the garment. A single missing value does not make the listing undetermined when another entered, applicable value can be compared. Blank user measurements are ignored by matching; their differences are also blank.

Missing data is stored as `null` and exported as empty fields. Prices, sale details, fabric, and condition depend on what the product page exposes and the extension can extract. CSV fields preserve commas, quotation marks, and line breaks; scraped text that could execute as a spreadsheet formula receives an apostrophe prefix.

### Storage and availability

Sizing preferences remain in `chrome.storage.sync`. Checked listing observations, including the preferences used for each check, are saved separately in `chrome.storage.local` on this Chrome installation and do not sync between devices. Records are subject to Chrome's local storage quota, are not automatically deleted, and can be removed with **Clear checked listings** (after confirmation) or by uninstalling the extension. Clearing leaves sizing preferences and downloaded CSV files in place; open TRR pages may save new checks. The page status badge reports saving failures while filtering continues.

Failed or denied product requests do not create garment observations. If TRR blocks or rate-limits measurement checks, the extension pauses further requests on that page, leaves unchecked listings visible and labeled, and reports incomplete filtering. Use **Reload page** later to retry.

The downloaded CSV can be imported into PostgreSQL using your preferred tools. The extension does not connect directly to a database or include a SQL script. See [Checked listing exports](../EXPORTS.md) for additional implementation details and regression-check instructions.

## Chrome Web Store release

See the [release checklist](../store/RELEASE-CHECKLIST.md), [store listing draft](../store/STORE-LISTING.md), and [privacy policy](../PRIVACY.md) for version 1.9.2. Build from the project root with `python3 scripts/build_release.py`; the output is a clean ZIP in `../dist/`.

The toast counts this page-load scan, including later-page checks, while **Export checked listings** includes all saved scans and earlier dates. Missing-measurement (`undetermined`) and unchecked/failed-load counts are shown separately. Older observations have no scan ID; use their observation dates to distinguish historical data.

Condition and fabric composition are read from the main product’s current TRR structured data, including fabric blends and lining composition. Semantic product-detail rows and older markup are fallbacks. Previously saved blank values stay in their original observations; rechecking a listing creates a new dated observation with the corrected fields. See [export extraction notes](../EXPORTS.md).
