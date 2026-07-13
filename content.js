// Runs on linkedin.com pages. Extracts job description / hiring manager info,
// and inserts generated drafts into whatever message box is open on the page.
// LinkedIn's DOM/class names change often and are obfuscated, so every
// extractor tries several fallback selectors and degrades gracefully to
// "not found" rather than throwing — the popup always lets the user paste
// text manually if auto-extract comes up empty.
//
// Guarded against double-injection: the manifest auto-injects this file into
// every LinkedIn tab, and the popup also injects it on demand as a fallback
// (see ensureContentScript in popup.js). Without this guard, a second
// injection would re-declare the same top-level consts and throw.
if (!window.__liCopilotInjected) {
window.__liCopilotInjected = true;

function textOf(el) {
  return el ? el.innerText.trim().replace(/\n{3,}/g, "\n\n") : "";
}

function firstMatch(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && textOf(el)) return el;
  }
  return null;
}

// Our own "Capture for Copilot" button is inserted as a sibling of whatever
// heading/container anchors it, so any selector that reads an ancestor of
// that anchor can end up including the button's own (transient) label text.
// Detach it for the duration of `fn`, then put it back in its exact spot —
// covers every extraction path in one place instead of patching each branch.
function withCaptureButtonDetached(fn) {
  const ownButton = document.getElementById(CAPTURE_BTN_ID);
  const parent = ownButton ? ownButton.parentElement : null;
  const nextSibling = ownButton ? ownButton.nextSibling : null;
  if (ownButton) ownButton.remove();
  try {
    return fn();
  } finally {
    if (ownButton && parent) parent.insertBefore(ownButton, nextSibling);
  }
}

function extractJobDescription() {
  return withCaptureButtonDetached(() => {
    const titleEl = firstMatch([
      "h1.job-details-jobs-unified-top-card__job-title",
      "h1.jobs-unified-top-card__job-title",
      ".job-details-jobs-unified-top-card__job-title-link",
      "h1"
    ]);
    const companyEl = firstMatch([
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__primary-description-container a"
    ]);
    const descEl = firstMatch([
      ".jobs-description__content .jobs-box__html-content",
      ".jobs-description-content__text",
      ".jobs-box__html-content",
      "#job-details",
      ".jobs-description"
    ]);

    const title = textOf(titleEl);
    const company = textOf(companyEl);
    let description = textOf(descEl);

    if (!description) {
      // Fallback: find a heading that says "About the job" and grab its container's text.
      const heading = Array.from(document.querySelectorAll("h2, h3")).find((h) =>
        /about the job/i.test(h.innerText)
      );
      if (heading && heading.parentElement) {
        description = textOf(heading.parentElement);
      }
    }

    return { title, company, description, found: Boolean(description) };
  });
}

function extractHiringManager() {
  // Case 1: a "Meet the hiring team" card on a job posting.
  const heading = Array.from(document.querySelectorAll("h2, h3")).find((h) =>
    /hiring team|meet the hiring team|hirer/i.test(h.innerText)
  );

  if (heading) {
    const card = heading.closest("section, div") || heading.parentElement;
    const link = card ? card.querySelector('a[href*="/in/"]') : null;
    const nameEl = card ? card.querySelector("strong, .hirer-card__hirer-information strong, a[href*='/in/'] span[aria-hidden='true']") : null;
    const name = textOf(nameEl) || (link ? textOf(link) : "");
    const infoText = card ? textOf(card) : "";
    return {
      name,
      profileUrl: link ? link.href.split("?")[0] : "",
      details: infoText,
      found: Boolean(name || infoText)
    };
  }

  // Case 2: the user is directly on the hiring manager's / recruiter's profile page.
  if (/linkedin\.com\/in\//.test(location.href)) {
    const nameEl = firstMatch(["h1.text-heading-xlarge", "h1"]);
    const headlineEl = firstMatch([".text-body-medium.break-words", ".pv-text-details__left-panel .text-body-medium"]);
    const aboutHeading = Array.from(document.querySelectorAll("h2")).find((h) => /^about$/i.test(h.innerText.trim()));
    let about = "";
    if (aboutHeading) {
      const section = aboutHeading.closest("section");
      about = section ? textOf(section) : "";
    }
    const name = textOf(nameEl);
    const headline = textOf(headlineEl);
    return {
      name,
      profileUrl: location.href.split("?")[0],
      details: [headline, about].filter(Boolean).join("\n\n"),
      found: Boolean(name)
    };
  }

  return { name: "", profileUrl: "", details: "", found: false };
}

