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
const injectedProductUrls = new Set();
let supplementInFlight = false;

function toOptionalNumber(value) {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getTextValue(node) {
  return node?.innerText?.replace(/\s+/g, " ").trim() ?? "";
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
    new RegExp(`${label}\\s*:?\\s*([\\d.]+(?:\\s*-\\s*[\\d.]+)?\\s*(?:"|inches|inch|in)?)`, "i"),
    new RegExp(`${label}\\s+measures\\s+([\\d.]+(?:\\s*-\\s*[\\d.]+)?\\s*(?:"|inches|inch|in)?)`, "i"),
    new RegExp(`${label}[^\\d]{0,20}([\\d.]+(?:\\s*-\\s*[\\d.]+)?\\s*(?:"|inches|inch|in)?)`, "i")
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
  const listItems = root.querySelectorAll(PRODUCT_DETAILS_SELECTOR);
  let itemWaist = null;
  let itemBust = null;

  listItems.forEach((li) => {
    const label = getTextValue(li.querySelector("strong, b, span"))
      .replace(":", "")
      .toLowerCase();

    const text = getTextValue(li);
    const inferredWaist = extractMeasurementFromText(text, "waist");
    const inferredBust = extractMeasurementFromText(text, "bust");

    if (label.includes("waist") && inferredWaist !== null) {
      itemWaist = inferredWaist;
    }

    if (label.includes("bust") && inferredBust !== null) {
      itemBust = inferredBust;
    }
  });

  if (itemWaist === null || itemBust === null) {
    const fullText = getTextValue(root.body || root.documentElement || root);
    itemWaist ??= extractMeasurementFromText(fullText, "waist");
    itemBust ??= extractMeasurementFromText(fullText, "bust");
  }

  return { itemWaist, itemBust };
}

function buildMatcher(settings) {
  const userWaist = toOptionalNumber(settings.waist);
  const userBust = toOptionalNumber(settings.bust);
  const tolerance = toOptionalNumber(settings.tolerance) ?? 0;

  if (userWaist === null && userBust === null) {
    return null;
  }

  return ({ itemWaist, itemBust }) => {
    const wantsWaist = userWaist !== null;
    const wantsBust = userBust !== null;

    const waistMatch = !wantsWaist ||
      (itemWaist !== null && Math.abs(itemWaist - userWaist) <= tolerance);
    const bustMatch = !wantsBust ||
      (itemBust !== null && Math.abs(itemBust - userBust) <= tolerance);

    const comparableMeasurementFound =
      (wantsWaist && itemWaist !== null) ||
      (wantsBust && itemBust !== null);

    return {
      itemWaist,
      itemBust,
      comparableMeasurementFound,
      overallMatch: comparableMeasurementFound && waistMatch && bustMatch
    };
  };
}

function ensureStatusBadge() {
  let badge = document.getElementById("fit-extension-status");
  if (badge) {
    return badge;
  }

  badge = document.createElement("div");
  badge.id = "fit-extension-status";
  badge.style.position = "fixed";
  badge.style.right = "16px";
  badge.style.bottom = "16px";
  badge.style.zIndex = "999999";
  badge.style.maxWidth = "260px";
  badge.style.padding = "10px 12px";
  badge.style.borderRadius = "10px";
  badge.style.background = "rgba(17, 24, 39, 0.92)";
  badge.style.color = "#fff";
  badge.style.fontSize = "12px";
  badge.style.lineHeight = "1.4";
  badge.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.18)";
  document.body.appendChild(badge);
  return badge;
}

function updateStatusBadge(message) {
  ensureStatusBadge().textContent = message;
}

