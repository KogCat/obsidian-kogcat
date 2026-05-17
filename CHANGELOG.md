# Changelog

## 0.2.2

### om-core onedir binary

- The om-core binary moved to PyInstaller `--onedir` — distributed as a bundle directory packed `om-core-bin-<target>.tar.xz`. The direct-spawn download path (`OM_ALLOW_DIRECT_SPAWN=1`, CI/mock) now extracts it: `download.ts` gained `installBundle()` — extract via system `tar -xJf` into a staging dir, then atomic rename into `bundle/` — invoked when a resolved release's `format` is `tar.xz`. The legacy raw single-file path (absent `format`) is unchanged.
- Channel schema gate `SUPPORTED_CHANNEL_SCHEMA` 2 → 3, aggregate-manifest `SUPPORTED_SCHEMA_VERSION` 1 → 2 — both carry the new per-target `format` field.

## 0.2.0

### Internationalization (i18n)

- **Full bilingual UI (en/zh)** via `i18next` + `react-i18next`. Locale auto-detects from Obsidian `moment.locale()`; user can override under Settings → KogCat → Language.
- **16 namespaces** (`advisor` / `calibration` / `chat` / `command` / `common` / `error` / `modal` / `notice` / `onboarding` / `pack` / `privacy` / `rag` / `settings` / `sidebar` / `status` / `template`) under `src/i18n/locales/{en,zh}/<ns>.json`.
- **Translated surfaces**: 5 commands, all settings page `setName` / `setDesc` / `placeholder` (~90 fields), 12 modals (provider/chat-model/embedding-model/MCP-server form modals, OAuth Plan modals for Claude/Gemini/OpenAI, embedding DB manager, included/excluded files, template form, error, installer-update, confirm, privacy), all user-facing `Notice` messages (~90), Chat header / input buttons / tool actions, Sidebar / Privacy modal / Calibration card / Advisor card. Obsidian-side onboarding flow (download / register-service / start) localized in `onboarding` namespace.
- **Type-safe keys**: `src/i18n/i18next.d.ts` augments `CustomTypeOptions.resources` to the English tree — missing keys fail `npm run type:check`.
- **`npm run i18n:check`**: parity validation across en/zh namespaces (`scripts/i18n-check.mjs`). Wire into CI.
- Settings schema migrated 21 → 22, adds `locale: 'auto' | 'en' | 'zh'`, defaults to `auto`.
- Removed obsolete `src/core/kogcat/i18n.ts` (32-entry hand-rolled dictionary); call sites redirected to `src/i18n`.

### Docs

- New [docs/15-i18n.md](docs/15-i18n.md): module structure, locale resolution, translator workflow, CI hooks, additional-namespace recipe.
- [docs/03-settings.md](docs/03-settings.md) lists `locale` schema field.

## 0.1.4

(prior release)
