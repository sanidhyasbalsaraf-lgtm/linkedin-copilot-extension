const FIELDS = ["apiKey", "model", "name", "background", "samples", "tone"];
const TOTAL_STEPS = 4;
let step = 1;

const errorBannerEl = document.getElementById("errorBanner");
const backBtn = document.getElementById("back");
const nextBtn = document.getElementById("next");
const skipStepBtn = document.getElementById("skipStep");
const dots = Array.from(document.querySelectorAll(".dot"));
const steps = Array.from(document.querySelectorAll(".step"));
const themeStyleEl = document.getElementById("themeStyle");
const themeModeEl = document.getElementById("themeMode");
const nameEl = document.getElementById("name");
const apiKeyEl = document.getElementById("apiKey");
const backgroundEl = document.getElementById("background");
const samplesEl = document.getElementById("samples");

// A step's Next button stays disabled until its required field(s) have
// something in them; optional fields (model, samples, tone) don't gate it.
// "Skip this step" bypasses the gate for anyone who'd rather fill it in later.
const STEP_VALIDATORS = {
  1: () => nameEl.value.trim().length > 0,
  2: () => apiKeyEl.value.trim().length > 0,
  3: () => backgroundEl.value.trim().length > 0 || samplesEl.value.trim().length > 0,
  4: () => true
};

function showError(message) {
  errorBannerEl.textContent = message;
  errorBannerEl.hidden = false;
}

function clearError() {
  errorBannerEl.hidden = true;
  errorBannerEl.textContent = "";
}

// Chrome throws this exact message when the extension was reloaded/updated
// while this onboarding tab's JS was already running.
function friendlyError(err) {
  const message = err && err.message ? err.message : String(err);
  if (/Extension context invalidated/i.test(message)) {
    return "This extension was just updated or reloaded. Refresh this page, then try again.";
  }
  return message;
}

function updateNextButtonState() {
  nextBtn.disabled = !STEP_VALIDATORS[step]();
}

function render() {
  steps.forEach((el) => el.classList.toggle("is-active", Number(el.dataset.step) === step));
  dots.forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle("is-active", n === step);
    el.classList.toggle("is-done", n < step);
    el.setAttribute("aria-selected", String(n === step));
  });
  backBtn.disabled = step === 1;
  nextBtn.textContent = step === TOTAL_STEPS ? "Go to LinkedIn Jobs" : "Next";
  // Step 1 (name) is mandatory — no skipping it. Step 4 has nothing to skip.
  skipStepBtn.hidden = step === 1 || step === TOTAL_STEPS;
  updateNextButtonState();
}

function saveAll() {
  return new Promise((resolve) => {
    let values;
    try {
      values = {};
      FIELDS.forEach((f) => {
        const el = document.getElementById(f);
        if (el) values[f] = el.value.trim();
      });
      values.themeStyle = themeStyleEl.value;
      values.themeMode = themeModeEl.value;
    } catch (err) {
      showError(friendlyError(err));
      resolve();
      return;
    }
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        showError("Couldn't save: " + friendlyError(chrome.runtime.lastError));
      }
      resolve();
    });
  });
}

function load() {
  chrome.storage.local.get([...FIELDS, "themeStyle", "themeMode"], (data) => {
    if (chrome.runtime.lastError) {
      showError("Couldn't load saved settings: " + chrome.runtime.lastError.message);
      return;
    }
    FIELDS.forEach((f) => {
      const el = document.getElementById(f);
      if (el && data[f] !== undefined) el.value = data[f];
    });
    themeStyleEl.value = data.themeStyle || "linkedin";
    themeModeEl.value = data.themeMode || "auto";
    updateNextButtonState();
  });
}

function finishOnboarding() {
  chrome.tabs.create({ url: "https://www.linkedin.com/jobs/" });
  window.close();
}

async function goNext() {
  clearError();
  await saveAll();
  if (step === TOTAL_STEPS) {
    finishOnboarding();
    return;
  }
  step += 1;
  render();
}

function goBack() {
  clearError();
  if (step > 1) {
    step -= 1;
    render();
  }
}

// Dots let you jump straight to any step. The only hard gate is step 1's
// name — every other step has its own "Skip this step" already, so a dot
// jump forward past step 1 is allowed even if those steps are empty.
async function goToStep(target) {
  clearError();
  if (target === step) return;
  if (target !== 1 && !STEP_VALIDATORS[1]()) {
    step = 1;
    render();
    showError("Enter your name on step 1 to continue.");
    return;
  }
  await saveAll();
  step = target;
  render();
}

async function skip() {
  clearError();
  await saveAll();
  finishOnboarding();
}

function previewTheme() {
  applyTheme(themeStyleEl.value, themeModeEl.value);
}

nextBtn.addEventListener("click", goNext);
backBtn.addEventListener("click", goBack);
skipStepBtn.addEventListener("click", goNext);
document.getElementById("skip").addEventListener("click", skip);
themeStyleEl.addEventListener("change", previewTheme);
themeModeEl.addEventListener("change", previewTheme);

[nameEl, apiKeyEl, backgroundEl, samplesEl].forEach((el) => {
  el.addEventListener("input", updateNextButtonState);
});

dots.forEach((el) => {
  el.addEventListener("click", () => goToStep(Number(el.dataset.step)));
});

load();
render();
