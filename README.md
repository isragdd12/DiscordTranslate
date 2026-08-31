# Discord Translate

A browser extension that adds live translation to Discord (web). Translate messages inline and translate your input before sending — all without leaving Discord.

Made by **isragdd**.

## Features

- **Message Translate Button** — an inline translate icon next to each message's text. Click it to expand an italic, gray translation line beneath the original; click again to collapse it.
- **Input Translate Button** — a button in the chat input bar (plus an optional `Ctrl/Alt/Shift + Enter` keybind) that translates all the text currently in the input, with a blur-pill loading overlay.
- **Language Symbol Picker** — type `$` (configurable) followed by a language code (e.g. `$es`, `$ja`) in the input to open a searchable language picker. Hit Tab/Enter or click to set the target language, then the `$xx` token is removed automatically.
- **Light / Dark UI** — a clean Discord-blue-accented popup with pill toggles and two-sided language dropdowns.
- **Localization** — the popup UI follows your chosen UI language (defaults to Auto / system).

## Settings

- Message Translate Button (toggle)
- Input Translate Button (toggle)
- Target Language Symbol (any single non-alphanumeric character, default `$`)
- Native Language
- Target Translate Language
- UI Language (Auto / System by default)
- Input Translate Modifier (None / Ctrl / Alt / Shift / combos, default Ctrl → `Ctrl+Enter`)
- Translation Timeout (seconds)

## Installation (dev)

1. Open `chrome://extensions` (or your browser's extensions page).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder (`DiscordTranslate`).
4. Open **discord.com** and start translating.

## Files

- `manifest.json` — extension manifest (MV3)
- `background.js` — service worker; bridges translation calls to the Google Translate endpoint and pre-warms languages
- `content.js` / `content.css` — injected into Discord: message buttons, input button, picker, toasts
- `popup.html` / `popup.js` / `popup.css` — settings popup UI
- `languages.js` — shared language data, UI strings, default settings

> Note: translation is powered by Google Translate's public endpoint (no API key required). An optional `.env` with your HF key can be ignored by git.