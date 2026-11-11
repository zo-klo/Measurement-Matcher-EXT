console.log("Fit extension running");

const PRODUCT_DETAILS_SELECTOR = ".product-details-group li";
const PRODUCT_CARD_SELECTOR = [
  "[data-testid*='product']",
  "[class*='product-card']",
  "[class*='product-tile']",
  "[class*='product-item']",
  "[role='listitem']",
  "[class*='card']",
  "[class*='tile']",
  "article",
  "li"
].join(", ");
const productResultCache = new Map();
const supplementedProductCards = new Map();
const uncheckedProductUrls = new Set();
let scanContext = null;
let visibleMatchCount = 0;
let pageProgress = null;
let scanPhase = "";
const RESULTS_PER_PAGE = 24;
const resultCards = new Map();
let resultsPage = 1;
let resultsGrid = null;
let sourceCandidates = [];
let moreResults = null;
let pagerMatchProduct = null;
let routeReloadRequested = false;
const initialViewUrl = viewUrl();
const activeRequests = new Set();

function viewUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  return url.href;
}

function isCurrentView() { return !routeReloadRequested && viewUrl() === initialViewUrl; }

function watchForNavigation() {
  const check = () => {
    if (viewUrl() === initialViewUrl || routeReloadRequested) return;
    routeReloadRequested = true;
    for (const controller of activeRequests) controller.abort();
    document.getElementById("fit-extension-grid-host")?.remove();
    document.getElementById("fit-extension-results-controls")?.remove();
    // TRR changes routes in place. A new document gives each page/search its
    // own source grid, caches, pending requests, pagination cursor and scan ID.
    window.location.reload();
  };
  window.addEventListener("popstate", check);
  window.setInterval(check, 250);
  return check;
}

function productKey(url) {
  const key = new URL(url, initialViewUrl);
  key.search = "";
  key.hash = "";
  return key.href;
}

function resultsPageInfo() {
  const entries = [...resultCards.values()];
  const pages = Math.ceil(entries.length / RESULTS_PER_PAGE);
  resultsPage = pages ? Math.max(1, Math.min(resultsPage, pages)) : 1;
  return { page: pages ? resultsPage : 0, pages, count: entries.length,
    entries: entries.slice((resultsPage - 1) * RESULTS_PER_PAGE, resultsPage * RESULTS_PER_PAGE) };
}

function moreResultsState() {
  if (!moreResults) {
    const seen = new Set([initialViewUrl]);
    moreResults = { seen, nextUrl: getNextListingPageUrl(document, initialViewUrl, seen), pending: [], pageUrl: initialViewUrl, pagesLoaded: 1 };
  }
  return moreResults;
}

function renderResultsPage() {
  if (!isCurrentView() || !resultsGrid) return;
  const page = resultsPageInfo();
  const shown = page.entries.map(entry => entry.card);
  reorganizeGrid(resultsGrid, shown, sourceCandidates.map(entry => entry.card).filter(card => !shown.includes(card)),
    page.entries.filter(entry => entry.unverified).map(entry => entry.card));
  visibleMatchCount = page.entries.filter(entry => !entry.unverified).length;
  updateResultsControls();
}

function changeResultsPage(delta) {
  const page = resultsPageInfo();
  if (resultsPage + delta < 1 || resultsPage + delta > page.pages) return;
  resultsPage += delta;
  renderResultsPage();
  showScanStatus("");
}

