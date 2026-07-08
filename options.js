const FIELDS = ["apiKey", "model", "background", "samples", "tone", "notes"];
const errorBannerEl = document.getElementById("errorBanner");
const versionEl = document.getElementById("version");

versionEl.textContent = "v" + chrome.runtime.getManifest().version;

function showError(message) {
  errorBannerEl.textContent = message;
  errorBannerEl.hidden = false;
}

function clearError() {
  errorBannerEl.hidden = true;
  errorBannerEl.textContent = "";
}

function load() {
  chrome.storage.local.get(FIELDS, (data) => {
    if (chrome.runtime.lastError) {
      showError("Couldn't load saved settings: " + chrome.runtime.lastError.message);
      return;
    }
    FIELDS.forEach((f) => {
      const el = document.getElementById(f);
      if (data[f] !== undefined) el.value = data[f];
    });
  });
}

function loadAppearance() {
  chrome.storage.local.get(["themeStyle", "themeMode"], (data) => {
    document.getElementById("themeStyle").value = data.themeStyle || "linkedin";
    document.getElementById("themeMode").value = data.themeMode || "auto";
  });
}

function saveAppearance() {
  const themeStyle = document.getElementById("themeStyle").value;
  const themeMode = document.getElementById("themeMode").value;
  applyTheme(themeStyle, themeMode);
  chrome.storage.local.set({ themeStyle, themeMode }, () => {
    if (chrome.runtime.lastError) {
      showError("Couldn't save appearance: " + chrome.runtime.lastError.message);
    }
  });
}

function save() {
  clearError();
  const values = {};
  FIELDS.forEach((f) => {
    values[f] = document.getElementById(f).value.trim();
  });
  chrome.storage.local.set(values, () => {
    if (chrome.runtime.lastError) {
      showError("Couldn't save settings: " + chrome.runtime.lastError.message);
      return;
    }
    const status = document.getElementById("status");
    status.textContent = "Saved.";
    setTimeout(() => (status.textContent = ""), 2000);
  });
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("themeStyle").addEventListener("change", saveAppearance);
document.getElementById("themeMode").addEventListener("change", saveAppearance);
load();
loadAppearance();
