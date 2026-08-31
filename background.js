// ===== Discord Translator — background service worker =====
// Acts as the API bridge: content script / popup send {type:"translate"} messages here.
// Provider: Google Translate public endpoint (same as the reference extension) —
// fast, free, no API key, no cold starts.

const GOOGLE_URL = "https://translate.googleapis.com/translate_a/single";
const SUPPORTED_LANGS = ["en", "es", "fr", "de", "pt", "it", "ru", "ja", "ko", "zh"];

async function translateText(text, targetLang, timeoutSec = 10) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutSec) * 1000);
  try {
    const url =
      `${GOOGLE_URL}?client=gtx&sl=auto&dt=t` +
      `&tl=${encodeURIComponent(targetLang)}&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ok: false, reason: "api", status: response.status };

    const data = await response.json();
    // Response format: [[ [translated, original, ...], [..], ... ], ...]
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const out = data[0].map((seg) => (seg && seg[0]) || "").join("");
      return { ok: true, text: out };
    }
    return { ok: false, reason: "api", detail: data };
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, reason: "timeout" };
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- warmup: pre-hit every language so the first real use is instant ----------
const warmed = new Set();
async function warmUpLanguages() {
  for (const lang of SUPPORTED_LANGS) {
    if (lang === "en" || warmed.has(lang)) continue;
    warmed.add(lang);
    translateText("Hello", lang, 8).catch(() => warmed.delete(lang)); // allow retry
  }
}
chrome.runtime.onStartup.addListener(warmUpLanguages);
chrome.runtime.onInstalled.addListener(warmUpLanguages);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "translate") {
    translateText(msg.text, msg.target, msg.timeoutSec)
      .then(sendResponse)
      .catch((err) => {
        console.error("Fetch failed:", err);
        sendResponse({ ok: false, reason: "network" });
      });
    return true; // keep the message channel open for the async response
  }
  if (msg && msg.type === "warmup") {
    warmUpLanguages();
    // no response needed
  }
});


