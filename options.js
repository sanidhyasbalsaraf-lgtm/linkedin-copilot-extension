const FIELDS = ["apiKey", "model", "name", "background", "samples", "tone", "notes"];
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

// Chrome throws this exact message when the extension was reloaded/updated
// while this Settings tab's JS was already running — it's now disconnected
// from the new background script and needs a page refresh.
function friendlyError(err) {
  const message = err && err.message ? err.message : String(err);
  if (/Extension context invalidated/i.test(message)) {
    return "This extension was just updated or reloaded. Refresh this page, then try again.";
  }
  return message;
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
  try {
    const themeStyle = document.getElementById("themeStyle").value;
    const themeMode = document.getElementById("themeMode").value;
    applyTheme(themeStyle, themeMode);
    chrome.storage.local.set({ themeStyle, themeMode }, () => {
      if (chrome.runtime.lastError) {
        showError("Couldn't save appearance: " + friendlyError(chrome.runtime.lastError));
      }
    });
  } catch (err) {
    showError(friendlyError(err));
  }
}

function save() {
  clearError();
  try {
    const values = {};
    FIELDS.forEach((f) => {
      values[f] = document.getElementById(f).value.trim();
    });
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        showError("Couldn't save settings: " + friendlyError(chrome.runtime.lastError));
        return;
      }
      const status = document.getElementById("status");
      status.textContent = "Saved.";
      setTimeout(() => (status.textContent = ""), 2000);
    });
  } catch (err) {
    showError(friendlyError(err));
  }
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("themeStyle").addEventListener("change", saveAppearance);
document.getElementById("themeMode").addEventListener("change", saveAppearance);
document.getElementById("howItWorks").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
});
load();
loadAppearance();
