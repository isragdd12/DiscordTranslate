// ===== Discord Translator — shared language data & UI strings =====
// Used by both the popup (settings UI) and the Discord content script.

const LANGUAGES = [
  { code: "en", native: "English",  english: "English",  abbrs: ["en", "eng"] },
  { code: "es", native: "Español",  english: "Spanish",  abbrs: ["es", "sp"] },
  { code: "fr", native: "Français", english: "French",   abbrs: ["fr"] },
  { code: "de", native: "Deutsch",  english: "German",   abbrs: ["de"] },
  { code: "pt", native: "Português",english: "Portuguese",abbrs: ["pt", "br"] },
  { code: "it", native: "Italiano", english: "Italian",  abbrs: ["it"] },
  { code: "ru", native: "Русский",  english: "Russian",  abbrs: ["ru"] },
  { code: "ja", native: "日本語",    english: "Japanese", abbrs: ["ja", "jp"] },
  { code: "ko", native: "한국어",     english: "Korean",   abbrs: ["ko", "kr"] },
  { code: "zh", native: "中文",      english: "Chinese",  abbrs: ["zh", "cn"] }
];

const MODIFIERS = ["none", "ctrl", "alt", "shift", "ctrl+alt", "ctrl+shift", "alt+shift"];

// UI strings. Keys are language codes; 'en' is the fallback for anything missing.
const UI_STRINGS = {
  en: {
    theme: "Theme",
    timeout: "Translation Timeout (seconds)",
    dark: "Dark",
    light: "Light",
    msgToggle: "Message Translate Button",
    msgToggleDesc: "Show a translate button on messages",
    inputToggle: "Input Translate Button",
    inputToggleDesc: "Show a translate button in the chat input",
    symbol: "Target Language Symbol",
    symbolDesc: "Character used to trigger the language picker (e.g. $es)",
    symbolError: "Symbol must be a single non-alphanumeric character",
    nativeLang: "Native Language",
    targetLang: "Target Translate Language",
    uiLang: "UI Language",
    modifier: "Input Translate Modifier",
    modifierDesc: "Keybind to translate the input text",
    auto: "Auto",
    system: "System",
    none: "None",
    saved: "Saved",
    targetSet: "Target language set to: {lang}",
    nothingToTranslate: "Nothing to translate",
    alreadyTarget: "Text is already in {lang}",
    alreadyNative: "Text is already in your native language",
    translationLabel: "translation",
    translateFailed: "Translation failed — check your API key",
    timeoutError: "Translation timed out ({s}s)",
    modelLoading: "Model is loading, try again in a few seconds",
    noLangFound: "No language found",
    enterToSend: "Press Enter to select"
  },
  es: {
    theme: "Tema",
    timeout: "Tiempo límite (segundos)",
    dark: "Oscuro",
    light: "Claro",
    msgToggle: "Botón de traducir mensajes",
    msgToggleDesc: "Muestra un botón de traducción en los mensajes",
    inputToggle: "Botón de traducir entrada",
    inputToggleDesc: "Muestra un botón de traducción en el chat",
    symbol: "Símbolo de idioma destino",
    symbolDesc: "Carácter para abrir el selector (ej. $es)",
    symbolError: "El símbolo debe ser un solo carácter no alfanumérico",
    nativeLang: "Idioma nativo",
    targetLang: "Idioma de traducción",
    uiLang: "Idioma de la interfaz",
    modifier: "Modificador de entrada",
    modifierDesc: "Atajo para traducir el texto de entrada",
    auto: "Auto",
    system: "Sistema",
    none: "Ninguno",
    saved: "Guardado",
    targetSet: "Idioma destino: {lang}",
    nothingToTranslate: "Nada que traducir",
    alreadyTarget: "El texto ya está en {lang}",
    alreadyNative: "El texto ya está en tu idioma nativo",
    translationLabel: "traducción",
    translateFailed: "Error al traducir — revisa tu clave API",
    timeoutError: "Tiempo agotado ({s}s)",
    modelLoading: "El modelo se está cargando, prueba en unos segundos",
    noLangFound: "Idioma no encontrado",
    enterToSend: "Pulsa Enter para seleccionar"
  },
  ja: {
    theme: "テーマ",
    timeout: "タイムアウト（秒）",
    dark: "ダーク",
    light: "ライト",
    msgToggle: "メッセージ翻訳ボタン",
    msgToggleDesc: "メッセージに翻訳ボタンを表示",
    inputToggle: "入力翻訳ボタン",
    inputToggleDesc: "チャット入力に翻訳ボタンを表示",
    symbol: "言語記号",
    symbolDesc: "言語ピッカーを開く記号（例: $es）",
    symbolError: "記号は英数字以外の1文字にしてください",
    nativeLang: "母国語",
    targetLang: "翻訳先の言語",
    uiLang: "UI言語",
    modifier: "入力翻訳の修飾キー",
    modifierDesc: "入力テキストを翻訳するキーバインド",
    auto: "自動",
    system: "システム",
    none: "なし",
    saved: "保存しました",
    targetSet: "翻訳先: {lang}",
    nothingToTranslate: "翻訳するテキストがありません",
    alreadyTarget: "テキストはすでに{lang}です",
    alreadyNative: "テキストはすでに母国語です",
    translationLabel: "翻訳",
    translateFailed: "翻訳に失敗しました — APIキーを確認してください",
    timeoutError: "タイムアウトしました（{s}秒）",
    modelLoading: "モデルを読み込み中です。数秒後にもう一度お試しください",
    noLangFound: "言語が見つかりません",
    enterToSend: "Enterで選択"
  }
};

// ----- helpers (available to both popup and content script) -----

function dtGetLangEntry(code) {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
}

function dtResolveUiLang(setting) {
  if (setting && setting !== "auto") return setting;
  try {
    const sys = (chrome && chrome.i18n) ? chrome.i18n.getUILanguage().split("-")[0] : "en";
    return UI_STRINGS[sys] ? sys : "en";
  } catch (e) {
    return "en";
  }
}

function dtT(uiLangSetting, key, vars) {
  const lang = dtResolveUiLang(uiLangSetting);
  const dict = UI_STRINGS[lang] || UI_STRINGS.en;
  let str = dict[key] || UI_STRINGS.en[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.replace("{" + k + "}", v);
  }
  return str;
}

const DEFAULT_SETTINGS = {
  theme: "system",       // 'system' | 'light' | 'dark'
  msgTranslateBtn: true,
  inputTranslateBtn: true,
  symbol: "$",
  nativeLang: "en",
  targetLang: "es",
  uiLang: "auto",
  inputModifier: "ctrl",
  timeoutSec: 10
};