// --- Insert a drafted message into whatever compose box is currently open ---

function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value") ?
    Object.getOwnPropertyDescriptor(element, "value").set : undefined;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value") ?
    Object.getOwnPropertyDescriptor(prototype, "value").set : undefined;

  if (valueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertSubject(subject) {
  if (!subject) return false;
  // LinkedIn's InMail compose has a separate subject input; connection notes
  // and regular messages don't have one, so this is a no-op there.
  const subjectBox = document.querySelector(
    "input[name='subject'], input[id*='subject' i], input[aria-label*='subject' i]"
  );
  if (!subjectBox) return false;
  subjectBox.focus();
  setNativeValue(subjectBox, subject);
  return true;
}

function insertDraft(text, subject) {
  // Connection-request note.
  const noteBox = document.querySelector("textarea#custom-message, textarea[name='message']");
  if (noteBox) {
    noteBox.focus();
    setNativeValue(noteBox, text);
    return { inserted: true, target: "connection note", subjectInserted: false };
  }

  // Messaging / InMail contenteditable compose box (inbox or profile "Message" modal).
  const composeBox = document.querySelector(
    "div.msg-form__contenteditable[contenteditable='true'], div[contenteditable='true'][role='textbox']"
  );
  if (composeBox) {
    const subjectInserted = insertSubject(subject);
    composeBox.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    composeBox.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));
    return { inserted: true, target: "message box", subjectInserted };
  }

  return { inserted: false, target: null, subjectInserted: false };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EXTRACT_JD") {
    sendResponse(extractJobDescription());
  } else if (msg.type === "EXTRACT_HM") {
    sendResponse(extractHiringManager());
  } else if (msg.type === "INSERT_DRAFT") {
    sendResponse(insertDraft(msg.text, msg.subject));
  }
  return true;
});

// --- On-page capture button, placed right next to the job description ---
// This avoids relying on chrome.tabs.sendMessage from the popup, which fails
// silently on tabs that were already open before the extension was loaded
// (no content script gets injected into pre-existing tabs automatically).

const CAPTURE_BTN_ID = "li-copilot-capture-btn";

function findAnchorForButton() {
  const heading = Array.from(document.querySelectorAll("h2, h3")).find((h) =>
    /about the job/i.test(h.innerText)
  );
  if (heading) return heading;
  return firstMatch([
    ".jobs-description__content .jobs-box__html-content",
    ".jobs-description-content__text",
    ".jobs-box__html-content",
    "#job-details",
    ".jobs-description"
  ]);
}

const INLINE_BTN_COLORS = {
  linkedin: { border: "#0a66c2", text: "#004182", hoverBg: "#0a66c2", hoverText: "#ffffff" },
  editorial: { border: "#b8792a", text: "#96611f", hoverBg: "#b8792a", hoverText: "#fffaf1" }
};

let inlineBtnStyle = "linkedin";

function paintCaptureButton(btn) {
  const colors = INLINE_BTN_COLORS[inlineBtnStyle] || INLINE_BTN_COLORS.linkedin;
  btn.style.color = colors.text;
  btn.style.borderColor = colors.border;
  btn.dataset.hoverBg = colors.hoverBg;
  btn.dataset.hoverText = colors.hoverText;
}

chrome.storage.local.get(["themeStyle"], (data) => {
  inlineBtnStyle = data.themeStyle || "linkedin";
  const existing = document.getElementById(CAPTURE_BTN_ID);
  if (existing) paintCaptureButton(existing);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.themeStyle) return;
  inlineBtnStyle = changes.themeStyle.newValue || "linkedin";
  const existing = document.getElementById(CAPTURE_BTN_ID);
  if (existing) paintCaptureButton(existing);
});

