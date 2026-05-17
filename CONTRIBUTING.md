# Contributing to Kog Cat

## Development Setup

```bash
git clone https://github.com/KogCat/obsidian-kogcat
cd obsidian-kogcat
npm install
npm run dev   # watch mode
```

Symlink (or copy) the repo folder into `<vault>/.obsidian/plugins/kog-cat/`, then enable the plugin. Use the [Hot Reload plugin](https://github.com/pjeby/hot-reload) for automatic reloading during development.

## Database Development

Kog Cat uses PGlite + Drizzle ORM for the vault-side embedding store.

### Updating the Schema

1. Edit `src/database/schema.ts`.
2. Generate migration:
   ```bash
   npx drizzle-kit generate --name <migration-name>
   ```
3. Compile migrations into the single JSON the plugin ships:
   ```bash
   npm run migrate:compile
   ```
   This updates `src/database/migrations.json`. Files in `drizzle/` have no effect until compiled.

### Squashing Migrations

After finalising schema changes:
1. Delete new files in `drizzle/` and `drizzle/meta/`.
2. Remove new entries from `drizzle/meta/_journal.json`.
3. Re-run `npx drizzle-kit generate --name <migration-name>`.

### Debugging the DB in Obsidian Console

1. Open the developer console. Find the log `"Smart composer database initialized."`.
2. Right-click the `DatabaseManager` object → "Store as global variable" (e.g. `temp1`).
3. Run queries:
   ```javascript
   await temp1.pgClient.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`)
   await temp1.save()  // persist changes
   ```

## Submitting Changes

1. Branch from `main`.
2. Run `npm install` at root.
3. Before submitting: `npm test`, `npm run type:check`, `npm run lint:check`.
4. Open a PR against `main` at [github.com/KogCat/obsidian-kogcat](https://github.com/KogCat/obsidian-kogcat).

For significant changes, open an issue first to align on approach.

## Known Issue: Memory Leak on Plugin Reload

Reloading the plugin repeatedly during development can cause Obsidian to slow down. This is a known upstream issue under investigation. Restart Obsidian if you hit it.

## License

MIT. Contributions are licensed under the same terms.
