# TRR Measurement Matcher EXT

As a big fan of second-hand shopping and the luxury consignment site TheRealReal, I found myself constantly having to check product measurements, even when I filtered by size. I decided to build Measurement Matcher for my own personal use, inspired by sites like [Secondsense](https://secondsense.co/), who do a great service to the second-hand fashion community. Vintage sizing is notoriously inconsistent; The purpose of this project is to improve the user experience of second-hand shoppers by enabling shoppers to filter products according to clothing measurements rather than label size.

## What It Does

Measurement Matcher is a Chrome extension built to help shoppers browse resale listings with more confidence. Instead of relying on a tagged size like `S`, `M`, or `8`, the extension compares a shopper's saved waist and bust measurements against the measurements listed on product pages.

When a listing page is loaded, the extension:

- checks product measurements in the background
- filters the grid to show matching products first
- hides items outside the selected range
- can pull in matching products from later pages when the current page has no matches
- saves dated observations of checked listings locally and lets users download them as a CSV

## How It Works

Users enter:

- waist measurement
- bust measurement
- tolerance in inches

The extension stores those preferences, reads measurement details from supported product pages, and filters product grids based on whether an item falls within the shopper's preferred range.

**Development note**: I developed this as a personal project and used LLM assistance with the JavaScript implementation. The shopping problem, measurement-based matching criteria, and feature decisions came from my own experience using resale sites.

## Project Goal

The goal of this project is to make resale shopping faster, less frustrating, and more accessible for people who need clothing to match their actual measurements, not just a nominal size tag. This is especially important for women outside of the standard size range, or with proportions that do not match typical industry patterns. 

Eventually, we intend to expand Measurement Matcher compatibility to include other measurements and other popular sites. Please reach out to zfrazerklo@gmail.com for more information.

## Export checked listings

The extension records garments as the matcher checks them, including products checked from later results pages and product pages opened directly. Use the popup's **Export checked listings** button to download the saved observations for spreadsheet analysis or import into PostgreSQL.

### Download workflow

1. Enter waist, bust, and tolerance in the popup, then click **Save & apply**. This saves the preferences and reloads the current TRR page to restart matching. Leave an unused measurement blank.
2. Browse TRR with saved measurements. Each fresh product evaluation saves a dated observation. **Reload page** restarts the current page with already-saved settings without saving unsaved popup edits.
3. Click **Export checked listings**. The browser downloads a UTF-8 CSV named `checked-listings-YYYY-MM-DD.csv`, containing all saved observations in chronological order. If no observations exist yet, the popup asks you to browse TRR first.

Exporting keeps the saved observations, so they remain available for later downloads. Revisiting a product can produce another dated row; cached results within the same page are not saved again.

### CSV fields

The CSV includes a header row with these column names:

| Column(s) | Contents |
| --- | --- |
| `product_url`, `item_id` | Product URL with query parameters and fragments removed; item ID when available. |
| `observed_at` | Date and time checked, as an ISO 8601 UTC timestamp. |
| `garment_bust`, `garment_waist` | Measurements extracted from the garment listing, in inches. |
| `user_bust`, `user_waist`, `tolerance` | Saved measurements and allowance used for that check, in inches. |
| `bust_difference`, `waist_difference` | Garment measurement minus user measurement, in inches; positive values mean the garment is larger. |
| `result` | `match`, `not match`, or `undetermined`. |
| `product_price`, `currency` | Observed listing price and currency when available. |
| `on_sale` | `true` or `false` when explicit sale details or comparable original/current prices establish sale status; otherwise blank. |
| `designer` | Garment designer or brand when available. |
| `estimated_percent_off_retail` | Listed percentage off estimated retail, as a number such as `65` for 65%. |
| `fabric_composition` | Listed fabric or material composition when available. |
| `garment_condition` | Listed garment condition when available. |

A `match` satisfies all configured measurements within the saved tolerance. A `not match` has at least one known requested measurement outside the range. `undetermined` means required measurements are missing and there is no known mismatch. Blank user measurements are ignored by matching; their differences are also blank.

Missing data is stored as `null` and exported as empty fields. Prices, sale details, fabric, and condition depend on what the product page exposes and the extension can extract. CSV fields preserve commas, quotation marks, and line breaks; scraped text that could execute as a spreadsheet formula receives an apostrophe prefix.

### Storage and availability

Sizing preferences remain in `chrome.storage.sync`. Checked listing observations, including the preferences used for each check, are saved separately in `chrome.storage.local` on this Chrome installation and do not sync between devices. Records are subject to Chrome's local storage quota, are not automatically deleted, and are removed when the extension is uninstalled. The page status badge reports saving failures while filtering continues.

Failed or denied product requests do not create garment observations. If TRR blocks or rate-limits measurement checks, the extension pauses further requests on that page, leaves unchecked listings visible and labeled, and reports incomplete filtering. Use **Reload page** later to retry.

The downloaded CSV can be imported into PostgreSQL using your preferred tools. The extension does not connect directly to a database or include a SQL script. See [Checked listing exports](../EXPORTS.md) for additional implementation details and regression-check instructions.