function captureNow(btn, label) {
  const jd = extractJobDescription();
  const hm = extractHiringManager();

  chrome.storage.local.set({
    capturedJD: jd.found ? [jd.title, jd.company].filter(Boolean).join(" @ ") + "\n\n" + jd.description : "",
    capturedHM: hm.found ? [hm.name, hm.profileUrl, hm.details].filter(Boolean).join("\n") : "",
    capturedAt: Date.now(),
    capturedUrl: location.href
  });

  btn.textContent = jd.found ? "Captured ✓" : "No job description found";
  setTimeout(() => (btn.textContent = label), 2000);
}

function injectCaptureButton() {
  if (document.getElementById(CAPTURE_BTN_ID)) return;
  const anchor = findAnchorForButton();
  if (!anchor || !anchor.parentElement) return;

  const fontFace = document.createElement("style");
  fontFace.id = "li-copilot-inline-font";
  if (!document.getElementById(fontFace.id)) {
    fontFace.textContent = `
      @font-face {
        font-family: "Public Sans Copilot";
        font-weight: 600;
        src: url("${chrome.runtime.getURL("fonts/public-sans-600.woff2")}") format("woff2");
      }
    `;
    document.head.appendChild(fontFace);
  }

  const label = "Capture job for Copilot";
  const btn = document.createElement("button");
  btn.id = CAPTURE_BTN_ID;
  btn.type = "button";
  btn.textContent = label;
  btn.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "margin:10px 0",
    "padding:6px 14px",
    "background:transparent",
    "border:1px solid",
    "border-radius:7px",
    "font-size:12.5px",
    "font-weight:600",
    "font-family:'Public Sans Copilot',-apple-system,'Segoe UI',sans-serif",
    "cursor:pointer",
    "z-index:1",
    "transition:background 0.12s ease, color 0.12s ease"
  ].join(";");
  paintCaptureButton(btn);
  btn.addEventListener("mouseenter", () => {
    btn.style.background = btn.dataset.hoverBg;
    btn.style.color = btn.dataset.hoverText;
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "transparent";
    paintCaptureButton(btn);
  });
  btn.addEventListener("click", () => captureNow(btn, label));

  anchor.parentElement.insertBefore(btn, anchor);
}

// LinkedIn is a single-page app — job content swaps in without a full page
// reload, so watch for DOM changes and (re-)insert the button when needed.
let injectTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(injectTimer);
  injectTimer = setTimeout(injectCaptureButton, 400);
});
observer.observe(document.body, { childList: true, subtree: true });

injectCaptureButton();

// --- Full floating panel: re-scan, generate, copy, insert — mirrors the popup ---
// Runs entirely inside a Shadow DOM so LinkedIn's page styles can't bleed in
// and our styles can't bleed out onto the page.

const PANEL_HOST_ID = "li-copilot-panel-host";

function fontUrl(file) {
  return chrome.runtime.getURL(`fonts/${file}`);
}

