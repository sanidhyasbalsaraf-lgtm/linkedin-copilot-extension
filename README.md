# Outreach Copilot for LinkedIn

*Independent tool — not affiliated with, endorsed by, or sponsored by LinkedIn
Corporation.*

A Chrome extension that pulls the job description and hiring-manager info off a
LinkedIn job posting, then drafts a connection note / InMail / cover-note reply
in your own writing style, using OpenAI (bring your own API key — see Notes).

## Install (unpacked)

1. Go to `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked**, select this folder.
3. A **welcome tab opens automatically** on first install — a 4-step
   walkthrough (your name → OpenAI key → your writing voice → appearance)
   that saves straight into the same settings Settings page uses.
   - Your **name is required** on step 1 (Next stays disabled until you type
     something) — it's used to sign off drafts, so there's no skipping it.
   - Steps 2–3 have their own **Skip this step** button if you'd rather fill
     them in later from Settings.
   - The **dots at the bottom** show progress and are clickable — jump to any
     step directly (you'll be bounced back to step 1 if you try to jump ahead
     without a name yet).
   - **Skip for now** (top-right) exits the whole walkthrough at any point.
   - Missed it, or want to see it again? Open Settings (the gear icon in the
     popup) and click **How it works** in the top-right.
4. If you had a LinkedIn tab already open before installing/reloading the
   extension, **refresh that tab once** — content scripts only auto-inject into
   tabs opened after the extension loads.

## Use it

There are two ways to use it — pick whichever's more convenient:

**On the page itself** (no popup needed): a round **"OC"** button floats at
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
3. Click **Generate draft**. For **InMail**, a **Subject** field appears above
   the draft and is filled in alongside it — connection notes and replies
   don't get one, since LinkedIn doesn't show a subject box for those.
4. Click **Insert into LinkedIn** while the relevant message/connection-note box
   is open on the page — this fills the subject field too if one is present —
   or **Copy** to paste it yourself (the subject is included on its own line
   when there is one).

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
- **Appearance is customizable.** In Settings > Appearance, choose a **Look**
  ("LinkedIn" — blue/white, pill buttons, matches LinkedIn's own palette; or
  "Editorial" — the original serif + brass design) and a **Mode** (match
  system / light / dark). Changes apply instantly across the popup, Settings
  page, and the on-page panel — they all read the same saved preference and
  update live via `chrome.storage.onChanged`. "LinkedIn" is the default look.
- Font files live in `fonts/` and are loaded locally — no external requests
  at runtime, in either look.
- The toolbar icon and `chrome://extensions` card use a generated "OC"
  monogram (`icons/`) instead of Chrome's default puzzle-piece placeholder.
- **Requires your own OpenAI API key** (Settings > Connection). Usage is
  billed directly to your OpenAI account at OpenAI's rates — the extension
  itself is free and never bundles, proxies, or shares a key.
- **Your name** (set during onboarding or in Settings > Candidate profile) is
  passed to the model so it can sign off InMails and cover-note replies with
  it — connection notes stay unsigned since they're too short for one.
- **"Extension context invalidated" / "was just updated or reloaded"**: this
  happens if a popup, the panel, or a Settings/onboarding tab was already open
  from *before* the extension got reloaded in `chrome://extensions` (which
  happens every time you update the code). It's not a bug in the logic — just
  close and reopen whichever surface showed the message (or refresh the
  LinkedIn tab for the on-page panel) and it'll reconnect to the new version.