function updateResultsControls() {
  // DOM-less regression fixtures replace the grid renderer, not these controls.
  if (!document.createElement || !resultsGrid?.insertAdjacentElement) return;
  let host = document.getElementById("fit-extension-results-controls");
  if (!host) {
    host = document.createElement("section");
    host.id = "fit-extension-results-controls";
    const gridHost = document.getElementById("fit-extension-grid-host");
    (gridHost || resultsGrid).insertAdjacentElement("beforebegin", host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      *{box-sizing:border-box}section{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#183b35;background:#f5f9f7;border:1px solid #d6e4df;border-radius:9px;padding:14px 16px;margin:12px 0 18px}
      p{margin:0 0 8px}.summary{font-size:15px;font-weight:650}.note{font-size:12px;color:#597168;margin:8px 0 0}.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}button{font:inherit;background:#fff;color:#156459;border:1px solid #b0c9c0;border-radius:5px;padding:6px 12px;cursor:pointer}button:disabled{opacity:.45;cursor:default}.more{background:#156459;color:white;border-color:#156459}button:focus-visible{outline:2px solid #156459;outline-offset:2px}[hidden]{display:none!important}
    </style><section aria-label="Measurement-filtered results"><p class="summary" role="status"></p><div class="actions"><button class="previous" type="button">Previous</button><span class="page" aria-live="polite" aria-atomic="true"></span><button class="next" type="button">Next</button><button class="more" type="button">Find more matches</button></div><p class="note"></p></section>`;
    root.querySelector(".previous").addEventListener("click", () => changeResultsPage(-1));
    root.querySelector(".next").addEventListener("click", () => changeResultsPage(1));
    root.querySelector(".more").addEventListener("click", () => findMoreMatches().catch(error => {
      console.warn("Could not find more matches", error);
      showScanStatus("More listings could not be checked. Try Reload page later.");
    }));
  }
  // These controls paginate the checked result pool; the site's paginator
  // describes its unfiltered catalog and must not compete with them.
  for (const pagination of document.querySelectorAll('[aria-label*="pagination" i], [data-testid="pagination"]')) {
    pagination.style.display = "none";
  }
  const page = resultsPageInfo();
  const counts = [...resultCards.values()].reduce((totals, entry) => {
    totals[entry.unverified ? "unchecked" : "matches"] += 1; return totals;
  }, { matches: 0, unchecked: 0 });
  const state = moreResultsState();
  const paused = productChecksBlocked || productChecksTimedOut;
  const busy = supplementInFlight || (pageProgress && pageProgress.finished < pageProgress.total);
  const exhausted = !state.nextUrl && !state.pending.length;
  const root = host.shadowRoot;
  root.querySelector(".summary").textContent = `${counts.matches} matching listings found` + (counts.unchecked ? ` · ${counts.unchecked} unchecked` : "");
  root.querySelector(".page").textContent = `Results page ${page.page} of ${page.pages}`;
  root.querySelector(".previous").disabled = busy || page.page <= 1;
  root.querySelector(".next").disabled = busy || page.page >= page.pages;
  root.querySelector(".more").disabled = busy || paused || exhausted;
  root.querySelector(".more").textContent = busy ? "Checking more listings…" : "Find more matches";
  root.querySelector(".note").textContent = paused ? "Checks paused. Reload the page later to retry."
    : exhausted ? "No more source listings available. These pages contain the checked results only."
    : `Results from ${state.pagesLoaded} TRR source page(s), ${RESULTS_PER_PAGE} listings per results page. Find more matches checks additional listings. TRR’s item total is unfiltered.`;
}

async function findMoreMatches() {
  if (filterInFlight || supplementInFlight || !isCurrentView()) return;
  const previousCount = resultsPageInfo().count;
  filterInFlight = (async () => {
    await supplementFromNextPages(pagerMatchProduct, sourceCandidates, RESULTS_PER_PAGE);
    if (!isCurrentView()) return;
    const page = resultsPageInfo();
    if (page.count > previousCount) resultsPage = Math.floor(previousCount / RESULTS_PER_PAGE) + 1;
    renderResultsPage();
    showScanStatus(supplementFailed ? "More listings could not be fully checked." : "");
  })().finally(() => {
    filterInFlight = null;
    if (isCurrentView()) updateResultsControls();
    if (filterAgain && isCurrentView()) { filterAgain = false; filterProductCards(pagerMatchProduct).catch(console.warn); }
  });
  return filterInFlight;
}

function getScanContext() {
  scanContext ??= { scanId: crypto.randomUUID(), searchUrl: window.location.href };
  return scanContext;
}

function summarizeScan() {
  const counts = { checkedCount: 0, matchCount: 0, notMatchCount: 0, undeterminedCount: 0, uncheckedCount: uncheckedProductUrls.size };
  for (const result of productResultCache.values()) {
    const outcome = MeasurementMatching.classify(result);
    counts.checkedCount += 1;
    if (outcome === "match") counts.matchCount += 1;
    else if (outcome === "not match") counts.notMatchCount += 1;
    else counts.undeterminedCount += 1;
  }
  return counts;
}

function showScanStatus(phase = scanPhase) {
  if (!isCurrentView()) return;
  scanPhase = phase;
  const counts = summarizeScan();
  const id = getScanContext().scanId.slice(0, 8);
  const working = pageProgress && pageProgress.finished < pageProgress.total;
  const progress = working
    ? `Checking this page: ${pageProgress.finished} of ${pageProgress.total} finished ` +
      `(${pageProgress.active} active, ${pageProgress.total - pageProgress.finished - pageProgress.active} queued). `
    : "";
  const paused = productChecksBlocked || productChecksTimedOut;
  const later = supplementInFlight;
  const title = working ? "Checking measurements" : later ? "Checking more results" : paused ? "Checks paused" : "Scan complete";
  updateStatusBadge(
    progress +
    `${working ? "Results so far" : "This scan"}: ${counts.checkedCount} checked — ${counts.matchCount} match, ` +
    `${counts.notMatchCount} not match, ${counts.undeterminedCount} undetermined (no comparable requested measurements). ` +
    (working ? "Filtering is still in progress. " : `Showing ${visibleMatchCount} matches. `) +
    `${counts.uncheckedCount} unchecked (load failed or checks paused). ` +
    (phase ? phase + " " : "") +
    `Includes later-page checks. CSV contains all saved scans; this scan ID starts ${id}.`,
    {
      title, counts, paused,
      progress: later ? null : pageProgress ? { finished: pageProgress.finished, total: pageProgress.total } : null,
      activity: working ? `${pageProgress.active} active · ${pageProgress.total - pageProgress.finished - pageProgress.active} queued`
        : later ? "Loading and checking later listings…" : `${counts.checkedCount} checked · ${visibleMatchCount} matches shown`,
      note: working || later ? "" : phase,
      scanId: getScanContext().scanId
    }
  );
}

async function checkProduct(url, matchProduct) {
  if (!isCurrentView()) throw new StaleViewError();
  let result = productResultCache.get(url);
  if (result) return result;
  try {
    const root = await getProductDocument(url);
    if (!isCurrentView()) throw new StaleViewError();
    const evaluated = evaluateProduct(root, url, matchProduct);
    const outcome = MeasurementMatching.classify(evaluated);
    result = { ...evaluated, result: outcome, overallMatch: outcome === "match" };
    productResultCache.set(url, result);
    uncheckedProductUrls.delete(url);
    showScanStatus();
    await saveCheckedListing(url, root, result);
    return result;
  } catch (error) {
    if (isCurrentView()) uncheckedProductUrls.add(url);
    throw error;
  }
}
let supplementInFlight = false;

function getTextValue(node, exclude = null) {
  if (!node) return "";

  // DOMParser documents have no rendered innerText. Read their text nodes,
  // excluding executable content rather than using body.textContent,
  // which includes tracking scripts and can create bogus measurements.
  function readableText(current) {
    if (current.nodeType === Node.TEXT_NODE) return current.textContent || "";
    if (current.nodeType !== Node.ELEMENT_NODE && current.nodeType !== Node.DOCUMENT_NODE) return "";
    if (current.nodeType === Node.ELEMENT_NODE &&
        current.matches("script, style, template, noscript")) return "";
    if (exclude && current.nodeType === Node.ELEMENT_NODE && current.matches(exclude)) return "";
    return [...current.childNodes].map(readableText).join(" ");
  }

  // Measurements in collapsed product-detail sections still belong to the
  // garment. Read them even when Chrome omits them from rendered innerText.
  return readableText(node).replace(/\s+/g, " ").trim();
}

function normalizeMeasurementText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function pickMeasurementValue(rawValue) {
  if (!rawValue) {
    return null;
  }

  const numbers = rawValue.match(/[\d.]+/g);
  if (!numbers?.length) {
    return null;
  }

  const parsedNumbers = numbers
    .map((entry) => parseFloat(entry))
    .filter((entry) => !Number.isNaN(entry));

  if (!parsedNumbers.length) {
    return null;
  }

  return parsedNumbers[0];
}

function extractMeasurementFromText(text, label) {
  const normalizedText = normalizeMeasurementText(text);
  const patterns = [
    new RegExp(`\\b${label}\\b\\s*:?\\s*([\\d.]+(?:\\s*-\\s*[\\d.]+)?\\s*(?:"|inches|inch|in)?)`, "i"),
    new RegExp(`\\b${label}\\b\\s+(?:measurement\\s*:?|measures)\\s*([\\d.]+(?:\\s*-\\s*[\\d.]+)?\\s*(?:"|inches|inch|in)?)`, "i")
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    const value = pickMeasurementValue(match?.[1]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function extractMeasurements(root) {
  const definitions = [
    ["itemWaist", ["waist"]], ["itemBust", ["bust"]], ["itemInseam", ["inseam"]],
    ["itemHip", ["hip", "hips"]], ["itemRise", ["front rise", "rise"]],
    ["itemLegOpening", ["leg opening", "legopening"]]
  ];
  const normalizeLabel = value => typeof value === "string" ? value.toLowerCase().replace(/[^a-z]/g, "") : "";
  // Only the main garment's measurement attributes, never size charts or
  // recommendations. Read all fields even when a particular rule is disabled.
  const productData = root.querySelector?.("script#__NEXT_DATA__");
  if (productData) {
    try {
      const product = JSON.parse(productData.textContent)?.props?.pageProps?.product;
      if (product) {
        const attributes = [
          ...(Array.isArray(product.attributes) ? product.attributes : []),
          ...(Array.isArray(product.components) ? product.components : []).flatMap(component =>
            Array.isArray(component?.attributes) ? component.attributes : [])
        ];
        return Object.fromEntries(definitions.map(([key, labels]) => {
          for (const label of labels) for (const attribute of attributes) {
            if (attribute?.measurement !== true ||
                ![attribute.type, attribute.label].some(value => normalizeLabel(value) === normalizeLabel(label))) continue;
            const value = pickMeasurementValue(String(attribute.values?.[0] ?? ""));
            if (value !== null) return [key, value];
          }
          return [key, null];
        }));
      }
    } catch (error) {
      console.warn("Could not read TRR structured measurements; trying product details", error);
    }
  }
  const unrelated = '[data-testid*="carousel"], [aria-roledescription="carousel"], [data-testid*="recommend"], [data-testid*="size-guide"], [data-testid*="size-chart"]';
  const listItems = [...root.querySelectorAll(PRODUCT_DETAILS_SELECTOR)];
  const body = root.body || root.documentElement || root;
  const fullText = getTextValue(body);
  const scopedText = getTextValue(body, unrelated);
  return Object.fromEntries(definitions.map(([key, labels]) => {
    const optional = key !== "itemWaist" && key !== "itemBust";
    const read = text => {
      // Back rise is a different measurement and must not stand in for rise.
      const source = key === "itemRise" ? text.replace(/\bback[\s-]+rise\b/gi, "back length") : text;
      for (const label of labels) {
        const value = extractMeasurementFromText(source, label);
        if (value !== null) return value;
      }
      return null;
    };
    let value = null;
    for (const li of listItems) {
      if (optional && li.closest?.(unrelated)) continue;
      value = read(getTextValue(li)) ?? value;
    }
    return [key, value ?? read(optional ? scopedText : fullText)];
  }));
}

function buildMatcher(settings) {
  return MeasurementMatching.createMatcher(settings);
}

function garmentCategory(root, address) {
  const fromUrl = value => {
    if (!value) return null;
    try {
      const url = new URL(value, address);
      if (url.origin !== window.location.origin) return null;
      const parts = url.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part).toLowerCase());
      return parts[0] === "products" && /^(?:women|men|kids|children|unisex)$/.test(parts[1]) && parts[2] === "clothing"
        ? parts[3] || null : null;
    } catch { return null; }
  };
  const category = fromUrl(address);
  if (category) return category;
  // Legacy item-ID links can still expose the categorized product URL.
  const canonical = root.querySelector?.('link[rel="canonical"]');
  return fromUrl(canonical?.getAttribute?.("href") || canonical?.href);
}

function evaluateProduct(root, address, matchProduct) {
  return matchProduct({ ...extractMeasurements(root), garmentCategory: garmentCategory(root, address) });
}

let listingStorageFailed = false;
async function saveCheckedListing(url, root, result) {
  try {
    await CheckedListings.save(url, root, result, getScanContext());
  } catch (error) {
    listingStorageFailed = true;
    console.warn("Could not save checked listing", url, error);
    updateStatusBadge("A checked listing could not be saved. Export existing records to preserve your data.");
  }
}

function ensureStatusBadge() {
  let badge = document.getElementById("fit-extension-status");
  if (badge?.shadowRoot) return badge;
  if (!badge) {
    badge = document.createElement("aside");
    badge.id = "fit-extension-status";
    document.body.appendChild(badge);
  }
  badge.style.cssText = "all:initial;position:fixed;left:16px;right:auto;bottom:16px;z-index:999999;width:320px;max-width:calc(100vw - 32px);";
  // Isolate the panel from the site's typography, spacing, and button styles.
  const root = badge.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { color-scheme:light; }
      * { box-sizing:border-box; }
      .panel { font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#183b35;background:#fff;border:1px solid #d6e4df;border-radius:12px;box-shadow:0 6px 24px #163b3426;overflow:hidden; }
      header { display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #e7eeeb; }
      .brand { font-size:11px;font-weight:650;letter-spacing:.15px;color:#4c6962; }
      button { font:18px/1 sans-serif;width:26px;height:24px;padding:0;border:0;border-radius:5px;color:#45675e;background:#f0f5f3;cursor:pointer; }
      button:hover { background:#e0ece7; }
      button:focus-visible,summary:focus-visible { outline:2px solid #156459;outline-offset:2px; }
      .body { padding:12px;max-height:min(480px,calc(100vh - 100px));overflow:auto; }
      h2 { font-size:15px;line-height:1.3;margin:0 0 4px;font-weight:650; }
      p { margin:0; }
      .activity,.progress-label { color:#5a7068;font-size:11px; }
      .progress-label { display:flex;justify-content:space-between;margin-top:9px; }
      progress { display:block;width:100%;height:7px;margin:5px 0 12px;border:0;border-radius:5px;overflow:hidden;accent-color:#156459;background:#e8efeb; }
      progress::-webkit-progress-bar { background:#e8efeb;border-radius:5px; }
      progress::-webkit-progress-value { background:#156459;border-radius:5px;transition:width .15s linear; }
      progress.paused { accent-color:#aa761e; }
      progress.paused::-webkit-progress-value { background:#aa761e; }
      .counts { display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px; }
      .count { display:flex;align-items:center;justify-content:space-between;gap:6px;background:#f2f6f4;border-radius:6px;padding:7px 9px;font-size:12px; }
      .count strong { font-size:17px;line-height:1.1;color:#183b35; }
      .count.match { color:#156459; }
      .count.unknown { color:#856014; }
      .count.unchecked { color:#815041; }
      .note { margin-top:10px;font-size:12px;color:#566d65; }
      .warning { margin-top:8px;font-size:12px;color:#9b4d24; }
      details { margin-top:10px;padding-top:8px;border-top:1px solid #e7eeeb;color:#5a7068;font-size:11px; }
      summary { cursor:pointer;font-size:11px; }
      details p { margin-top:7px; }
      code { font:10px/1.4 ui-monospace,monospace;overflow-wrap:anywhere; }
      [hidden] { display:none!important; }
    </style>
    <section class="panel" aria-label="Measurement Matcher scan status">
      <header><span class="brand">Measurement Matcher</span><button type="button" aria-label="Minimize scan status" aria-expanded="true">−</button></header>
      <div class="body">
        <h2 role="status" aria-live="polite" aria-atomic="true"></h2>
        <p class="activity"></p>
        <div class="progress-label"><span class="processed"></span><span class="percentage"></span></div>
        <progress aria-label="Products processed on this page"></progress>
        <div class="counts" aria-label="Results for this scan">
          <div class="count match"><span>Match</span><strong data-count="matchCount">0</strong></div>
          <div class="count"><span>Not match</span><strong data-count="notMatchCount">0</strong></div>
          <div class="count unknown"><span>Undetermined</span><strong data-count="undeterminedCount">0</strong></div>
          <div class="count unchecked"><span>Unchecked</span><strong data-count="uncheckedCount">0</strong></div>
        </div>
        <p class="note"></p><p class="warning" hidden></p>
        <details><summary>Details</summary>
          <p>Counts cover this page load, including later-page checks. CSV exports include all saved scans.</p>
          <p>All measurements are optional: missing values are skipped. Bust is ignored for recognized jeans, pants, shorts, and skirts. Inseam is ignored for dresses. Hip applies across clothing; rise and leg opening apply only to pants, jeans, and trousers. Undetermined: no entered, applicable measurement can be compared. A match needs at least one comparison and no known mismatch. Unchecked: a load failed, timed out, or was paused. Processed includes these unchecked listings.</p>
          <p class="scan-id"></p>
        </details>
      </div>
    </section>`;
  const button = root.querySelector("button");
  button.addEventListener("click", () => {
    const body = root.querySelector(".body");
    body.hidden = !body.hidden;
    button.textContent = body.hidden ? "+" : "−";
    button.setAttribute("aria-expanded", String(!body.hidden));
    button.setAttribute("aria-label", body.hidden ? "Expand scan status" : "Minimize scan status");
  });
  return badge;
}

function updateStatusBadge(message, model = null) {
  pendingStatus = { message, model };
  if (typeof window.requestAnimationFrame !== "function") {
    paintStatusBadge(message, model);
    return;
  }
  if (statusFramePending) return;
  statusFramePending = true;
  window.requestAnimationFrame(() => {
    statusFramePending = false;
    if (!isCurrentView()) return;
    paintStatusBadge(pendingStatus.message, pendingStatus.model);
  });
}

let pendingStatus = null;
let statusFramePending = false;
function paintStatusBadge(message, model = null) {
  const root = ensureStatusBadge().shadowRoot;
  const progress = root.querySelector("progress");
  const progressLabel = root.querySelector(".progress-label");
  root.querySelector("h2").textContent = model?.title || "Measurement Matcher";
  root.querySelector(".activity").textContent = model?.activity || "";
  root.querySelector(".note").textContent = model ? model.note : message;
  root.querySelector(".note").hidden = model ? !model.note : !message;
  root.querySelector(".counts").hidden = !model;
  progress.hidden = !model;
  progressLabel.hidden = !model;
  root.querySelector("details").hidden = !model;
  if (model) {
    for (const key of ["matchCount", "notMatchCount", "undeterminedCount", "uncheckedCount"]) {
      root.querySelector(`[data-count="${key}"]`).textContent = model.counts[key];
    }
    const determinate = model.progress && model.progress.total > 0;
    if (determinate) {
      progress.max = model.progress.total;
      progress.value = model.progress.finished;
    } else {
      progress.removeAttribute("value");
    }
    progress.className = model.paused ? "paused" : "";
    progress.setAttribute("aria-label", determinate ? "Products processed on this page" : "Checking additional results");
    root.querySelector(".processed").textContent = determinate ? `${model.progress.finished} of ${model.progress.total} processed` : "Checking later pages";
    root.querySelector(".percentage").textContent = determinate ? `${Math.floor(100 * model.progress.finished / model.progress.total)}%` : "";
    root.querySelector(".scan-id").textContent = `Scan ID: ${model.scanId}`;
  }
  const warning = root.querySelector(".warning");
  warning.hidden = !listingStorageFailed;
  warning.textContent = listingStorageFailed ? "Some observations could not be saved. Local storage may be full." : "";
}

function showProductPageResult(result) {
  if (result.result === "undetermined") {
    updateStatusBadge("No entered, applicable measurement is available to compare; match undetermined. Missing listing measurements are skipped.");
    return;
  }

  if (result.overallMatch) {
    updateStatusBadge("This product matches your saved measurements.");
    return;
  }

  updateStatusBadge("This product is outside your saved measurement range.");
}

function isProductUrl(url) {
  return /^\/products\//.test(url.pathname) || /^\/products\/details\//.test(url.pathname);
}

function isExcludedCategoryUrl(address) {
  try {
    const url = new URL(address, initialViewUrl);
    const parts = url.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part).toLowerCase());
    const excluded = new Set(["bags", "handbags", "shoes", "accessories"]);
    if (parts[0] === "products" || parts[0] === "shop") {
      const category = /^(?:women|men|kids|children|unisex)$/.test(parts[1]) ? parts[2] : parts[1];
      // Category segments only: never inspect the product/designer slug.
      return excluded.has(category);
    }
    if (parts[0] === "sales" && parts.length === 2) {
      const section = parts[1].replace(/[’']/g, "").replace(/\s+/g, "-");
      return /^(?:(?:shop-all|designer)-)?(?:(?:women|womens|men|mens|kids)-)?(?:bags|handbags|shoes|accessories)(?:-\d+)?$/.test(section);
    }
  } catch { /* Unknown/malformed routes are still eligible for checking. */ }
  return false;
}

function selectedCategoryIds(url) {
  return [...url.searchParams.getAll("taxons[]"), ...url.searchParams.getAll("taxons")];
}

function isExcludedSection(root, address = window.location.href) {
  if (isExcludedCategoryUrl(address)) return true;
  const current = new URL(address, initialViewUrl);
  if (isProductUrl(current)) return false;
  const selected = selectedCategoryIds(current);
  if (!selected.length) return false;
  // New Arrivals and sale URLs can select a category only by numeric taxon.
  // Learn those IDs from this page's own category links instead of guessing
  // fixed IDs or treating sidebar/menu text as the current category.
  const excludedIds = new Set();
  for (const anchor of root.querySelectorAll?.("a[href]") || []) {
    try {
      const url = new URL(anchor.href, current.href);
      if (url.origin !== current.origin) continue;
      const label = (anchor.textContent || "").replace(/[’']/g, "").replace(/\s+/g, " ").trim();
      const categoryLabel = /^(?:shop all )?(?:(?:women|womens|men|mens|kids) )?(?:bags|handbags|shoes|accessories)$/i.test(label);
      const ids = selectedCategoryIds(url);
      if (ids.length === 1 && (isExcludedCategoryUrl(url.href) || categoryLabel)) excludedIds.add(ids[0]);
    } catch { /* Ignore malformed navigation links. */ }
  }
  // A mixed selection that may include clothing must stay eligible.
  return selected.every(id => excludedIds.has(id));
}

function countProductLinks(root) {
  return root.querySelectorAll("a[href*='/products/']").length;
}

function getCardContainer(anchor, rootDocument = document) {
  const candidates = [];
  let current = anchor;
  let depth = 0;

  while (current && current !== rootDocument.body && depth < 8) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const productLinkCount = countProductLinks(current);
      const text = getTextValue(current);
      const hasImage = !!current.querySelector("img");
      const looksLikeCard = current.matches(PRODUCT_CARD_SELECTOR);
      const hasPrice = /\$\s?\d/.test(text);
      const hasBrandOrSize = /\bsize\b|\bcondition\b|\bshop\b/i.test(text);

      if (
        productLinkCount >= 1 &&
        productLinkCount <= 3 &&
        (looksLikeCard || hasImage || hasPrice || hasBrandOrSize)
      ) {
        candidates.push({
          element: current,
          score:
            (looksLikeCard ? 5 : 0) +
            (hasImage ? 2 : 0) +
            (hasPrice ? 2 : 0) +
            (hasBrandOrSize ? 1 : 0) -
            productLinkCount
        });
      }
    }

    current = current.parentElement;
    depth += 1;
  }

  if (!candidates.length) {
    return anchor.closest(PRODUCT_CARD_SELECTOR) || anchor.parentElement;
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0].element;
}

function findProductLinkCards(rootDocument = document, options = {}) {
  const { requireVisible = true } = options;
  const cardsByUrl = new Map();
  const anchors = rootDocument.querySelectorAll("a[href]");

  anchors.forEach((anchor) => {
    // Generated cards are display copies. Always re-evaluate the original
    // source cards, including originals hidden by a previous filtering pass.
    if (anchor.closest("#fit-extension-grid-host, #fit-extension-status")) return;
    if (requireVisible && anchor.offsetParent === null) {
      return;
    }

    let url;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }

    if (
      url.origin !== window.location.origin ||
      url.pathname === window.location.pathname ||
      !isProductUrl(url) || isExcludedCategoryUrl(url.href)
    ) {
      return;
    }

    const container = getCardContainer(anchor, rootDocument);
    if (!container || cardsByUrl.has(url.href)) {
      return;
    }

    cardsByUrl.set(url.href, { url: url.href, card: container });
  });

  return [...cardsByUrl.values()];
}

// A denial is a failed check, not an observation of a garment. Stop further
// requests for this page rather than retrying the same denial in hidden iframes.
class StaleViewError extends Error {}
class ProductChecksBlockedError extends Error {}
class ProductRequestTimeoutError extends Error {}
const PRODUCT_REQUEST_TIMEOUT_MS = 15000;
let productChecksBlocked = false;
let productChecksTimedOut = false;

function isAccessDeniedDocument(root) {
  return /access.*denied|verify.*human|security check/i.test(root.title || "") ||
    !!root.querySelector?.("#px-captcha");
}

async function fetchDocument(url) {
  if (new URL(url, initialViewUrl).origin !== new URL(initialViewUrl).origin) {
    throw new Error("Only same-origin TRR pages can be checked.");
  }
  const controller = new AbortController();
  activeRequests.add(controller);
  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new ProductRequestTimeoutError("Measurement request timed out after 15 seconds."));
      controller.abort();
    }, PRODUCT_REQUEST_TIMEOUT_MS);
  });
  const load = async () => {
    const response = await fetch(url, { credentials: "same-origin", signal: controller.signal });
    if (response.status === 403 || response.status === 429) {
      throw new ProductChecksBlockedError(`TRR blocked product checks (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new Error(`Request failed (HTTP ${response.status}) for ${url}`);
    }

    const html = await response.text();
    const root = new DOMParser().parseFromString(html, "text/html");
    if (isAccessDeniedDocument(root)) {
      throw new ProductChecksBlockedError("TRR returned an access-denied page.");
    }
    return root;
  };
  try {
    // Bound the response body as well as the initial fetch. The race also
    // settles if a browser/network layer is slow to honor cancellation.
    return await Promise.race([load(), timeout]);
  } finally {
    window.clearTimeout(timeoutId);
    activeRequests.delete(controller);
  }
}

async function getProductDocument(url) {
  if (productChecksBlocked) {
    throw new ProductChecksBlockedError("TRR product checks are paused for this page.");
  }
  if (productChecksTimedOut) {
    throw new ProductRequestTimeoutError("Measurement checks are paused after a request timeout.");
  }
  try {
    return await fetchDocument(url);
  } catch (error) {
    if (error instanceof ProductChecksBlockedError) productChecksBlocked = true;
    if (error instanceof ProductRequestTimeoutError) productChecksTimedOut = true;
    throw error;
  }
}

function getNextListingPageUrl(rootDocument, currentUrl, seenUrls = new Set()) {
  const current = new URL(currentUrl, window.location.href);
  const currentPage = parseInt(current.searchParams.get("page") || "1", 10);

  const relNext = rootDocument.querySelector("a[rel='next'], link[rel='next']");
  const relNextHref = relNext?.getAttribute("href");
  if (relNextHref) {
    const nextUrl = new URL(relNextHref, current.href).href;
    const next = new URL(nextUrl);
    if (next.origin === current.origin && next.pathname === current.pathname && !seenUrls.has(nextUrl)) {
      return nextUrl;
    }
  }

  let fallbackUrl = null;
  rootDocument.querySelectorAll("a[href]").forEach((anchor) => {
    try {
      const candidate = new URL(anchor.href, current.href);
      const candidatePage = parseInt(candidate.searchParams.get("page") || "1", 10);

      if (
        candidate.origin === current.origin &&
        candidate.pathname === current.pathname &&
        candidatePage === currentPage + 1 &&
        !seenUrls.has(candidate.href)
      ) {
        fallbackUrl = candidate.href;
      }
    } catch {
      // Ignore malformed links.
    }
  });

  return fallbackUrl;
}

function findGridContainer(cards) {
  const parentCounts = new Map();

  cards.forEach(({ card }) => {
    let current = card.parentElement;
    let depth = 0;

    while (current && current !== document.body && depth < 5) {
      if (current.id === "fit-extension-grid-host") return;
      const count = parentCounts.get(current) || 0;
      parentCounts.set(current, count + 1);
      current = current.parentElement;
      depth += 1;
    }
  });

  const rankedParents = [...parentCounts.entries()].sort((left, right) => right[1] - left[1]);
  return rankedParents[0]?.[0] ?? null;
}

function getOrCreateFilteredGridHost(gridContainer) {
  let host = document.getElementById("fit-extension-grid-host");
  if (host) {
    if (!host.isConnected) {
      gridContainer.insertAdjacentElement("beforebegin", host);
    }
    return host;
  }

  host = document.createElement("section");
  host.id = "fit-extension-grid-host";
  host.setAttribute("aria-live", "polite");

  const computed = window.getComputedStyle(gridContainer);
  host.style.display = computed.display.includes("grid") ? "grid" : "grid";
  host.style.gridTemplateColumns = computed.gridTemplateColumns && computed.gridTemplateColumns !== "none"
    ? computed.gridTemplateColumns
    : "repeat(auto-fill, minmax(220px, 1fr))";
  host.style.columnGap = computed.columnGap || "24px";
  host.style.rowGap = computed.rowGap || "24px";
  host.style.width = "100%";
  host.style.margin = "0";
  host.style.padding = "0";
  host.style.alignItems = "start";

  gridContainer.insertAdjacentElement("beforebegin", host);
  return host;
}

function normalizeCardForFilteredGrid(card) {
  card.style.removeProperty("display");
  card.style.removeProperty("opacity");
  card.style.removeProperty("position");
  card.style.removeProperty("top");
  card.style.removeProperty("left");
  card.style.removeProperty("right");
  card.style.removeProperty("bottom");
  card.style.removeProperty("transform");
  card.style.removeProperty("inset");
  card.style.removeProperty("width");
  card.style.removeProperty("height");
  card.style.margin = "0";
}

function cloneCardForFilteredGrid(card, unverified = false) {
  const container = document.createElement("div");
  let clonedCard;
  if (typeof container.setHTML === "function") {
    // Fetched HTML is data, not executable extension code. Native sanitization
    // removes scripts/handlers; discard controls whose site listeners are not copied.
    container.setHTML(card.outerHTML, { sanitizer: { removeElements: ["button", "form", "input", "style", "link", "meta", "base"] } });
    clonedCard = container.firstElementChild;
  }
  clonedCard ??= createPlainProductCard(card);
  normalizeCardForFilteredGrid(clonedCard);
  if (unverified) {
    const label = document.createElement("div");
    label.textContent = "Measurements not checked";
    label.style.fontSize = "12px";
    label.style.padding = "6px";
    label.style.background = "#fff3cd";
    label.style.color = "#664d03";
    clonedCard.prepend(label);
  }
  return clonedCard;
}

function createPlainProductCard(card) {
  // Older Chrome versions use a DOM-only fallback rather than inserting raw HTML.
  const result = document.createElement("article");
  const link = document.createElement("a");
  for (const anchor of card.querySelectorAll("a[href]")) {
    try {
      const url = new URL(anchor.getAttribute("href"), initialViewUrl);
      if (url.origin === new URL(initialViewUrl).origin && isProductUrl(url)) {
        link.href = url.href;
        break;
      }
    } catch { /* Ignore malformed links. */ }
  }
  const image = card.querySelector("img");
  if (image) {
    try {
      const src = new URL(image.getAttribute("src") || image.getAttribute("data-src"), initialViewUrl);
      if (src.protocol === "https:") {
        const safeImage = document.createElement("img");
        safeImage.src = src.href;
        safeImage.alt = image.getAttribute("alt") || "";
        safeImage.style.width = "100%";
        safeImage.style.height = "auto";
        link.appendChild(safeImage);
      }
    } catch { /* Text/link still work when an image URL is unreadable. */ }
  }
  const label = document.createElement("p");
  label.textContent = getTextValue(card).trim() || image?.getAttribute("alt") || "View checked listing";
  link.appendChild(label);
  result.appendChild(link);
  return result;
}

let gridRenderSequence = 0;
function reorganizeGrid(gridContainer, cardsToShow, cardsToHide, unverifiedCards = []) {
  const sequence = ++gridRenderSequence;
  const paint = () => {
    if (sequence !== gridRenderSequence || !isCurrentView()) return;
    paintGrid(gridContainer, cardsToShow, cardsToHide, unverifiedCards);
  };
  if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(paint);
  else paint();
}

function paintGrid(gridContainer, cardsToShow, cardsToHide, unverifiedCards) {
  const filteredGridHost = getOrCreateFilteredGridHost(gridContainer);
  filteredGridHost.replaceChildren();

  cardsToShow.forEach((card) => {
    filteredGridHost.appendChild(cloneCardForFilteredGrid(card, unverifiedCards.includes(card)));
  });

  cardsToHide.forEach((card) => {
    card.style.display = "none";
  });

  cardsToShow.forEach((card) => {
    card.style.display = "none";
  });

  if (gridContainer !== filteredGridHost) gridContainer.style.display = "none";
  filteredGridHost.style.display = "grid";
}

function absolutizeCardNode(cardNode, baseUrl) {
  cardNode.querySelectorAll("a[href]").forEach((anchor) => {
    anchor.href = new URL(anchor.getAttribute("href"), baseUrl).href;
  });

  cardNode.querySelectorAll("img").forEach((image) => {
    const src = image.getAttribute("src") || image.getAttribute("data-src");
    if (src) {
      image.src = new URL(src, baseUrl).href;
    }

    const srcset = image.getAttribute("srcset") || image.getAttribute("data-srcset");
    if (srcset) {
      image.srcset = srcset
        .split(",")
        .map((entry) => {
          const [urlPart, descriptor] = entry.trim().split(/\s+/, 2);
          const absoluteUrl = new URL(urlPart, baseUrl).href;
          return descriptor ? `${absoluteUrl} ${descriptor}` : absoluteUrl;
        })
        .join(", ");
    }
  });
}

let supplementFailed = false;
async function supplementFromNextPages(matchProduct, existingCards, neededCount = 1) {
  if (supplementInFlight || !isCurrentView()) return 0;
  const gridContainer = findGridContainer(existingCards);
  if (!gridContainer) return 0;
  getOrCreateFilteredGridHost(gridContainer);
  const state = moreResultsState();
  supplementFailed = false;
  supplementInFlight = true;
  let pagesLoaded = 0;
  let appendedCount = 0;
  updateResultsControls();
  try {
    while (isCurrentView() && appendedCount < neededCount) {
      if (!state.pending.length) {
        if (!state.nextUrl || pagesLoaded >= 5 || state.seen.has(state.nextUrl)) break;
        if (isExcludedSection(document, state.nextUrl)) { state.nextUrl = null; break; }
        showScanStatus("Loading more TRR results…");
        const nextUrl = state.nextUrl;
        const listingDocument = await getProductDocument(nextUrl);
        if (!isCurrentView()) break;
        state.seen.add(nextUrl);
        state.pagesLoaded += 1;
        pagesLoaded += 1;
        state.pageUrl = nextUrl;
        state.pending = findProductLinkCards(listingDocument, { requireVisible: false });
        state.nextUrl = getNextListingPageUrl(listingDocument, nextUrl, state.seen);
        if (!state.pending.length) continue;
      }
      const { url, card } = state.pending.shift();
      if (resultCards.has(productKey(url)) || productResultCache.get(url)?.overallMatch === false) continue;
      const result = await checkProduct(url, matchProduct);
      if (!isCurrentView()) break;
      showScanStatus("Checking more TRR listings…");
      if (!result.overallMatch) continue;
      const clonedCard = cloneCardForFilteredGrid(card);
      absolutizeCardNode(clonedCard, state.pageUrl);
      supplementedProductCards.set(url, clonedCard);
      resultCards.set(productKey(url), { url, card: clonedCard, unverified: false });
      appendedCount += 1;
    }
  } catch (error) {
    if (isCurrentView()) {
      supplementFailed = true;
      console.warn("Fit extension could not check more TRR listings", error);
    }
  } finally {
    supplementInFlight = false;
    if (isCurrentView()) renderResultsPage();
  }
  return appendedCount;
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length) {
      const nextItem = queue.shift();
      if (!nextItem) {
        return;
      }

      await worker(nextItem);
    }
  });

  await Promise.all(workers);
}

let filterInFlight = null;
let filterAgain = false;
function filterProductCards(matchProduct) {
  if (filterInFlight) {
    filterAgain = true;
    return filterInFlight;
  }
  filterInFlight = (async () => {
    let result;
    do {
      if (!isCurrentView()) return false;
      filterAgain = false;
      result = await performProductCardFilter(matchProduct);
    } while (filterAgain && isCurrentView());
    return result;
  })().finally(() => { filterInFlight = null; });
  return filterInFlight;
}

async function performProductCardFilter(matchProduct) {
  if (!isCurrentView()) return false;
  if (isExcludedSection(document)) return false;
  const candidates = findProductLinkCards(document, { requireVisible: false });
  if (!candidates.length) {
    return false;
  }

  pageProgress = { total: candidates.length, finished: 0, active: 0 };
  showScanStatus("Waiting for product measurements…");

  let visibleCount = 0;
  let hiddenCount = 0;
  let unknownCount = 0;
  const matchingCards = [];
  const hiddenCards = [];
  const unknownCards = [];
  const failedCards = [];

  await runWithConcurrency(candidates, 4, async ({ url, card }) => {
    pageProgress.active += 1;
    showScanStatus("Reading product measurements…");
    try {
      const result = await checkProduct(url, matchProduct);

      if (MeasurementMatching.classify(result) === "match") {
        matchingCards.push(card);
        visibleCount += 1;
        return;
      }

      if (MeasurementMatching.classify(result) === "not match") {
        hiddenCards.push(card);
        hiddenCount += 1;
        return;
      }

      unknownCards.push(card);
      unknownCount += 1;
    } catch (error) {
      if (error instanceof StaleViewError || !isCurrentView()) return;
      if (!(error instanceof ProductChecksBlockedError) && !(error instanceof ProductRequestTimeoutError)) {
        console.warn("Fit extension could not evaluate product", url, error);
      }
      failedCards.push(card);
    } finally {
      pageProgress.active -= 1;
      pageProgress.finished += 1;
      showScanStatus();
    }
  });

  if (!isCurrentView()) return false;
  sourceCandidates = candidates;
  pagerMatchProduct = matchProduct;
  resultCards.clear();
  for (const { url, card } of candidates) {
    if (matchingCards.includes(card) || failedCards.includes(card)) {
      resultCards.set(productKey(url), { url, card, unverified: failedCards.includes(card) });
    }
  }
  for (const [url, card] of supplementedProductCards) {
    if (!resultCards.has(productKey(url))) resultCards.set(productKey(url), { url, card, unverified: false });
  }
  const gridContainer = findGridContainer(candidates);
  if (gridContainer) {
    resultsGrid = gridContainer;
    renderResultsPage();
  } else {
    for (const { card } of resultCards.values()) { card.style.removeProperty("display"); card.style.removeProperty("opacity"); }
    for (const card of [...hiddenCards, ...unknownCards]) card.style.display = "none";
    visibleMatchCount = visibleCount;
  }
  if (failedCards.length) {
    showScanStatus(productChecksBlocked
      ? "TRR blocked measurement requests. Checks paused; try Reload page later."
      : productChecksTimedOut
        ? "Measurement requests timed out after 15 seconds. Checks paused; use Reload page to retry."
        : "Some product pages could not be loaded. Try Reload page later.");
  } else if (resultCards.size === 0) {
    await supplementFromNextPages(matchProduct, candidates, 1);
    showScanStatus(supplementFailed
      ? (productChecksBlocked ? "TRR blocked later-page checks."
        : productChecksTimedOut ? "Later-page measurement requests timed out after 15 seconds. Checks paused."
        : "Later pages could not be fully checked.")
      : visibleMatchCount > 0 ? "Added matching products from later pages." : "No confirmed matches found.");
  } else {
    showScanStatus("");
  }

  return {
    foundCandidates: true,
    visibleCount,
    hiddenCount,
    unknownCount,
    failedCount: failedCards.length,
    scan: summarizeScan()
  };
}

function watchForNewProducts(matchProduct) {
  let timeoutId = null;

  const rerunFilter = () => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      filterProductCards(matchProduct).catch((error) => {
        console.warn("Fit extension could not re-run product filtering", error);
      });
    }, 400);
  };

  const observer = new MutationObserver((mutations) => {
    const hasNewProductLinks = mutations.some((mutation) => {
      if (mutation.target.closest?.("#fit-extension-grid-host, #fit-extension-status")) return false;
      return [...mutation.addedNodes].some((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE ||
            node.closest("#fit-extension-grid-host, #fit-extension-status")) return false;
        return node.matches("a[href*='/products/']") || !!node.querySelector("a[href*='/products/']");
      });
    });
    if (hasNewProductLinks) {
      rerunFilter();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function startMatcher(settings) {
  const matchProduct = buildMatcher(settings);
  if (!matchProduct) {
    return;
  }

  if (isAccessDeniedDocument(document)) {
    updateStatusBadge("TRR blocked access to this page. No garment record was saved.");
    return;
  }
  watchForNavigation();
  if (isExcludedSection(document)) {
    updateStatusBadge("Matcher idle: bags, shoes, and accessories are skipped. No measurement checks or listing records are made here.");
    return;
  }
  if (isProductUrl(new URL(window.location.href))) {
    const productPageResult = evaluateProduct(document, window.location.href, matchProduct);
    await saveCheckedListing(window.location.href, document, productPageResult);
    showProductPageResult(productPageResult);
    return;
  }

  watchForNewProducts(matchProduct);
  const filtered = await filterProductCards(matchProduct);
  if (!filtered) {
    updateStatusBadge("No eligible clothing listings found here yet. Bags, shoes, and accessories are skipped.");
    return;
  }
}
async function initializeMatcher() {
  try {
    await startMatcher(await chrome.storage.sync.get(MeasurementMatching.settingsKeys));
  } catch (error) {
    console.warn("Could not start Measurement Matcher", error);
    updateStatusBadge("Matching could not start. Reload the page to retry.");
  }
}
initializeMatcher();

// The popup applies settings by restarting this page. This clears the matcher
// cache and restores the site's original DOM before checking the new range.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "reload-fit-matcher") return;
  sendResponse({ reloading: true });
  window.setTimeout(() => window.location.reload(), 0);
});