const PANEL_STYLE = `
  @font-face { font-family: "Fraunces LC"; font-weight: 600; font-style: normal; src: url("${fontUrl("fraunces-600.woff2")}") format("woff2"); }
  @font-face { font-family: "Public Sans LC"; font-weight: 400; src: url("${fontUrl("public-sans-400.woff2")}") format("woff2"); }
  @font-face { font-family: "Public Sans LC"; font-weight: 500; src: url("${fontUrl("public-sans-500.woff2")}") format("woff2"); }
  @font-face { font-family: "Public Sans LC"; font-weight: 600; src: url("${fontUrl("public-sans-600.woff2")}") format("woff2"); }
  @font-face { font-family: "IBM Plex Mono LC"; font-weight: 500; src: url("${fontUrl("ibm-plex-mono-500.woff2")}") format("woff2"); }

  :host {
    /* LinkedIn look (default) — light */
    --ink: rgba(0,0,0,0.9); --ink-soft: rgba(0,0,0,0.6); --ink-faint: rgba(0,0,0,0.35);
    --paper: #f4f2ee; --surface: #ffffff; --line: #dcdad5;
    --accent: #0a66c2; --accent-strong: #004182; --accent-ink: #ffffff;
    --danger: #b7472a; --danger-bg: #fbe9e5;
    --font-display: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    --font-body: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    --font-mono: "IBM Plex Mono LC", ui-monospace, Consolas, monospace;
    --wordmark-weight: 700;
    --eyebrow-style: normal; --eyebrow-weight: 700; --eyebrow-transform: uppercase; --eyebrow-tracking: 0.07em; --eyebrow-size-adjust: -1px;
    --btn-radius: 22px; --input-radius: 6px;
  }
  @media (prefers-color-scheme: dark) {
    :host { --ink: rgba(255,255,255,0.9); --ink-soft: rgba(255,255,255,0.6); --ink-faint: rgba(255,255,255,0.35); --paper: #1d2226; --surface: #000000; --line: #38434f; --accent: #6fb2f1; --accent-strong: #a6d1fb; --accent-ink: #06253c; --danger: #e2695a; --danger-bg: #2c1917; }
  }
  :host([data-theme="dark"]) { --ink: rgba(255,255,255,0.9); --ink-soft: rgba(255,255,255,0.6); --ink-faint: rgba(255,255,255,0.35); --paper: #1d2226; --surface: #000000; --line: #38434f; --accent: #6fb2f1; --accent-strong: #a6d1fb; --accent-ink: #06253c; --danger: #e2695a; --danger-bg: #2c1917; }
  :host([data-theme="light"]) { --ink: rgba(0,0,0,0.9); --ink-soft: rgba(0,0,0,0.6); --ink-faint: rgba(0,0,0,0.35); --paper: #f4f2ee; --surface: #ffffff; --line: #dcdad5; --accent: #0a66c2; --accent-strong: #004182; --accent-ink: #ffffff; --danger: #b7472a; --danger-bg: #fbe9e5; }

  :host([data-style="editorial"]) {
    --ink: #151c2c; --ink-soft: #545b6b; --ink-faint: #8a90a0;
    --paper: #f4f5f7; --surface: #ffffff; --line: #dde0e6;
    --accent: #b8792a; --accent-strong: #96611f; --accent-ink: #fffaf1;
    --danger: #b23b32; --danger-bg: #fbeceb;
    --font-display: "Fraunces LC", Georgia, serif;
    --font-body: "Public Sans LC", -apple-system, "Segoe UI", sans-serif;
    --wordmark-weight: 600;
    --eyebrow-style: italic; --eyebrow-weight: 600; --eyebrow-transform: none; --eyebrow-tracking: 0; --eyebrow-size-adjust: 1px;
    --btn-radius: 7px; --input-radius: 6px;
  }
  @media (prefers-color-scheme: dark) {
    :host([data-style="editorial"]) { --ink: #e9eaee; --ink-soft: #a7adbb; --ink-faint: #6a7182; --paper: #10131b; --surface: #181c26; --line: #2a2f3c; --accent: #e0a94a; --accent-strong: #f0bd66; --accent-ink: #1b1305; --danger: #e0685c; --danger-bg: #2c1917; }
  }
  :host([data-style="editorial"][data-theme="dark"]) { --ink: #e9eaee; --ink-soft: #a7adbb; --ink-faint: #6a7182; --paper: #10131b; --surface: #181c26; --line: #2a2f3c; --accent: #e0a94a; --accent-strong: #f0bd66; --accent-ink: #1b1305; --danger: #e0685c; --danger-bg: #2c1917; }
  :host([data-style="editorial"][data-theme="light"]) { --ink: #151c2c; --ink-soft: #545b6b; --ink-faint: #8a90a0; --paper: #f4f5f7; --surface: #ffffff; --line: #dde0e6; --accent: #b8792a; --accent-strong: #96611f; --accent-ink: #fffaf1; --danger: #b23b32; --danger-bg: #fbeceb; }

  * { box-sizing: border-box; font-family: var(--font-body); }

  .fab {
    width: 52px; height: 52px; border-radius: 50%;
    background: var(--accent); color: var(--accent-ink);
    border: none; cursor: pointer;
    font-family: var(--font-display); font-weight: var(--wordmark-weight); font-size: 15px;
    box-shadow: 0 6px 20px rgba(20, 15, 5, 0.35);
  }
  .fab:hover { background: var(--accent-strong); }

  .panel {
    width: 340px; max-height: 82vh; overflow-y: auto;
    background: var(--surface); color: var(--ink);
    border: 1px solid var(--line); border-radius: 12px;
    box-shadow: 0 12px 40px rgba(15, 12, 5, 0.28);
    padding: 14px 16px 16px;
  }
  .masthead {
    display: flex; align-items: baseline; justify-content: space-between;
    padding-bottom: 10px; margin-bottom: 12px; border-bottom: 1px solid var(--line);
  }
  .wordmark { font-family: var(--font-display); font-weight: var(--wordmark-weight); font-size: 15.5px; }
  .version { font-family: var(--font-mono); font-weight: 500; font-size: 9.5px; color: var(--ink-faint); margin-left: 4px; }
  .close {
    background: none; border: none; font-size: 14px; cursor: pointer;
    color: var(--ink-soft); padding: 2px 6px; border-radius: 4px; width: auto;
  }
  .close:hover { color: var(--accent); }

  .flag {
    border-left: 3px solid var(--danger); background: var(--danger-bg); color: var(--danger);
    padding: 7px 10px; font-size: 11.5px; line-height: 1.4; border-radius: 0 4px 4px 0; margin-bottom: 12px;
  }

  .rail-heading { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
  .rail-heading::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .eyebrow {
    font-family: var(--font-display); font-weight: var(--eyebrow-weight); font-style: var(--eyebrow-style);
    text-transform: var(--eyebrow-transform); letter-spacing: var(--eyebrow-tracking);
    font-size: calc(12px + var(--eyebrow-size-adjust)); color: var(--accent-strong); white-space: nowrap;
  }

  .field { margin-bottom: 10px; }
  .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  label { font-size: 11.5px; font-weight: 600; color: var(--ink-soft); }

  input, textarea, select {
    width: 100%; padding: 7px 8px; font-size: 12px; color: var(--ink);
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--input-radius);
    resize: vertical; font-family: var(--font-body);
  }
  input:focus, textarea:focus, select:focus {
    outline: none; border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .link-btn {
    background: none; border: none; padding: 0; width: auto;
    font-size: 11px; font-weight: 600; color: var(--ink-soft); cursor: pointer;
    border-bottom: 1px solid transparent;
  }
  .link-btn:hover { color: var(--accent-strong); border-bottom-color: var(--accent-strong); }

  button { font-weight: 600; font-size: 12.5px; cursor: pointer; border-radius: var(--btn-radius); padding: 9px 14px; }
  .generate {
    width: 100%; background: var(--accent); color: var(--accent-ink); border: 1px solid var(--accent);
  }
  .generate:hover { background: var(--accent-strong); border-color: var(--accent-strong); }
  .generate:disabled { background: var(--ink-faint); border-color: var(--ink-faint); cursor: default; }

  .secondary { background: var(--surface); color: var(--ink); border: 1px solid var(--line); }
  .secondary:hover { border-color: var(--accent); color: var(--accent-strong); }
  .ghost { background: none; color: var(--ink-soft); border: 1px solid transparent; }
  .ghost:hover { color: var(--ink); background: var(--line); }

  .button-row { display: flex; gap: 8px; margin-top: 6px; }
  .button-row button { flex: 1; width: auto; }

  .hint { font-size: 11px; color: var(--ink-faint); margin: 5px 0 0; min-height: 13px; }

  .settings-row { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--line); }
  .settings-row button { width: 100%; }
`;

