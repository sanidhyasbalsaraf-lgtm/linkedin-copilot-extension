# Publishing checklist

Everything in this repo is ready to submit. These steps have to be done by
you directly — account creation, payment, and clicking "Submit" can't be done
on your behalf.

## 1. Turn on GitHub Pages (hosts the privacy policy)

1. Go to the repo on GitHub → **Settings** → **Pages**.
2. Under "Build and deployment," set **Source** to "Deploy from a branch."
3. Branch: **master**, folder: **/ (root)**. Save.
4. Wait a minute, then confirm
   `https://sanidhyasbalsaraf-lgtm.github.io/linkedin-copilot-extension/privacy-policy.html`
   loads. That's the URL for the "Privacy policy" field in Web Store setup.

## 2. Build the upload package

From the extension folder, zip everything except `.git`, `.gitignore`, and
docs that aren't part of the runtime (`dist/`, `*.md`, `LICENSE` are fine to
include or exclude — the Web Store only cares about the manifest and the
files it references). A ready-made build step:

```powershell
cd "F:\Claude AI\test\linkedin-copilot-extension"
Compress-Archive -Path manifest.json,background.js,content.js,popup.html,popup.js,popup.css,options.html,options.js,options.css,onboarding.html,onboarding.js,onboarding.css,theme.js,tokens.css,icons,fonts -DestinationPath dist\outreach-copilot-for-linkedin-v1.6.0.zip -Force
```

## 3. Chrome Web Store Developer account

1. Go to https://chrome.google.com/webstore/devconsole.
2. Sign in, pay the one-time $5 registration fee if you haven't already.

## 4. Create the listing

1. **New item** → upload `dist/outreach-copilot-for-linkedin-v1.6.0.zip`.
2. Fill in the **Store listing** tab using `STORE_LISTING.md` verbatim:
   title, summary, full description, category (Productivity).
3. Add the screenshots (see below).
4. Paste the **Privacy policy URL** from step 1.
5. Set **Support URL** to the GitHub Issues link in `STORE_LISTING.md`.

## 5. Screenshots (take these once you've reloaded the extension)

Required: at least 1, up to 5. Size **1280×800** or **640×400**, PNG or JPEG,
no transparency. Suggested three, in order:

1. Open a real LinkedIn job posting, click **Capture for Copilot**, open the
   popup, generate a draft — screenshot the popup with a filled-in job
   description and generated draft.
2. Click the **"OC"** button on the same job posting to open the on-page
   panel — screenshot it open over the LinkedIn page.
3. Screenshot the onboarding wizard (reopen it anytime via Settings → "How it
   works").

Crop/resize to the required dimensions before uploading (any image editor,
or Windows' built-in Photos app crop tool).

## 6. Privacy Practices tab

Use the disclosure answers in `STORE_LISTING.md`'s "Data-use disclosures"
section — check only **Website content** and **Authentication information**,
affirm the three certifications (core functionality only / not sold / not
used for credit decisions).

## 7. Permissions justification

When the dashboard asks why each permission/host permission is needed, paste
the matching paragraph from `STORE_LISTING.md`'s "Per-permission
justifications" section.

## 8. Visibility and submit

Set visibility to **Public** (per your earlier decision), review everything
once more, then **Submit for review**. Google's review typically takes
anywhere from a few hours to a few days. If it comes back with requested
changes, they're almost always about the listing text/screenshots, not the
code — re-read the rejection reason carefully before changing anything.

## After it's live

- The install link Google gives you is what you'd share with "anyone."
- Future code updates: bump `version` in `manifest.json`, rebuild the zip,
  and upload a new package version from the same dashboard listing — no need
  to create a new listing each time.
