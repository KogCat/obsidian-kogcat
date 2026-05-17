# Development Notes

## PGlite in Obsidian Environment

PGlite normally uses `node:fs` to load bundle files, which is unavailable in Obsidian's browser-like plugin environment.

Workaround in `src/database/DatabaseManager.ts`: manually fetch the required PGlite resources (Postgres data, WASM module, Vector extension) and pass them directly to PGlite's initialiser.

In `esbuild.config.mjs`, `process` is set to an empty object to prevent PGlite from detecting a Node environment:

```javascript
define: {
  process: '{}',
}
```

This could theoretically conflict with other libraries that expect `process` — monitor if new dependencies are added.

## ESM / CommonJS Shim for PGlite

PGlite is ESM-only and uses `import.meta.url`. The plugin bundles as CommonJS. A shim in `import-meta-url-shim.js` polyfills `import.meta.url`, injected via esbuild:

```javascript
define: {
  'import.meta.url': 'import_meta_url',
},
inject: [path.resolve('import-meta-url-shim.js')],
```

## Memory Leak on Plugin Reload

Reloading the plugin rapidly during development leaks memory and can make Obsidian unresponsive. Known upstream issue, no fix yet. Restart Obsidian as a workaround.
