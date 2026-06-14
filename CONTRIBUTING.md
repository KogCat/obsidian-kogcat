# Contributing to Kog Cat

## Development Setup

```bash
git clone https://github.com/KogCat/obsidian-kogcat
cd obsidian-kogcat
npm install
npm run dev   # watch mode
```

Symlink (or copy) the repo folder into `<vault>/.obsidian/plugins/kogcat/`, then enable the plugin. Use the [Hot Reload plugin](https://github.com/pjeby/hot-reload) for automatic reloading during development.

## Settings migrations

User settings are versioned. When you change the settings shape, add a migration under `src/settings/schema/migrations/` and bump `SETTINGS_SCHEMA_VERSION`; `parseSmartComposerSettings` runs the chain on load and falls back to defaults if parsing fails.

## Submitting Changes

1. Branch from `main`.
2. Run `npm install` at root.
3. Before submitting: `npm test`, `npm run type:check`, `npm run lint:check`.
4. Open a PR against `main` at [github.com/KogCat/obsidian-kogcat](https://github.com/KogCat/obsidian-kogcat).

For significant changes, open an issue first to align on approach.

## Known Issue: Memory Leak on Plugin Reload

Reloading the plugin repeatedly during development can cause Obsidian to slow down. This is a known upstream issue under investigation. Restart Obsidian if you hit it.

## License

FSL-1.1-MIT (see [LICENSE](LICENSE)). Contributions are licensed under the same terms.
