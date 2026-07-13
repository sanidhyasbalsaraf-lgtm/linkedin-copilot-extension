const jdEl = document.getElementById("jd");
const hmEl = document.getElementById("hm");
const draftTypeEl = document.getElementById("draftType");
const subjectFieldEl = document.getElementById("subjectField");
const subjectEl = document.getElementById("subject");
const draftEl = document.getElementById("draft");
const genStatusEl = document.getElementById("genStatus");
const insertStatusEl = document.getElementById("insertStatus");
const generateBtn = document.getElementById("generate");
const errorBannerEl = document.getElementById("errorBanner");
const versionEl = document.getElementById("version");

// Only InMail has a subject field on LinkedIn — connection notes and regular
// message replies don't, so keep the field out of the way otherwise.
function updateSubjectVisibility() {
  subjectFieldEl.hidden = draftTypeEl.value !== "inmail";
}
draftTypeEl.addEventListener("change", updateSubjectVisibility);
updateSubjectVisibility();

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
// while this popup's JS was already running — the popup is now disconnected
// from the new background/content scripts and needs a fresh open to recover.
function friendlyError(err) {
  const message = err && err.message ? err.message : String(err);
  if (/Extension context invalidated/i.test(message)) {
    return "This extension was just updated or reloaded. Close this popup and reopen it, then try again.";
  }
  return message;
}

