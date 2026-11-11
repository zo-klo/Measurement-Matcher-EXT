// Shared by the content script and popup. One key per observation avoids
// read/modify/write races between concurrent checks and browser tabs.
const CheckedListings = (() => {
  const prefix = "checkedListing:";
  const additionalMeasurements = [["hip", "Hip"], ["rise", "Rise"], ["leg_opening", "LegOpening"]];
  const columns = ["product_url", "item_id", "observed_at", "garment_bust", "garment_waist",
    "user_bust", "user_waist", "tolerance", "bust_difference", "waist_difference",
    "result", "product_price", "currency", "on_sale", "designer",
    "estimated_percent_off_retail", "fabric_composition", "garment_condition",
    "waist_smaller_allowance", "waist_larger_allowance", "bust_smaller_allowance", "bust_larger_allowance", "scan_id", "search_url",
    "garment_inseam", "user_inseam", "inseam_smaller_allowance", "inseam_larger_allowance", "inseam_difference", "inseam_applied",
    "garment_category", "bust_applied", ...additionalMeasurements.flatMap(([key]) =>
      ["garment_" + key, "user_" + key, key + "_smaller_allowance", key + "_larger_allowance", key + "_difference", key + "_applied"])];

  function cleanText(value) {
    if (typeof value !== "string") return null;
    const text = value.replace(/\s+/g, " ").trim();
    return !text || /^(?:n\/?a|not available|unknown|[-—])$/i.test(text) ? null : text;
  }

  function mainProduct(root) {
    try {
      const script = root.querySelector('script#__NEXT_DATA__');
      if (!script) return null;
      const product = JSON.parse(script.textContent)?.props?.pageProps?.product;
      return product && typeof product === "object" && !Array.isArray(product) ? product : null;
    } catch {
      return null;
    }
  }

  function productAttribute(product, labels) {
    const attributes = [
      ...(Array.isArray(product?.attributes) ? product.attributes : []),
      ...(Array.isArray(product?.components) ? product.components : []).flatMap(component =>
        Array.isArray(component?.attributes) ? component.attributes : [])
    ];
    for (const attribute of attributes) {
      if (!attribute || attribute.measurement === true) continue;
      const names = [attribute.type, attribute.label].map(value => cleanText(value)?.replace(/:$/, "").toLowerCase());
      if (!names.some(name => labels.includes(name))) continue;
      const values = (Array.isArray(attribute.values) ? attribute.values : [attribute.values]).map(cleanText).filter(Boolean);
      if (values.length) return values.join("; ");
    }
    return null;
  }

  function readableText(node) {
    if (!node || /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(node.nodeName)) return "";
    if (node.nodeType === 3) return node.textContent || "";
    return [...(node.childNodes || [])].map(readableText).join(" ");
  }

  function labelledProductDetail(root, labels, condition = false) {
    const scope = root.querySelector('main#main-content, main, [role="main"]');
    if (!scope) return null;
    for (const node of scope.querySelectorAll('dt, th, div, p, span')) {
      // Similar-item cards can contain a different garment's condition/fabric.
      if (node.closest('[data-testid*="carousel"], [aria-roledescription="carousel"], [data-testid*="recommend"]')) continue;
      const label = cleanText([...(node.childNodes || [])].filter(child => child.nodeType === 3)
        .map(child => child.textContent).join(" "))?.replace(/:$/, "").toLowerCase();
      if (!labels.includes(label)) continue;
      const value = cleanText(readableText(node.querySelector('button') || node.nextElementSibling));
      // Never mistake a condition guide listing every grade for this item's grade.
      if (value && (!condition || /^(?:As Is|Fair|Good|Very Good|Excellent|Pristine)$/i.test(value))) return value;
    }
    return null;
  }

  function productMetadata(root) {
    const pageProduct = mainProduct(root);
    const products = [];
    function visit(value) {
      if (!value || typeof value !== "object") return;
      if ([].concat(value["@type"] || []).includes("Product")) products.push(value);
      if (Array.isArray(value)) value.forEach(visit);
      else Object.values(value).forEach(visit);
    }
    root.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try { visit(JSON.parse(script.textContent)); } catch { /* Ignore malformed structured data. */ }
    });
    const product = products[0] || {};
    const offer = [].concat(product.offers || [])[0] || {};
    const text = root.body?.textContent?.replace(/\s+/g, " ").trim() || "";
    const details = [...root.querySelectorAll(".product-details-group li")]
      .map((node) => node.textContent.replace(/\s+/g, " ").trim());
    const field = (labels) => {
      const pattern = new RegExp(`^(?:${labels})\\s*:\\s*(.+)$`, "i");
      for (const detail of details) {
        const match = detail.match(pattern);
        if (match) return cleanText(match[1]);
      }
      return null;
    };
    const nodeText = (selector) => cleanText(root.querySelector(selector)?.textContent);
    const priceNumber = (value) => {
      if (value == null || String(value).trim() === "") return null;
      const match = String(value).replace(/,/g, "").match(/^(?:[A-Z]{3}\s*)?[$€£]?\s*(\d+(?:\.\d+)?)(?:\s*[A-Z]{3})?$/);
      return match ? Number(match[1]) : null;
    };
    const percent = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:off\s*)?(?:estimated\s*)?(?:retail|retailer)/i);
    const priceMeta = root.querySelector('meta[property="product:price:amount"], meta[itemprop="price"]');
    const priceValue = offer.price ?? priceMeta?.getAttribute("content") ?? nodeText('[data-testid="product-price"], .product-price');
    const price = priceNumber(priceValue);
    const originalPrice = priceNumber(nodeText('.product-price del, .product-price s, [data-testid="original-price"]'));
    const saleLabel = nodeText('[data-testid="sale-price"], .product-sale-price');
    const condition = cleanText(pageProduct?.condition) || productAttribute(pageProduct, ["condition"]) ||
      field("condition") || nodeText('[data-testid="product-condition"], .product-condition') ||
      labelledProductDetail(root, ["condition"], true);
    const fabric = productAttribute(pageProduct, ["fabric", "material", "materials", "composition", "fabric content"]) ||
      field("fabric|material|materials|composition|fabric content") ||
      labelledProductDetail(root, ["fabric", "material", "materials", "composition", "fabric content"]) ||
      (!pageProduct && product.material ? [].concat(product.material).map(cleanText).filter(Boolean).join("; ") : null);
    const brand = product.brand;
    return {
      item_id: cleanText(pageProduct?.sku) || (product.sku == null ? null : String(product.sku)),
      product_price: Number.isFinite(price) ? price : null,
      currency: offer.priceCurrency || root.querySelector('meta[property="product:price:currency"]')?.getAttribute("content") || null,
      on_sale: saleLabel ? true : price !== null && originalPrice !== null ? price < originalPrice : null,
      designer: (typeof brand === "string" ? brand : brand?.name) || field("designer|brand") || nodeText('[data-testid="product-brand"], .product-brand') || null,
      estimated_percent_off_retail: percent ? Number(percent[1]) : null,
      fabric_composition: fabric || null,
      garment_condition: condition || null
    };
  }

  async function save(url, root, result, context = {}) {
    const canonical = new URL(url);
    canonical.search = "";
    canonical.hash = "";
    const allowances = MeasurementMatching.normalize({ ...result, ...Object.fromEntries(MeasurementMatching.measurements.map(key =>
      [key, result["user" + key[0].toUpperCase() + key.slice(1)]])) });
    const record = {
      product_url: canonical.href,
      scan_id: context.scanId ?? null,
      search_url: context.searchUrl ?? null,
      observed_at: new Date().toISOString(),
      garment_bust: result.itemBust, garment_waist: result.itemWaist,
      user_bust: result.userBust, user_waist: result.userWaist, tolerance: allowances.tolerance,
      waist_smaller_allowance: allowances.waistSmaller, waist_larger_allowance: allowances.waistLarger,
      bust_smaller_allowance: allowances.bustSmaller, bust_larger_allowance: allowances.bustLarger,
      garment_inseam: Number.isFinite(result.itemInseam) ? result.itemInseam : null,
      user_inseam: Number.isFinite(result.userInseam) ? result.userInseam : null,
      inseam_smaller_allowance: allowances.inseamSmaller, inseam_larger_allowance: allowances.inseamLarger,
      inseam_difference: Number.isFinite(result.itemInseam) && Number.isFinite(result.userInseam) ? Number((result.itemInseam - result.userInseam).toFixed(4)) : null,
      inseam_applied: MeasurementMatching.appliesInseam(result),
      garment_category: result.garmentCategory ?? null,
      bust_applied: Number.isFinite(result.userBust) && Number.isFinite(result.itemBust) && !MeasurementMatching.isBottoms(result.garmentCategory),
      bust_difference: result.itemBust !== null && result.userBust !== null ? Number((result.itemBust - result.userBust).toFixed(4)) : null,
      waist_difference: result.itemWaist !== null && result.userWaist !== null ? Number((result.itemWaist - result.userWaist).toFixed(4)) : null,
      result: MeasurementMatching.classify(result),
      ...productMetadata(root)
    };
    for (const [column, suffix] of additionalMeasurements) {
      const key = suffix[0].toLowerCase() + suffix.slice(1);
      const item = result["item" + suffix];
      const user = result["user" + suffix];
      record["garment_" + column] = Number.isFinite(item) ? item : null;
      record["user_" + column] = Number.isFinite(user) ? user : null;
      record[column + "_smaller_allowance"] = allowances[key + "Smaller"];
      record[column + "_larger_allowance"] = allowances[key + "Larger"];
      record[column + "_difference"] = Number.isFinite(item) && Number.isFinite(user) ? Number((item - user).toFixed(4)) : null;
      record[column + "_applied"] = MeasurementMatching.appliesOptional(key, result);
    }
    await chrome.storage.local.set({ [prefix + crypto.randomUUID()]: record });
  }

  function toCSV(records) {
    const escape = (value) => {
      if (value === null || value === undefined) return "";
      // Prevent spreadsheet formula execution in scraped text fields.
      const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? "'" + value : String(value);
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return [columns.join(","), ...records.map((record) => {
      // Derive allowances for historical symmetric observations at export time.
      // Keep their recorded result and all other saved fields unchanged.
      const exported = { ...record };
      for (const key of ["waist_smaller_allowance", "waist_larger_allowance", "bust_smaller_allowance", "bust_larger_allowance"]) {
        exported[key] ??= record.tolerance ?? null;
      }
      return columns.map((key) => escape(exported[key])).join(",");
    })].join("\r\n") + "\r\n";
  }
  async function all() {
    const stored = await chrome.storage.local.get(null);
    return Object.entries(stored).filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value).sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  }
  async function clear() {
    const stored = await chrome.storage.local.get(null);
    const keys = Object.keys(stored).filter((key) => key.startsWith(prefix));
    if (keys.length) await chrome.storage.local.remove(keys);
  }
  return { save, all, clear, toCSV, productMetadata, columns };
})();
