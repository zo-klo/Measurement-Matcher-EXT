// Shared settings and range rules for the popup, matcher, and CSV observations.
const MeasurementMatching = (() => {
  const optionalMeasurements = ["inseam", "hip", "rise", "legOpening"];
  const measurements = ["waist", "bust", ...optionalMeasurements];
  const legacyAllowanceKeys = ["waistSmaller", "waistLarger", "bustSmaller", "bustLarger"];
  const allowanceKeys = [...legacyAllowanceKeys, ...optionalMeasurements.flatMap(key => [key + "Smaller", key + "Larger"])];
  const settingsKeys = [...measurements, "tolerance", ...allowanceKeys];
  const bottomsCategories = new Set(["jeans", "pants", "trousers", "shorts", "skirts", "bottoms"]);

  function isBottoms(category) {
    return typeof category === "string" && bottomsCategories.has(category.trim().toLowerCase());
  }

  function appliesInseam({ garmentCategory, userInseam, itemInseam }) {
    return appliesOptional("inseam", { garmentCategory, userInseam, itemInseam });
  }

  function appliesOptional(measurement, result) {
    if (!optionalMeasurements.includes(measurement)) return false;
    const category = typeof result.garmentCategory === "string" ? result.garmentCategory.trim().toLowerCase() : null;
    if (measurement === "inseam" && category === "dresses") return false;
    if ((measurement === "rise" || measurement === "legOpening") && !["pants", "jeans", "trousers"].includes(category)) return false;
    const suffix = measurement[0].toUpperCase() + measurement.slice(1);
    return Number.isFinite(result["user" + suffix]) && Number.isFinite(result["item" + suffix]);
  }

  function optionalNumber(value) {
    if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalize(settings = {}) {
    const legacy = optionalNumber(settings.tolerance);
    const fallback = legacy !== null && legacy >= 0 ? legacy : 0;
    const normalized = {};
    for (const key of measurements) {
      const value = optionalNumber(settings[key]);
      normalized[key] = value !== null && value > 0 ? value : null;
    }
    for (const key of allowanceKeys) {
      const value = optionalNumber(settings[key]);
      normalized[key] = value !== null && value >= 0 ? value : legacyAllowanceKeys.includes(key) ? fallback : 0;
    }
    // Keep the legacy export field meaningful only for a fully symmetric rule.
    const symmetricKeys = [...legacyAllowanceKeys, ...optionalMeasurements.filter(key => normalized[key] !== null)
      .flatMap(key => [key + "Smaller", key + "Larger"])];
    normalized.tolerance = symmetricKeys.every(key => normalized[key] === normalized.waistSmaller)
      ? normalized.waistSmaller : null;
    return normalized;
  }

  function inRange(garment, user, smaller, larger) {
    if (!Number.isFinite(garment) || !Number.isFinite(user)) return false;
    const lower = user - smaller;
    const upper = user + larger;
    // Decimal inch values can have tiny binary rounding errors at a boundary.
    const epsilon = 4 * Number.EPSILON * Math.max(1, Math.abs(garment), Math.abs(lower), Math.abs(upper));
    return garment >= lower - epsilon && garment <= upper + epsilon;
  }

  function createMatcher(settings) {
    const values = normalize(settings);
    const userWaist = values.waist;
    const userBust = values.bust;
    const userOptional = Object.fromEntries(optionalMeasurements.map(key => ["user" + key[0].toUpperCase() + key.slice(1), values[key]]));
    if (measurements.every(key => values[key] === null)) return null;
    return ({ itemWaist, itemBust, itemInseam = null, itemHip = null, itemRise = null, itemLegOpening = null, garmentCategory = null }) => {
      const wantsWaist = userWaist !== null;
      const wantsBust = userBust !== null && !isBottoms(garmentCategory);
      const waistKnown = Number.isFinite(itemWaist);
      const bustKnown = Number.isFinite(itemBust);
      const optional = { itemInseam, itemHip, itemRise, itemLegOpening, ...userOptional };
      const applied = Object.fromEntries(optionalMeasurements.map(key => [key + "Applied", appliesOptional(key, { ...optional, garmentCategory })]));
      // Every measurement is optional when absent from the listing. A match
      // still needs at least one comparable, applicable requested value.
      const waistMatch = !wantsWaist || !waistKnown || inRange(itemWaist, userWaist, values.waistSmaller, values.waistLarger);
      const bustMatch = !wantsBust || !bustKnown || inRange(itemBust, userBust, values.bustSmaller, values.bustLarger);
      const optionalMismatch = optionalMeasurements.some(key => {
        const suffix = key[0].toUpperCase() + key.slice(1);
        return applied[key + "Applied"] && !inRange(optional["item" + suffix], values[key], values[key + "Smaller"], values[key + "Larger"]);
      });
      const comparableMeasurementFound = (wantsWaist && waistKnown) || (wantsBust && bustKnown) || Object.values(applied).some(Boolean);
      const overallMatch = comparableMeasurementFound && waistMatch && bustMatch && !optionalMismatch;
      const knownMismatch = (wantsWaist && waistKnown && !waistMatch) || (wantsBust && bustKnown && !bustMatch) || optionalMismatch;
      return {
        itemWaist, itemBust, userWaist, userBust, ...optional, ...applied,
        garmentCategory, bustApplied: wantsBust && bustKnown,
        ...Object.fromEntries(allowanceKeys.map(key => [key, values[key]])),
        tolerance: values.tolerance,
        comparableMeasurementFound, overallMatch,
        result: overallMatch ? "match" : knownMismatch ? "not match" : "undetermined"
      };
    };
  }

  function classify(result) {
    const matcher = createMatcher({ ...result, ...Object.fromEntries(measurements.map(key => [key, result["user" + key[0].toUpperCase() + key.slice(1)]])) });
    return matcher ? matcher(result).result : "undetermined";
  }

  return { measurements, allowanceKeys, settingsKeys, optionalNumber, normalize, inRange, isBottoms, appliesInseam, appliesOptional, createMatcher, classify };
})();
