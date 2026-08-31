// ===== Discord Translator — popup settings UI =====

let settings = { ...DEFAULT_SETTINGS };

const $ = (id) => document.getElementById(id);

function applyTheme() {
  let dark;
  if (settings.theme === "system") {
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } else {
    dark = settings.theme === "dark";
  }
  document.body.classList.toggle("dark", dark);
  document.getElementById("themeIconSun").hidden = dark;
  document.getElementById("themeIconMoon").hidden = !dark;
}

function applyBranding() {
  let version = "";
  try { version = chrome.runtime.getManifest().version || ""; } catch (e) { /* noop */ }
  const el = document.getElementById("dtVersion");
  if (el && version) el.textContent = version;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = dtT(settings.uiLang, el.dataset.i18n);
  });
  $("symbolError").textContent = dtT(settings.uiLang, "symbolError");
}

function flashSaved(key) {
  const el = document.querySelector(`[data-saved-for="${key}"]`);
  if (!el) return;
  el.textContent = dtT(settings.uiLang, "saved");
  el.classList.add("visible");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("visible"), 1500);
}

async function save(patch) {
  Object.assign(settings, patch);
  await chrome.storage.sync.set(patch);
  for (const k of Object.keys(patch)) flashSaved(k);
}

// ----- Custom dropdown component (two-sided: native left, english gray right) -----
function buildDropdown(rowEl, { options, valueKey, onSelect }) {
  // options: [{ value, left, right }]
  const wrap = document.createElement("div");
  wrap.className = "dt-dd-wrap";
  const btn = document.createElement("div");
  btn.className = "dt-select";
  btn.innerHTML = `<span class="dt-val"></span><span class="dt-chev">▼</span>`;
  const list = document.createElement("div");
  list.className = "dt-dd";
  list.hidden = true;

  const valSpan = btn.querySelector(".dt-val");
  const selected = options.find((o) => o.value === valueKey);
  valSpan.textContent = selected ? selected.left : options[0].left;

  options.forEach((o) => {
    const item = document.createElement("div");
    item.className = "dt-dd-item" + (o.value === valueKey ? " selected" : "");
    item.innerHTML = `<span>${o.left}</span><span class="dt-dd-en">${o.right}</span>`;
    item.addEventListener("click", () => {
      valSpan.textContent = o.left;
      list.hidden = true;
      list.querySelectorAll(".dt-dd-item").forEach((i) => i.classList.remove("selected"));
      item.classList.add("selected");
      onSelect(o.value);
    });
    list.appendChild(item);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".dt-dd").forEach((d) => { if (d !== list) d.hidden = true; });
    list.hidden = !list.hidden;
  });
  document.addEventListener("click", () => { list.hidden = true; });

  wrap.appendChild(btn);
  wrap.appendChild(list);
  rowEl.appendChild(wrap);
}

function langOptions({ withAuto = false, uiLang }) {
  const opts = [];
  if (withAuto) {
    opts.push({
      value: "auto",
      left: dtT(uiLang, "auto"),
      right: dtT(uiLang, "system")
    });
  }
  for (const l of LANGUAGES) opts.push({ value: l.code, left: l.native, right: l.english });
  return opts;
}

function modifierOptions() {
  return MODIFIERS.map((m) => ({
    value: m,
    left: m === "none" ? dtT(settings.uiLang, "none") : m.split("+").map((p) => p[0].toUpperCase() + p.slice(1)).join("+"),
    right: m === "none" ? "off" : m + "+enter"
  }));
}

// ----- init -----
async function init() {
  settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(DEFAULT_SETTINGS)) };
  applyTheme();
  applyBranding();
  applyI18n();

  $("msgTranslateBtn").checked = settings.msgTranslateBtn;
  $("inputTranslateBtn").checked = settings.inputTranslateBtn;
  $("symbolInput").value = settings.symbol;
  $("timeoutInput").value = settings.timeoutSec;

  $("msgTranslateBtn").addEventListener("change", (e) => save({ msgTranslateBtn: e.target.checked }));
  $("inputTranslateBtn").addEventListener("change", (e) => save({ inputTranslateBtn: e.target.checked }));

  $("timeoutInput").addEventListener("change", (e) => {
    let v = parseInt(e.target.value, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > 120) v = 120;
    e.target.value = v;
    save({ timeoutSec: v });
  });

  $("symbolInput").addEventListener("input", (e) => {
    const v = e.target.value;
    const valid = v.length === 1 && !/[a-zA-Z0-9]/.test(v);
    $("symbolError").hidden = valid;
    if (valid) save({ symbol: v });
  });

  $("themeToggle").addEventListener("click", () => {
    const current = settings.theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : settings.theme;
    save({ theme: current === "dark" ? "light" : "dark" }).then(applyTheme);
  });

  buildDropdown($("nativeLangRow"), {
    options: langOptions({ uiLang: settings.uiLang }),
    valueKey: settings.nativeLang,
    onSelect: (v) => save({ nativeLang: v })
  });
  buildDropdown($("targetLangRow"), {
    options: langOptions({ uiLang: settings.uiLang }),
    valueKey: settings.targetLang,
    onSelect: (v) => save({ targetLang: v })
  });
  buildDropdown($("uiLangRow"), {
    options: langOptions({ withAuto: true, uiLang: settings.uiLang }),
    valueKey: settings.uiLang,
    onSelect: (v) => save({ uiLang: v }).then(applyI18n)
  });
  buildDropdown($("modifierRow"), {
    options: modifierOptions(),
    valueKey: settings.inputModifier,
    onSelect: (v) => save({ inputModifier: v })
  });
}

init();

