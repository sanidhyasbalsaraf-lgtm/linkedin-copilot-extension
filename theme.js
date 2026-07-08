// Shared by popup.html and options.html. Applies the saved appearance
// (Look + Mode) as data attributes tokens.css keys off of, and keeps every
// open extension page in sync when Settings > Appearance changes.

function applyTheme(style, mode) {
  const root = document.documentElement;
  if (style === "editorial") {
    root.setAttribute("data-style", "editorial");
  } else {
    root.removeAttribute("data-style");
  }
  if (mode === "light" || mode === "dark") {
    root.setAttribute("data-theme", mode);
  } else {
    root.removeAttribute("data-theme");
  }
}

function loadAndApplyTheme() {
  chrome.storage.local.get(["themeStyle", "themeMode"], (data) => {
    applyTheme(data.themeStyle || "linkedin", data.themeMode || "auto");
  });
}

loadAndApplyTheme();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.themeStyle || changes.themeMode)) {
    loadAndApplyTheme();
  }
});