// Wraps a CTA handler so any thrown/rejected error surfaces in the error
// banner instead of failing silently.
function withErrorHandling(fn) {
  return async (...args) => {
    try {
      clearError();
      await fn(...args);
    } catch (err) {
      showError(friendlyError(err));
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

// silent=true is used for the best-effort auto-scan on popup open, where a
// miss shouldn't surface as an error. silent=false (the explicit "Re-scan"
// click) always either updates the field or throws, so it's never a no-op.
async function extractJd(silent) {
  const tab = await activeTab();
  if (!tab || !/linkedin\.com/.test(tab.url || "")) {
    if (silent) return;
    throw new Error("Open a LinkedIn tab first.");
  }
  await ensureContentScript(tab.id);
  const result = await sendToContentScript(tab.id, { type: "EXTRACT_JD" });
  if (result && result.found) {
    const header = [result.title, result.company].filter(Boolean).join(" @ ");
    jdEl.value = (header ? header + "\n\n" : "") + result.description;
    return;
  }
  const stored = await new Promise((resolve) => chrome.storage.local.get(["capturedJD"], resolve));
  if (stored.capturedJD) {
    jdEl.value = stored.capturedJD;
    return;
  }
  if (silent) return;
  throw new Error("No job description found on this page — open a LinkedIn job posting, or paste it in manually.");
}

async function extractHm(silent) {
  const tab = await activeTab();
  if (!tab || !/linkedin\.com/.test(tab.url || "")) {
    if (silent) return;
    throw new Error("Open a LinkedIn tab first.");
  }
  await ensureContentScript(tab.id);
  const result = await sendToContentScript(tab.id, { type: "EXTRACT_HM" });
  if (result && result.found) {
    hmEl.value = [result.name, result.profileUrl, result.details].filter(Boolean).join("\n");
    return;
  }
  const stored = await new Promise((resolve) => chrome.storage.local.get(["capturedHM"], resolve));
  if (stored.capturedHM) {
    hmEl.value = stored.capturedHM;
    return;
  }
  if (silent) return;
  throw new Error("No hiring-manager info found on this page — open their profile or the job's 'Meet the hiring team' card, or paste it in manually.");
}

function loadCapturedFallback() {
  chrome.storage.local.get(["capturedJD", "capturedHM"], (data) => {
    if (!jdEl.value.trim() && data.capturedJD) jdEl.value = data.capturedJD;
    if (!hmEl.value.trim() && data.capturedHM) hmEl.value = data.capturedHM;
  });
}

// LinkedIn's InMail compose box has a separate subject field; connection
// notes and regular message replies don't. For InMail, the model is asked to
// prefix its output with "Subject: ..." on its own line, which this splits
// back out. Any other shape (or non-InMail types) is treated as body-only.
function splitSubjectAndBody(text) {
  const match = /^Subject:\s*(.+?)\s*\n+([\s\S]+)$/i.exec(text.trim());
  if (match) {
    return { subject: match[1].trim(), body: match[2].trim() };
  }
  return { subject: "", body: text.trim() };
}

function buildPrompts(settings) {
  const draftType = draftTypeEl.value;
  const typeInstructions = {
    connection_note:
      "Write a LinkedIn connection request note. Hard limit: 300 characters. No greeting boilerplate like 'I hope this finds you well'. Get straight to a genuine, specific reason to connect based on the job and the person's background. Do not include a subject line.",
    inmail:
      "Write a LinkedIn InMail / direct message to the hiring manager. Aim for 80-150 words. Reference something specific from the job description and something specific from the hiring manager's profile if available. End with a clear, low-friction ask (e.g. a quick chat or to be considered for the role). Also write a short subject line (under 60 characters, specific to the role/company, no generic 'Application' or clickbait). Output format: the first line must be exactly 'Subject: <subject line>', then a blank line, then the message body — nothing else before or after.",
    reply:
      "Write a short cover-note style reply responding to this job posting, suitable to send alongside an application. Aim for 120-180 words. Reference 2-3 concrete requirements from the JD and connect them to the candidate's background. Do not include a subject line."
  };

  const system = [
    "You draft LinkedIn outreach messages on behalf of a real job seeker.",
    "Write ONLY in the candidate's own voice, matching the style samples and tone given below as closely as possible.",
    "Never invent facts, job titles, employers, or achievements that aren't in the candidate's background summary or style samples.",
    "Output only the final message text — no preamble, no explanation, no quotation marks around it.",
    settings.name ? `Candidate name: ${settings.name} — sign off with this name where a sign-off fits naturally (e.g. InMail/reply, not a 300-char connection note).` : "",
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
    chrome.storage.local.get(["apiKey", "model", "name", "background", "samples", "tone", "notes"], resolve)
  );

  if (!settings.apiKey) {
    throw new Error("Add your OpenAI API key in Settings (⚙) first.");
  }

  generateBtn.disabled = true;
  genStatusEl.textContent = "Generating…";
  draftEl.value = "";
  subjectEl.value = "";

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
    const { subject, body } = splitSubjectAndBody(response.text);
    draftEl.value = body;
    subjectEl.value = subject;
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
  const result = await sendToContentScript(tab.id, {
    type: "INSERT_DRAFT",
    text: draftEl.value,
    subject: subjectEl.value
  });
  if (result && result.inserted) {
    const subjectNote = result.subjectInserted ? " (subject included)" : "";
    insertStatusEl.textContent = `Inserted into the ${result.target}${subjectNote}.`;
  } else {
    throw new Error("No open message box found on this page — open LinkedIn's message/connection dialog first.");
  }
}

async function copyDraft() {
  if (!draftEl.value.trim()) {
    throw new Error("Nothing to copy yet — generate a draft first.");
  }
  const text = subjectEl.value.trim()
    ? `Subject: ${subjectEl.value.trim()}\n\n${draftEl.value}`
    : draftEl.value;
  await navigator.clipboard.writeText(text);
  insertStatusEl.textContent = "Copied to clipboard.";
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

document.getElementById("reExtractJd").addEventListener("click", withErrorHandling(() => extractJd(false)));
document.getElementById("reExtractHm").addEventListener("click", withErrorHandling(() => extractHm(false)));
document.getElementById("generate").addEventListener("click", withErrorHandling(generateDraft));
document.getElementById("insertDraft").addEventListener("click", withErrorHandling(insertDraftIntoPage));
document.getElementById("copyDraft").addEventListener("click", withErrorHandling(copyDraft));
document.getElementById("openOptions").addEventListener("click", withErrorHandling(openOptions));

loadCapturedFallback();
extractJd(true);
extractHm(true);