function showProductPageResult(result) {
  if (!result.comparableMeasurementFound) {
    updateStatusBadge("No waist or bust measurements were found on this product.");
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
      !isProductUrl(url)
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

async function fetchDocument(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }

  const html = await response.text();
  return new DOMParser().parseFromString(html, "text/html");
}

function loadDocumentInIframe(url) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    const cleanup = () => iframe.remove();

    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out loading ${url} in iframe`));
    }, 15000);

    iframe.onload = () => {
      window.clearTimeout(timeoutId);

      try {
        const loadedDocument = iframe.contentDocument;
        if (!loadedDocument) {
          cleanup();
          reject(new Error(`No iframe document for ${url}`));
          return;
        }

        resolve(loadedDocument);
      } catch (error) {
        reject(error);
      } finally {
        cleanup();
      }
    };

    iframe.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error(`Iframe failed to load ${url}`));
    };

    iframe.src = url;
    document.body.appendChild(iframe);
  });
}

async function getProductDocument(url) {
  try {
    return await fetchDocument(url);
  } catch (fetchError) {
    console.warn("Fit extension fetch failed, trying iframe fallback", url, fetchError);
    return loadDocumentInIframe(url);
  }
}

function getNextListingPageUrl(rootDocument, currentUrl, seenUrls = new Set()) {
  const current = new URL(currentUrl, window.location.href);
  const currentPage = parseInt(current.searchParams.get("page") || "1", 10);

  const relNext = rootDocument.querySelector("a[rel='next'], link[rel='next']");
  const relNextHref = relNext?.getAttribute("href");
  if (relNextHref) {
    const nextUrl = new URL(relNextHref, current.href).href;
    if (!seenUrls.has(nextUrl)) {
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

function reorganizeGrid(gridContainer, cardsToShow, cardsToHide) {
  const filteredGridHost = getOrCreateFilteredGridHost(gridContainer);
  filteredGridHost.replaceChildren();

  cardsToShow.forEach((card) => {
    normalizeCardForFilteredGrid(card);
    filteredGridHost.appendChild(card);
  });

  cardsToHide.forEach((card) => {
    card.style.display = "none";
  });

  gridContainer.style.display = "none";
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

async function supplementFromNextPages(matchProduct, existingCards, neededCount = 1) {
  if (supplementInFlight) {
    return 0;
  }

  const gridContainer = findGridContainer(existingCards);
  if (!gridContainer) {
    return 0;
  }
  const filteredGridHost = getOrCreateFilteredGridHost(gridContainer);

  supplementInFlight = true;
  const seenListingUrls = new Set([window.location.href]);
  let nextListingUrl = getNextListingPageUrl(document, window.location.href, seenListingUrls);
  let pagesScanned = 0;
  let appendedCount = 0;

  try {
    while (nextListingUrl && pagesScanned < 5 && appendedCount < neededCount) {
      seenListingUrls.add(nextListingUrl);
      pagesScanned += 1;
      updateStatusBadge(`Checking more results from page ${pagesScanned + 1}...`);

      const listingDocument = await getProductDocument(nextListingUrl);
      const listingCards = findProductLinkCards(listingDocument, { requireVisible: false });

      for (const { url, card } of listingCards) {
        if (injectedProductUrls.has(url) || productResultCache.get(url)?.overallMatch === false) {
          continue;
        }

        let result = productResultCache.get(url);
        if (!result) {
          const productDocument = await getProductDocument(url);
          result = matchProduct(extractMeasurements(productDocument));
          productResultCache.set(url, result);
        }

        if (!result.overallMatch) {
          continue;
        }

        const clonedCard = card.cloneNode(true);
        absolutizeCardNode(clonedCard, nextListingUrl);
        normalizeCardForFilteredGrid(clonedCard);
        filteredGridHost.appendChild(clonedCard);
        injectedProductUrls.add(url);
        appendedCount += 1;

        if (appendedCount >= neededCount) {
          break;
        }
      }

      nextListingUrl = getNextListingPageUrl(listingDocument, nextListingUrl, seenListingUrls);
    }
  } catch (error) {
    console.warn("Fit extension could not supplement products from later pages", error);
  } finally {
    supplementInFlight = false;
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

async function filterProductCards(matchProduct) {
  const candidates = findProductLinkCards();
  if (!candidates.length) {
    return false;
  }

  updateStatusBadge(`Checking ${candidates.length} products against your measurements...`);

  let visibleCount = 0;
  let hiddenCount = 0;
  let unknownCount = 0;
  const matchingCards = [];
  const hiddenCards = [];
  const unknownCards = [];

  await runWithConcurrency(candidates, 4, async ({ url, card }) => {
    try {
      let result = productResultCache.get(url);
      if (!result) {
        const productDocument = await getProductDocument(url);
        result = matchProduct(extractMeasurements(productDocument));
        productResultCache.set(url, result);
      }

      if (result.overallMatch) {
        matchingCards.push(card);
        visibleCount += 1;
        return;
      }

      if (result.comparableMeasurementFound) {
        hiddenCards.push(card);
        hiddenCount += 1;
        return;
      }

      unknownCards.push(card);
      unknownCount += 1;
    } catch (error) {
      console.warn("Fit extension could not evaluate product", url, error);
      unknownCards.push(card);
      unknownCount += 1;
    }
  });

  const gridContainer = findGridContainer(candidates);
  if (gridContainer) {
    reorganizeGrid(gridContainer, matchingCards, [...hiddenCards, ...unknownCards]);
  } else {
    matchingCards.forEach((card) => {
      card.style.removeProperty("display");
      card.style.removeProperty("opacity");
    });

    [...hiddenCards, ...unknownCards].forEach((card) => {
      card.style.display = "none";
    });
  }

  updateStatusBadge(
    `Showing ${visibleCount} matches. Hidden ${hiddenCount} outside your range. ` +
    `${unknownCount} still could not be measured.`
  );

  if (visibleCount === 0) {
    const supplementedCount = await supplementFromNextPages(matchProduct, candidates, 1);

    if (supplementedCount > 0) {
      updateStatusBadge(`No matches on this page. Pulled in ${supplementedCount} match from later pages.`);
    } else {
      updateStatusBadge("No matches were found on this page or the next few pages.");
    }
  }

  return {
    foundCandidates: true,
    visibleCount,
    hiddenCount,
    unknownCount
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
    const hasAddedNodes = mutations.some((mutation) => mutation.addedNodes.length > 0);
    if (hasAddedNodes) {
      rerunFilter();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

chrome.storage.sync.get(["waist", "bust", "tolerance"], async (settings) => {
  const matchProduct = buildMatcher(settings);
  if (!matchProduct) {
    return;
  }

  const productPageResult = matchProduct(extractMeasurements(document));
  if (productPageResult.comparableMeasurementFound) {
    showProductPageResult(productPageResult);
    return;
  }

  const filtered = await filterProductCards(matchProduct);
  if (!filtered) {
    updateStatusBadge("No product cards with measurements were found on this page yet.");
    watchForNewProducts(matchProduct);
    return;
  }

  watchForNewProducts(matchProduct);
});
