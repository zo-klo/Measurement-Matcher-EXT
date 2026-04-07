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

// Save values
saveButton.addEventListener("click", () => {
  const waist = parseOptionalNumber(waistInput.value);
  const bust = parseOptionalNumber(bustInput.value);
  const tolerance = parseOptionalNumber(toleranceInput.value) ?? 0;

  chrome.storage.sync.set({ waist, bust, tolerance }, () => {
    window.close();
  });
});
