// ===== Discord Translator — content script (runs inside discord.com) =====
// Handles: message translate buttons, input bar button, symbol picker, toasts.

let settings = { ...DEFAULT_SETTINGS };
let uiLang = "en";
const translationCache = new Map(); // messageId+lang -> translated text

// ---------- settings ----------
async function loadSettings() {
  settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(DEFAULT_SETTINGS)) };
  uiLang = dtResolveUiLang(settings.uiLang);
}
loadSettings();
chrome.storage.onChanged.addListener(() => loadSettings());

// Ask the background worker to pre-warm all languages when Discord loads
try { chrome.runtime.sendMessage({ type: "warmup" }); } catch (e) { /* SW not ready yet — it warms on startup anyway */ }

const t = (key, vars) => dtT(settings.uiLang, key, vars);

// ---------- toast ----------
function showToast(message, type = "info") {
  document.querySelectorAll(".dt-toast").forEach((el) => el.remove());
  const toast = document.createElement("div");
  toast.className = `dt-toast dt-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("dt-toast-out");
    setTimeout(() => toast.remove(), 350);
  }, 2500);
}

// ---------- helpers ----------
function translateViaBackground(text, target) {
  // Hard client-side deadline (timeout setting + 3s grace) so the loading UI
  // can NEVER hang forever, even if the service worker dies mid-request.
  const budgetMs = Math.max(1, settings.timeoutSec + 3) * 1000;
  return Promise.race([
    chrome.runtime.sendMessage({
      type: "translate",
      text,
      target,
      timeoutSec: settings.timeoutSec
    }),
    new Promise((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: "timeout" }), budgetMs)
    )
  ]);
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------- 1. message translate button ----------
// Discord renders messages as <li> items inside [data-list-id="chat-messages"];
// each message is [role="article"][aria-labelledby] where the labelled id is
// the message content element (message-content-<id>).
const CHAT_LIST = '[data-list-id="chat-messages"]';

const msgObserver = new MutationObserver(debounce(() => {
  // Isolate: a throw in one task must not prevent the other from running
  try { ensureMessageButtons(); } catch (e) { console.error("dt msg:", e); }
  try { ensureInputBarInjection(); } catch (e) { console.error("dt input:", e); }
}, 120));
msgObserver.observe(document.body, { childList: true, subtree: true });

// Safety net: the observer can miss events while React churns; re-assert the
// input button periodically so it can never silently disappear.
setInterval(() => {
  try { ensureInputBarInjection(); } catch (e) { /* ignore */ }
}, 400);

function ensureMessageButtons() {
  if (!settings.msgTranslateBtn) return;
  const articles = document.querySelectorAll(CHAT_LIST + ' [role="article"][aria-labelledby]');
  for (const article of articles) {
    if (article.parentElement?.closest('[role="article"]')) continue; // nested/quoted
    const labelledId = (article.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .find((id) => /^message-content-\d+$/.test(id));
    if (!labelledId) continue;
    const content = document.getElementById(labelledId);
    if (!content || content.querySelector(".dt-msg-btn")) continue;

    const btn = document.createElement("button");
    btn.className = "dt-msg-btn";
    btn.title = t("targetLang") + ": " + dtGetLangEntry(settings.targetLang).english;
    btn.innerHTML = ICON_TRANSLATE;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleMsgTranslate(content, btn, labelledId);
    });

    // Inline right after the message text
    content.appendChild(btn);
  }
}

async function handleMsgTranslate(content, btn, msgId) {
  const cacheKey = msgId + ":" + settings.targetLang;

  // Toggle off if a translation is currently shown
  const existing = content.parentElement.querySelector(".dt-msg-translation");
  if (existing) {
    existing.remove();
    btn.classList.remove("dt-active");
    return;
  }

  btn.classList.add("dt-loading");

  let translated = translationCache.get(cacheKey);
  if (!translated) {
    const text = extractMessageText(content);
    if (!text) {
      btn.classList.remove("dt-loading");
      showToast(t("nothingToTranslate"), "info");
      return;
    }
    const res = await translateViaBackground(text, settings.targetLang);
    btn.classList.remove("dt-loading");
    if (!res || !res.ok) {
      if (res && res.reason === "loading") showToast(t("modelLoading"), "error");
      else if (res && res.reason === "timeout") showToast(t("timeoutError", { s: settings.timeoutSec }), "error");
      else showToast(t("translateFailed"), "error");
      return;
    }
    translated = res.text;
    translationCache.set(cacheKey, translated);
  } else {
    btn.classList.remove("dt-loading");
  }

  // Re-check it wasn't toggled while fetching
  if (content.parentElement.querySelector(".dt-msg-translation")) return;

  const line = document.createElement("div");
  line.className = "dt-msg-translation";
  line.innerHTML = `<span class="dt-msg-text"></span> <span class="dt-msg-src"></span>`;
  line.querySelector(".dt-msg-text").textContent = translated;
  line.querySelector(".dt-msg-src").textContent = `(${t("translationLabel")})`;
  content.parentElement.appendChild(line);
  btn.classList.add("dt-active");
}

// ---------- 2. input bar button + blur pill + Slate-safe text replace ----------
function getInputArea() {
  return document.querySelector('div[class*="channelTextArea"]');
}

function getInputTextbox() {
  return document.querySelector('div[class*="channelTextArea"] div[role="textbox"]');
}

// The input button lives on document.body as a FIXED overlay anchored next to
// the input bar. We must NOT inject it into Discord's buttons row: React
// reconciles that container and chokes on foreign nodes, which crashes the
// editor (the "backspace/enter stops working" bug).
let inputBtn = null;

function ensureInputBarInjection() {
  const area = getInputArea();

  if (!settings.inputTranslateBtn || !area) {
    if (inputBtn) inputBtn.style.display = "none";
    return;
  }

  if (!inputBtn || !inputBtn.isConnected) {
    inputBtn = document.createElement("button");
    inputBtn.className = "dt-input-btn";
    inputBtn.title = t("targetLang") + ": " + dtGetLangEntry(settings.targetLang).english;
    inputBtn.innerHTML = ICON_TRANSLATE;
    inputBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleInputTranslate();
    });
    document.body.appendChild(inputBtn);
  }
  inputBtn.style.display = "";
  positionInputBtn(area);
}

function positionInputBtn(area) {
  if (!inputBtn) return;
  const rect = area.getBoundingClientRect();
  // Sit just left of Discord's button cluster (gift/sticker/emoji), which
  // occupies the right side of the input bar.
  const size = inputBtn.offsetWidth || 32;
  inputBtn.style.left = Math.round(rect.right - 220) + "px";
  inputBtn.style.top = Math.round(rect.top + rect.height / 2 - size / 2) + "px";
}
window.addEventListener("resize", () => { const a = getInputArea(); if (a) positionInputBtn(a); });
window.addEventListener("scroll", () => { const a = getInputArea(); if (a) positionInputBtn(a); }, true);

function showBlurPill() {
  removeBlurPill(); // safety
  const area = getInputArea();
  if (!area) return null;
  // Attach to <body> as a fixed overlay (NOT inside Discord's input DOM —
  // injecting there disturbs Slate's re-renders and breaks editing)
  const pill = document.createElement("div");
  pill.className = "dt-blur-pill";
  pill.innerHTML = `<div class="dt-spinner"></div>`;
  document.body.appendChild(pill);
  positionBlurPill(pill, area);
  requestAnimationFrame(() => pill.classList.add("dt-visible"));
  return pill;
}

function positionBlurPill(pill, area) {
  const rect = area.getBoundingClientRect();
  pill.style.top = rect.top + "px";
  pill.style.left = rect.left + "px";
  pill.style.width = rect.width + "px";
  pill.style.height = rect.height + "px";
}

function removeBlurPill() {
  const pill = document.querySelector(".dt-blur-pill");
  if (pill) {
    pill.classList.remove("dt-visible");
    setTimeout(() => pill.remove(), 220);
  }
}

async function handleInputTranslate() {
  const area = getInputArea();
  const textbox = getInputTextbox();
  if (!area || !textbox) return;

  const text = textbox.textContent.trim();
  const target = settings.targetLang;

  if (!text) {
    showToast(t("nothingToTranslate"), "info");
    return;
  }

  const pill = showBlurPill();
  const res = await translateViaBackground(text, target);
  removeBlurPill();

  if (!res || !res.ok) {
    if (res && res.reason === "loading") showToast(t("modelLoading"), "error");
    else if (res && res.reason === "timeout") showToast(t("timeoutError", { s: settings.timeoutSec }), "error");
    else showToast(t("translateFailed"), "error");
    return;
  }

  replaceTextboxText(textbox, res.text);
}

// Extract clean message text: strips our own injected elements, the "(edited)"
// tag, timestamp/accessibility noise, and hidden elements.
function extractMessageText(content) {
  const clone = content.cloneNode(true);
  clone
    .querySelectorAll(
      '.dt-msg-btn, .dt-msg-translation, time, [class*="edited"], [aria-hidden="true"], [class*="timestamp"]'
    )
    .forEach((el) => el.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

// Slate.js-safe replace: simulate a real paste. Discord handles paste events
// natively, which keeps its editor state in sync (execCommand insertText can
// desync Slate and freeze typing).
function replaceTextboxText(textbox, newText) {
  textbox.focus();
  const range = document.createRange();
  range.selectNodeContents(textbox);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", newText);
    const evt = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    textbox.dispatchEvent(evt);
    // If nothing was pasted (event not handled), fall back to execCommand
    if (textbox.textContent.trim() === "" && newText.trim() !== "") {
      document.execCommand("insertText", false, newText);
    }
  } catch (e) {
    document.execCommand("insertText", false, newText);
  }
}

// ---------- 3. symbol picker ($es -> language) ----------
let pickerEl = null;

function getSymbolToken(textbox) {
  // Matches symbol + up to 2 word chars immediately before the caret
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;

  const pre = range.cloneRange();
  pre.selectNodeContents(textbox);
  pre.setEnd(range.endContainer, range.endOffset);
  const textBefore = pre.toString();

  const sym = settings.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = textBefore.match(new RegExp(sym + "([A-Za-z]{0,2})$"));
  if (!m) return null;
  return { query: m[1].toLowerCase(), tokenLength: m[0].length };
}

function findLanguages(query) {
  if (!query) return LANGUAGES.slice(0, 8);
  const exact = LANGUAGES.filter((l) => l.code === query || l.abbrs.includes(query));
  const fuzzy = LANGUAGES.filter(
    (l) => !exact.includes(l) &&
      (l.code.startsWith(query) || l.abbrs.some((a) => a.startsWith(query)) ||
       l.english.toLowerCase().startsWith(query))
  );
  return [...exact, ...fuzzy].slice(0, 8);
}

function showPicker(textbox, token) {
  // Don't rebuild if the query hasn't changed (rebuilding on every keystroke
  // mutates DOM and can disturb Slate's caret handling)
  if (pickerEl && pickerEl.dataset.token === token.query) return;
  hidePicker();

  const matches = findLanguages(token.query);
  pickerEl = document.createElement("div");
  pickerEl.className = "dt-picker";
  pickerEl.dataset.token = token.query;

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "dt-picker-empty";
    empty.textContent = t("noLangFound");
    pickerEl.appendChild(empty);
  } else {
    matches.forEach((lang, i) => {
      const item = document.createElement("div");
      item.className = "dt-picker-item" + (i === 0 ? " dt-top" : "");
      item.innerHTML = `<span class="dt-picker-code"></span><span class="dt-picker-name"></span>`;
      item.querySelector(".dt-picker-code").textContent = lang.abbrs[0];
      item.querySelector(".dt-picker-name").textContent = lang.native;
      item.addEventListener("click", () => selectPickerLanguage(textbox, lang, token));
      pickerEl.appendChild(item);
    });
    const hint = document.createElement("div");
    hint.className = "dt-picker-hint";
    hint.textContent = t("enterToSend");
    pickerEl.appendChild(hint);
  }

  // Attach to <body> (NOT inside Discord's input DOM — injecting there
  // disturbs Slate's re-renders). Position fixed, just above the input bar.
  document.body.appendChild(pickerEl);
  const areaRect = (getInputArea() || textbox).getBoundingClientRect();
  pickerEl.style.left = areaRect.left + 8 + "px";
  pickerEl.style.bottom = window.innerHeight - areaRect.top + 6 + "px";
  pickerEl.style.top = "auto";
  if (pickerEl.getBoundingClientRect().left + pickerEl.offsetWidth > window.innerWidth) {
    pickerEl.style.left = window.innerWidth - pickerEl.offsetWidth - 8 + "px";
  }
}

function hidePicker() {
  if (pickerEl) {
    pickerEl.remove();
    pickerEl = null;
  }
}

function selectPickerLanguage(textbox, lang, token) {
  // Delete only the symbol token (symbol + typed chars), keeping the rest
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const range = sel.getRangeAt(0);
    const node = range.endContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const end = range.endOffset;
      const start = Math.max(0, end - token.tokenLength);
      const delRange = document.createRange();
      delRange.setStart(node, start);
      delRange.setEnd(node, end);
      sel.removeAllRanges();
      sel.addRange(delRange);
      document.execCommand("delete");
    }
  }
  hidePicker();
  saveSetting("targetLang", lang.code);
  showToast(t("targetSet", { lang: lang.native }), "success");
}

async function saveSetting(key, value) {
  settings[key] = value;
  await chrome.storage.sync.set({ [key]: value });
}

// ---------- 4. input key listeners (picker + modifier keybind) ----------
document.addEventListener("selectionchange", debounce(() => {
  const textbox = getInputTextbox();
  if (!textbox || document.activeElement !== textbox) return hidePicker();
  const token = getSymbolToken(textbox);
  if (token) showPicker(textbox, token);
  else hidePicker();
}, 80));

document.addEventListener("keydown", (e) => {
  const textbox = getInputTextbox();
  if (!textbox) return;
  const isTextInputKey = document.activeElement === textbox;

  // Picker navigation
  if (pickerEl && isTextInputKey) {
    if (e.key === "Escape") {
      hidePicker();
      e.stopPropagation();
      return;
    }
    if ((e.key === "Tab" || e.key === "Enter") && !pickerEl.querySelector(".dt-picker-empty")) {
      e.preventDefault();
      e.stopPropagation();
      const top = pickerEl.querySelector(".dt-picker-item");
      if (top) {
        const token = getSymbolToken(textbox);
        const code = top.querySelector(".dt-picker-code").textContent;
        const lang = LANGUAGES.find((l) => l.abbrs[0] === code);
        if (lang && token) selectPickerLanguage(textbox, lang, token);
      }
      return;
    }
  }

  // Modifier keybind (e.g. ctrl+enter)
  const mod = settings.inputModifier;
  if (mod === "none" || !isTextInputKey || e.key !== "Enter") return;
  const parts = mod.split("+");
  const modsOk = parts.every((m) => {
    if (m === "ctrl") return e.ctrlKey;
    if (m === "alt") return e.altKey;
    if (m === "shift") return e.shiftKey;
    return false;
  });
  if (!modsOk) return;
  // require exactly the configured modifiers, no extras
  if (parts.includes("ctrl") !== e.ctrlKey) return;
  if (parts.includes("alt") !== e.altKey) return;
  if (parts.includes("shift") !== e.shiftKey) return;
  e.preventDefault();
  e.stopPropagation();
  handleInputTranslate();
}, true);

// ---------- icons ----------
const ICON_TRANSLATE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
</svg>`;




