# LinkedIn Job & Outreach Copilot

A Chrome extension that pulls the job description and hiring-manager info off a
LinkedIn job posting, then drafts a connection note / InMail / cover-note reply
in your own writing style, using OpenAI.

## Install (unpacked)

1. Go to `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked**, select this folder.
3. Click the extension icon → the gear (⚙) to open **Settings**:
   - Paste your OpenAI API key (get one at platform.openai.com/api-keys).
   - Optionally change the model (defaults to `gpt-4o`).
   - Fill in your background summary, 3-5 sample messages you've written before, tone, and any style notes.
   - Save.
4. If you had a LinkedIn tab already open before installing/reloading the
   extension, **refresh that tab once** — content scripts only auto-inject into
   tabs opened after the extension loads.

## Use it

There are two ways to use it — pick whichever's more convenient:

**On the page itself** (no popup needed): a round **"LC"** button floats at
the bottom-right of every LinkedIn page. Click it to open the full panel —
job description, hiring-manager info, draft type, Generate, Copy, and Insert —
right there on the page. It auto-scans the page when opened; use its own
**Re-scan** buttons to refresh either field.

**Via the toolbar popup**: a quick **"Capture job for Copilot"** button also
appears right above "About the job" for a fast grab. Then click the extension
icon in the toolbar — it loads whatever was captured, with the same
Re-scan / Generate / Copy / Insert controls.

Either way, the flow is:
1. Make sure the job description (and hiring-manager info, if shown) is populated.
2. Pick a draft type: connection note, InMail, or job-reply cover note.
3. Click **Generate draft**.
4. Click **Insert into LinkedIn** while the relevant message/connection-note box
   is open on the page, or **Copy** to paste it yourself.

## Notes

- Your API key and style samples are stored only in local browser storage
  (`chrome.storage.local`) — never synced or sent anywhere except
  `api.openai.com`. Never paste your API key into a chat window (with Claude,
  ChatGPT, or anyone else) or commit it to a file — treat it like a password,
  and rotate it immediately if it's ever been exposed.
- LinkedIn's DOM changes frequently and its class names are obfuscated, so
  auto-extraction and auto-insert are best-effort. If a selector stops working,
  use the manual paste/copy fallback in the popup — the workflow always works
  even when scraping doesn't.
- There is no official LinkedIn messaging API; the "Insert into LinkedIn"
  button works by finding the message/connection-note box already open in the
  page and typing into it, the same as a user would.
- The popup, Settings page, and on-page panel share one visual system:
  Fraunces (serif, section labels/wordmark) + Public Sans (UI text) + IBM
  Plex Mono (version tag), a warm brass accent, and light/dark palettes that
  follow your OS theme. Font files live in `fonts/` and are loaded locally —
  no external requests at runtime.