const PANEL_HTML = `
  <div class="masthead">
    <div class="wordmark">Outreach Copilot <span class="version"></span></div>
    <button class="close ghost" type="button" title="Close" aria-label="Close">✕</button>
  </div>
  <div class="flag" hidden role="alert"></div>

  <div class="rail-heading"><span class="eyebrow">Source material</span></div>
  <div class="field">
    <div class="row"><label>Job description</label><button class="link-btn rescan-jd" type="button">Re-scan</button></div>
    <textarea class="jd" rows="3" placeholder="Not found — open a LinkedIn job posting, or paste it here manually."></textarea>
  </div>
  <div class="field">
    <div class="row"><label>Hiring manager / recruiter</label><button class="link-btn rescan-hm" type="button">Re-scan</button></div>
    <textarea class="hm" rows="2" placeholder="Not found — open their profile or the 'Meet the hiring team' card, or paste details here."></textarea>
  </div>

  <div class="rail-heading"><span class="eyebrow">Draft</span></div>
  <div class="field">
    <label>Message type</label>
    <select class="draftType">
      <option value="connection_note">Connection request note (≤300 chars)</option>
      <option value="inmail">InMail / direct message to hiring manager</option>
      <option value="reply">Reply to the job posting (cover-note style)</option>
    </select>
  </div>
  <button class="generate" type="button">Generate draft</button>
  <p class="hint gen-status"></p>
  <div class="field subject-field" hidden>
    <label>Subject</label>
    <input type="text" class="subject" placeholder="Generated with the draft — InMail only" />
  </div>
  <div class="field">
    <label>Result</label>
    <textarea class="draft" rows="4"></textarea>
    <div class="button-row">
      <button class="ghost copy" type="button">Copy</button>
      <button class="secondary insert" type="button">Insert into LinkedIn</button>
    </div>
    <p class="hint insert-status"></p>
  </div>

  <div class="settings-row">
    <button class="ghost settings" type="button">Settings</button>
  </div>
`;

