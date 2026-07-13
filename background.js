// Service worker: the only place that talks to the OpenAI API, so the key
// never has to be threaded through the popup/content scripts' fetches directly.

const DEFAULT_MODEL = "gpt-4o";

async function callOpenAI({ apiKey, model, system, prompt }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 800,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data && data.error ? data.error.message : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return (data.choices[0].message.content || "").trim();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "GENERATE_DRAFT") return false;

  callOpenAI(msg.payload)
    .then((text) => sendResponse({ ok: true, text }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true; // keep the message channel open for the async response
});

// Show the guided walkthrough on a fresh install only — not on updates, so
// existing users don't see it again when the version bumps.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});
