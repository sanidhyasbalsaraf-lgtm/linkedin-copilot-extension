const jdEl = document.getElementById("jd");
const hmEl = document.getElementById("hm");
const draftTypeEl = document.getElementById("draftType");
const draftEl = document.getElementById("draft");
const genStatusEl = document.getElementById("genStatus");
const insertStatusEl = document.getElementById("insertStatus");
const generateBtn = document.getElementById("generate");
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

// Wraps a CTA handler so any thrown/rejected error surfaces in the error
// banner instead of failing silently.
function withErrorHandling(fn) {
  return async (...args) => {
    try {
      clearError();
      await fn(...args);
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  };
}

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (e) {
    // Already injected, or a page the extension can't run on — ignore either way.
  }
}

function sendToContentScript(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}

async function extractJd() {
  const tab = await activeTab();
  if (!tab || !/linkedin\.com/.test(tab.url || "")) return;
  await ensureContentScript(tab.id);
  const result = await sendToContentScript(tab.id, { type: "EXTRACT_JD" });
  if (result && result.found) {
    const header = [result.title, result.company].filter(Boolean).join(" @ ");
    jdEl.value = (header ? header + "\n\n" : "") + result.description;
  } else {
    loadCapturedFallback();
  }
}

async function extractHm() {
  const tab = await activeTab();
  if (!tab || !/linkedin\.com/.test(tab.url || "")) return;
  await ensureContentScript(tab.id);
  const result = await sendToContentScript(tab.id, { type: "EXTRACT_HM" });
  if (result && result.found) {
    hmEl.value = [result.name, result.profileUrl, result.details].filter(Boolean).join("\n");
  } else {
    loadCapturedFallback();
  }
}

function loadCapturedFallback() {
  chrome.storage.local.get(["capturedJD", "capturedHM"], (data) => {
    if (!jdEl.value.trim() && data.capturedJD) jdEl.value = data.capturedJD;
    if (!hmEl.value.trim() && data.capturedHM) hmEl.value = data.capturedHM;
  });
}

function buildPrompts(settings) {
  const draftType = draftTypeEl.value;
  const typeInstructions = {
    connection_note:
      "Write a LinkedIn connection request note. Hard limit: 300 characters. No greeting boilerplate like 'I hope this finds you well'. Get straight to a genuine, specific reason to connect based on the job and the person's background.",
    inmail:
      "Write a LinkedIn InMail / direct message to the hiring manager. Aim for 80-150 words. Reference something specific from the job description and something specific from the hiring manager's profile if available. End with a clear, low-friction ask (e.g. a quick chat or to be considered for the role).",
    reply:
      "Write a short cover-note style reply responding to this job posting, suitable to send alongside an application. Aim for 120-180 words. Reference 2-3 concrete requirements from the JD and connect them to the candidate's background."
  };

  const system = [
    "You draft LinkedIn outreach messages on behalf of a real job seeker.",
    "Write ONLY in the candidate's own voice, matching the style samples and tone given below as closely as possible.",
    "Never invent facts, job titles, employers, or achievements that aren't in the candidate's background summary or style samples.",
    "Output only the final message text — no preamble, no explanation, no quotation marks around it.",
    settings.background ? `Candidate background:\n${settings.background}` : "",
    settings.tone ? `Desired tone: ${settings.tone}` : "",
    settings.samples ? `Writing style samples (match this voice, don't copy content):\n${settings.samples}` : "",
    settings.notes ? `Additional style notes: ${settings.notes}` : ""
  ].filter(Boolean).join("\n\n");

  const prompt = [
    typeInstructions[draftType],
    "",
    `Job description:\n${jdEl.value || "(not provided)"}`,
    "",
    `Hiring manager / recruiter info:\n${hmEl.value || "(not provided)"}`
  ].join("\n");

  return { system, prompt };
}

async function generateDraft() {
  const settings = await new Promise((resolve) =>
    chrome.storage.local.get(["apiKey", "model", "background", "samples", "tone", "notes"], resolve)
  );

  if (!settings.apiKey) {
    throw new Error("Add your OpenAI API key in Settings (⚙) first.");
  }

  generateBtn.disabled = true;
  genStatusEl.textContent = "Generating…";
  draftEl.value = "";

  const { system, prompt } = buildPrompts(settings);

  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GENERATE_DRAFT", payload: { apiKey: settings.apiKey, model: settings.model, system, prompt } },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res);
        }
      );
    });

    if (!response) {
      throw new Error("No response from the background script.");
    }
    if (!response.ok) {
      throw new Error(response.error || "Draft generation failed.");
    }
    draftEl.value = response.text;
  } finally {
    generateBtn.disabled = false;
    genStatusEl.textContent = "";
  }
}

async function insertDraftIntoPage() {
  const tab = await activeTab();
  if (!tab || !/linkedin\.com/.test(tab.url || "")) {
    throw new Error("Open a LinkedIn tab first.");
  }
  if (!draftEl.value.trim()) {
    throw new Error("Generate a draft first.");
  }
  const result = await sendToContentScript(tab.id, { type: "INSERT_DRAFT", text: draftEl.value });
  if (result && result.inserted) {
    insertStatusEl.textContent = `Inserted into the ${result.target}.`;
  } else {
    throw new Error("No open message box found on this page — open LinkedIn's message/connection dialog first.");
  }
}

async function copyDraft() {
  if (!draftEl.value.trim()) {
    throw new Error("Nothing to copy yet — generate a draft first.");
  }
  await navigator.clipboard.writeText(draftEl.value);
  insertStatusEl.textContent = "Copied to clipboard.";
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

document.getElementById("reExtractJd").addEventListener("click", withErrorHandling(extractJd));
document.getElementById("reExtractHm").addEventListener("click", withErrorHandling(extractHm));
document.getElementById("generate").addEventListener("click", withErrorHandling(generateDraft));
document.getElementById("insertDraft").addEventListener("click", withErrorHandling(insertDraftIntoPage));
document.getElementById("copyDraft").addEventListener("click", withErrorHandling(copyDraft));
document.getElementById("openOptions").addEventListener("click", withErrorHandling(openOptions));

loadCapturedFallback();
withErrorHandling(extractJd)();
withErrorHandling(extractHm)();