// Mirrors splitSubjectAndBody in popup.js — LinkedIn's InMail compose has a
// separate subject field, so the model is asked to prefix InMail output with
// "Subject: ..." on its own line, which this splits back out.
function splitSubjectAndBody(text) {
  const match = /^Subject:\s*(.+?)\s*\n+([\s\S]+)$/i.exec(text.trim());
  if (match) {
    return { subject: match[1].trim(), body: match[2].trim() };
  }
  return { subject: "", body: text.trim() };
}

function buildPromptsForPanel(settings, jdValue, hmValue, draftType) {
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
    `Job description:\n${jdValue || "(not provided)"}`,
    "",
    `Hiring manager / recruiter info:\n${hmValue || "(not provided)"}`
  ].join("\n");

  return { system, prompt };
}

function buildPanel() {
  if (document.getElementById(PANEL_HOST_ID)) return;

  const host = document.createElement("div");
  host.id = PANEL_HOST_ID;
  host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:999999;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = PANEL_STYLE;
  shadow.appendChild(style);

  function applyPanelTheme(themeStyle, themeMode) {
    if (themeStyle === "editorial") {
      host.setAttribute("data-style", "editorial");
    } else {
      host.removeAttribute("data-style");
    }
    if (themeMode === "light" || themeMode === "dark") {
      host.setAttribute("data-theme", themeMode);
    } else {
      host.removeAttribute("data-theme");
    }
  }

  function loadPanelTheme() {
    chrome.storage.local.get(["themeStyle", "themeMode"], (data) => {
      applyPanelTheme(data.themeStyle || "linkedin", data.themeMode || "auto");
    });
  }

  loadPanelTheme();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.themeStyle || changes.themeMode)) {
      loadPanelTheme();
    }
  });

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "fab";
  toggleBtn.type = "button";
  toggleBtn.textContent = "OC";
  toggleBtn.title = "Open Outreach Copilot";
  toggleBtn.setAttribute("aria-label", "Open Outreach Copilot");
  shadow.appendChild(toggleBtn);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.hidden = true;
  panel.innerHTML = PANEL_HTML;
  shadow.appendChild(panel);

  const els = {
    jd: panel.querySelector(".jd"),
    hm: panel.querySelector(".hm"),
    draftType: panel.querySelector(".draftType"),
    subjectField: panel.querySelector(".subject-field"),
    subject: panel.querySelector(".subject"),
    draft: panel.querySelector(".draft"),
    genStatus: panel.querySelector(".gen-status"),
    insertStatus: panel.querySelector(".insert-status"),
    errorBanner: panel.querySelector(".flag"),
    version: panel.querySelector(".version"),
    generateBtn: panel.querySelector(".generate")
  };

  els.version.textContent = "v" + chrome.runtime.getManifest().version;

  function updateSubjectVisibility() {
    els.subjectField.hidden = els.draftType.value !== "inmail";
  }
  els.draftType.addEventListener("change", updateSubjectVisibility);
  updateSubjectVisibility();

  function showError(message) {
    els.errorBanner.textContent = message;
    els.errorBanner.hidden = false;
  }
  function clearError() {
    els.errorBanner.hidden = true;
    els.errorBanner.textContent = "";
  }
  // Chrome throws this exact message when the extension was reloaded/updated
  // while this panel's JS was already running on the page — it's now
  // disconnected from the new background script and needs a page refresh.
  function friendlyError(err) {
    const message = err && err.message ? err.message : String(err);
    if (/Extension context invalidated/i.test(message)) {
      return "This extension was just updated or reloaded. Refresh this LinkedIn page, then try again.";
    }
    return message;
  }

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

  function rescanJd() {
    const jd = extractJobDescription();
    if (!jd.found) throw new Error("No job description found on this page.");
    const header = [jd.title, jd.company].filter(Boolean).join(" @ ");
    els.jd.value = (header ? header + "\n\n" : "") + jd.description;
  }

  function rescanHm() {
    const hm = extractHiringManager();
    if (!hm.found) throw new Error("No hiring-manager info found on this page.");
    els.hm.value = [hm.name, hm.profileUrl, hm.details].filter(Boolean).join("\n");
  }

  async function generateDraft() {
    const settings = await new Promise((resolve) =>
      chrome.storage.local.get(["apiKey", "model", "name", "background", "samples", "tone", "notes"], resolve)
    );
    if (!settings.apiKey) throw new Error("Add your OpenAI API key in Settings (⚙) first.");

    els.generateBtn.disabled = true;
    els.genStatus.textContent = "Generating…";
    els.draft.value = "";
    els.subject.value = "";

    const { system, prompt } = buildPromptsForPanel(settings, els.jd.value, els.hm.value, els.draftType.value);

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
      if (!response) throw new Error("No response from the background script.");
      if (!response.ok) throw new Error(response.error || "Draft generation failed.");
      const { subject, body } = splitSubjectAndBody(response.text);
      els.draft.value = body;
      els.subject.value = subject;
    } finally {
      els.generateBtn.disabled = false;
      els.genStatus.textContent = "";
    }
  }

  async function copyDraft() {
    if (!els.draft.value.trim()) throw new Error("Nothing to copy yet — generate a draft first.");
    const text = els.subject.value.trim()
      ? `Subject: ${els.subject.value.trim()}\n\n${els.draft.value}`
      : els.draft.value;
    await navigator.clipboard.writeText(text);
    els.insertStatus.textContent = "Copied to clipboard.";
  }

  function insertDraftFromPanel() {
    if (!els.draft.value.trim()) throw new Error("Generate a draft first.");
    const result = insertDraft(els.draft.value, els.subject.value);
    if (!result.inserted) {
      throw new Error("No open message box found on this page — open LinkedIn's message/connection dialog first.");
    }
    const subjectNote = result.subjectInserted ? " (subject included)" : "";
    els.insertStatus.textContent = `Inserted into the ${result.target}${subjectNote}.`;
  }

  panel.querySelector(".rescan-jd").addEventListener("click", withErrorHandling(rescanJd));
  panel.querySelector(".rescan-hm").addEventListener("click", withErrorHandling(rescanHm));
  panel.querySelector(".generate").addEventListener("click", withErrorHandling(generateDraft));
  panel.querySelector(".copy").addEventListener("click", withErrorHandling(copyDraft));
  panel.querySelector(".insert").addEventListener("click", withErrorHandling(insertDraftFromPanel));
  panel.querySelector(".settings").addEventListener("click", withErrorHandling(async () => {
    chrome.runtime.openOptionsPage();
  }));
  panel.querySelector(".close").addEventListener("click", () => {
    panel.hidden = true;
    toggleBtn.hidden = false;
  });

  toggleBtn.addEventListener("click", withErrorHandling(async () => {
    panel.hidden = false;
    toggleBtn.hidden = true;

    if (!els.jd.value.trim() || !els.hm.value.trim()) {
      const stored = await new Promise((resolve) =>
        chrome.storage.local.get(["capturedJD", "capturedHM"], resolve)
      );
      if (!els.jd.value.trim() && stored.capturedJD) els.jd.value = stored.capturedJD;
      if (!els.hm.value.trim() && stored.capturedHM) els.hm.value = stored.capturedHM;
    }

    try {
      rescanJd();
    } catch (e) {
      // Fine — fields may already be populated from storage above.
    }
    try {
      rescanHm();
    } catch (e) {
      // Fine — fields may already be populated from storage above.
    }
  }));
}

buildPanel();

} // end __liCopilotInjected guard
