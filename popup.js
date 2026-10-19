const waistInput = document.getElementById("waist");
const bustInput = document.getElementById("bust");
const toleranceInput = document.getElementById("tolerance");
const saveButton = document.getElementById("save");

function setSavedValue(input, value) {
  if (value !== undefined && value !== null && !Number.isNaN(value)) {
    input.value = value;
  }
}

function parseOptionalNumber(value) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// Load saved values when popup opens
chrome.storage.sync.get(["waist", "bust", "tolerance"], (data) => {
  setSavedValue(waistInput, data.waist);
  setSavedValue(bustInput, data.bust);
  setSavedValue(toleranceInput, data.tolerance);
});

const reloadButton = document.getElementById("reload");
const settingsStatus = document.getElementById("settings-status");

// Only the TRR content script receives this message. Saving preferences on
// another website should not refresh an unrelated page.
async function applyToCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  await chrome.tabs.sendMessage(tab.id, { type: "reload-fit-matcher" });
}

saveButton.addEventListener("click", async () => {
  const waist = parseOptionalNumber(waistInput.value);
  const bust = parseOptionalNumber(bustInput.value);
  const tolerance = parseOptionalNumber(toleranceInput.value) ?? 0;
  if ((waist !== null && waist <= 0) || (bust !== null && bust <= 0) || tolerance < 0) {
    settingsStatus.textContent = "Measurements must be positive and tolerance cannot be negative.";
    return;
  }
  saveButton.disabled = true;
  try {
    await chrome.storage.sync.set({ waist, bust, tolerance });
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
    exportStatus.textContent = `Exported ${records.length} checked listings.`;
  } catch (error) {
    console.error("Checked listing export failed", error);
    exportStatus.textContent = "Export failed. Please try again.";
  } finally {
    exportButton.disabled = false;
  }
});
