const measurementInputs = Object.fromEntries(MeasurementMatching.measurements.map(key => [key, document.getElementById(key)]));
const allowanceInputs = Object.fromEntries(MeasurementMatching.allowanceKeys.map(key => [key, document.getElementById(key)]));
const saveButton = document.getElementById("save");

function setSavedValue(input, value) {
  if (value !== undefined && value !== null && !Number.isNaN(value)) {
    input.value = value;
  }
}

function parseOptionalNumber(value) {
  return MeasurementMatching.optionalNumber(value);
}

function updateRangePreview() {
  for (const measurement of MeasurementMatching.measurements) {
    const value = parseOptionalNumber(document.getElementById(measurement).value);
    const smaller = parseOptionalNumber(allowanceInputs[measurement + "Smaller"].value) ?? 0;
    const larger = parseOptionalNumber(allowanceInputs[measurement + "Larger"].value) ?? 0;
    const format = number => Number(number.toFixed(6));
    document.getElementById(measurement + "-range").textContent = value !== null && value > 0 && smaller >= 0 && larger >= 0
      ? `Accepts ${format(value - smaller)}–${format(value + larger)} inches.`
      : "Leave measurement blank to ignore it.";
  }
}

// Legacy ± tolerance supplies both directions until an individual allowance
// has been saved. In particular, an explicit zero must never fall back.
async function loadSavedSettings() {
  saveButton.disabled = true;
  try {
    const settings = MeasurementMatching.normalize(await chrome.storage.sync.get(MeasurementMatching.settingsKeys));
    for (const key of MeasurementMatching.measurements) setSavedValue(measurementInputs[key], settings[key]);
    for (const key of MeasurementMatching.allowanceKeys) setSavedValue(allowanceInputs[key], settings[key]);
    document.getElementById("pants-measurements").open = ["inseam", "rise", "legOpening"].some(key => settings[key] !== null);
    updateRangePreview();
    saveButton.disabled = false;
  } catch (error) {
    settingsStatus.textContent = "Saved settings could not be loaded. Reopen the popup to retry.";
    console.error("Could not load sizing preferences", error);
  }
}
for (const input of [...Object.values(measurementInputs), ...Object.values(allowanceInputs)]) {
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    input.setAttribute("aria-describedby", (input.getAttribute("aria-describedby") || "").replace(/\s*settings-status\b/g, ""));
    updateRangePreview();
  });
}

const reloadButton = document.getElementById("reload");
const settingsStatus = document.getElementById("settings-status");

// Only the TRR content script receives this message. Saving preferences on
// another website should not refresh an unrelated page.
async function applyToCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  await chrome.tabs.sendMessage(tab.id, { type: "reload-fit-matcher" });
}

document.getElementById("settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (saveButton.disabled) return;
  const measurements = Object.fromEntries(MeasurementMatching.measurements.map(key => [key, parseOptionalNumber(measurementInputs[key].value)]));
  const allowances = Object.fromEntries(MeasurementMatching.allowanceKeys.map(key => [key, parseOptionalNumber(allowanceInputs[key].value) ?? 0]));
  const inputs = [...Object.values(measurementInputs), ...Object.values(allowanceInputs)];
  const invalidInput = inputs.find(input => {
    const value = parseOptionalNumber(input.value);
    const isMeasurement = Object.values(measurementInputs).includes(input);
    return input.validity?.badInput || (input.value.trim() !== "" && value === null) ||
      (value !== null && (isMeasurement ? value <= 0 : value < 0));
  });
  if (invalidInput) {
    settingsStatus.textContent = "Enter positive measurements and zero or positive smaller/larger allowances.";
    invalidInput.setAttribute("aria-invalid", "true");
    invalidInput.setAttribute("aria-describedby", `${invalidInput.getAttribute("aria-describedby") || ""} settings-status`.trim());
    const details = invalidInput.closest("details");
    if (details) details.open = true;
    invalidInput.focus();
    return;
  }
  saveButton.disabled = true;
  try {
    await chrome.storage.sync.set({ ...measurements, ...allowances });
    settingsStatus.textContent = "Saved. Applying measurements...";
    try {
      await applyToCurrentPage();
      window.close();
    } catch {
      settingsStatus.textContent = "Saved. Open a TRR page or use Reload page to apply your settings.";
    }
  } catch (error) {
    settingsStatus.textContent = "Settings could not be saved. Please try again.";
    console.error("Could not save sizing preferences", error);
  } finally {
    saveButton.disabled = false;
  }
});

reloadButton.addEventListener("click", async () => {
  reloadButton.disabled = true;
  try {
    // tabs.reload uses the selected tab of the current window and needs no
    // new extension permission. The current unsaved inputs are not persisted.
    await chrome.tabs.reload();
    window.close();
  } catch (error) {
    settingsStatus.textContent = "Could not reload this page. Please try again.";
    console.error("Could not reload page", error);
  } finally {
    reloadButton.disabled = false;
  }
});


const exportButton = document.getElementById("export");
const exportStatus = document.getElementById("export-status");
exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  exportStatus.textContent = "Preparing export...";
  try {
    const records = await CheckedListings.all();
    if (!records.length) {
      exportStatus.textContent = "No checked listings saved yet. Browse TRR with saved measurements first.";
      return;
    }
    const blob = new Blob([CheckedListings.toCSV(records)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `checked-listings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    exportStatus.textContent = `Exported ${records.length} checked listings (all saved history).`;
  } catch (error) {
    console.error("Checked listing export failed", error);
    exportStatus.textContent = "Export failed. Please try again.";
  } finally {
    exportButton.disabled = false;
  }
});


const clearButton = document.getElementById("clear");
clearButton.addEventListener("click", async () => {
  if (!window.confirm("Delete saved checked listings from this device? Export first if you want to keep them. Your sizing preferences and downloaded CSV files will stay. Open TRR pages may save new checks.")) return;
  clearButton.disabled = true;
  exportButton.disabled = true;
  try {
    await CheckedListings.clear();
    exportStatus.textContent = "Saved listings cleared. Open TRR pages may save new checks.";
  } catch (error) {
    console.error("Could not clear checked listings", error);
    exportStatus.textContent = "Listings could not be cleared. Please try again.";
  } finally {
    clearButton.disabled = false;
    exportButton.disabled = false;
  }
});

loadSavedSettings();
