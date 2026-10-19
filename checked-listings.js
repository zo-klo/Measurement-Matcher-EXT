// Shared by the content script and popup. One key per observation avoids
// read/modify/write races between concurrent checks and browser tabs.
const CheckedListings = (() => {
  const prefix = "checkedListing:";
  const columns = ["product_url", "item_id", "observed_at", "garment_bust", "garment_waist",
    "user_bust", "user_waist", "tolerance", "bust_difference", "waist_difference",
    "result", "product_price", "currency", "on_sale", "designer",
    "estimated_percent_off_retail", "fabric_composition", "garment_condition"];

  function productMetadata(root) {
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
        if (match) return match[1];
      }
      return null;
    };
    const nodeText = (selector) => root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || null;
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
    const condition = field("condition") || nodeText('[data-testid="product-condition"], .product-condition');
    const brand = product.brand;
    return {
      item_id: product.sku == null ? null : String(product.sku),
      product_price: Number.isFinite(price) ? price : null,
      currency: offer.priceCurrency || root.querySelector('meta[property="product:price:currency"]')?.getAttribute("content") || null,
      on_sale: saleLabel ? true : price !== null && originalPrice !== null ? price < originalPrice : null,
      designer: (typeof brand === "string" ? brand : brand?.name) || field("designer|brand") || nodeText('[data-testid="product-brand"], .product-brand') || null,
      estimated_percent_off_retail: percent ? Number(percent[1]) : null,
      fabric_composition: product.material ? [].concat(product.material).join("; ") : field("fabric|material|materials|composition|fabric content"),
      garment_condition: condition || null
    };
  }

  async function save(url, root, result) {
    const canonical = new URL(url);
    canonical.search = "";
    canonical.hash = "";
    const record = {
      product_url: canonical.href,
      observed_at: new Date().toISOString(),
      garment_bust: result.itemBust, garment_waist: result.itemWaist,
      user_bust: result.userBust, user_waist: result.userWaist, tolerance: result.tolerance,
      bust_difference: result.itemBust !== null && result.userBust !== null ? Number((result.itemBust - result.userBust).toFixed(4)) : null,
      waist_difference: result.itemWaist !== null && result.userWaist !== null ? Number((result.itemWaist - result.userWaist).toFixed(4)) : null,
      result: result.overallMatch ? "match" :
        ((result.userBust !== null && result.itemBust !== null && Math.abs(result.itemBust - result.userBust) > result.tolerance) ||
         (result.userWaist !== null && result.itemWaist !== null && Math.abs(result.itemWaist - result.userWaist) > result.tolerance))
          ? "not match" : "undetermined",
      ...productMetadata(root)
    };
    await chrome.storage.local.set({ [prefix + crypto.randomUUID()]: record });
  }

  function toCSV(records) {
    const escape = (value) => {
      if (value === null || value === undefined) return "";
      // Prevent spreadsheet formula execution in scraped text fields.
      const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? "'" + value : String(value);
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return [columns.join(","), ...records.map((record) => columns.map((key) => escape(record[key])).join(","))].join("\r\n") + "\r\n";
  }
  async function all() {
    const stored = await chrome.storage.local.get(null);
    return Object.entries(stored).filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value).sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  }
  return { save, all, toCSV, productMetadata, columns };
})();
