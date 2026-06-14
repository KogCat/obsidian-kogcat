# Development Notes

## Gemini Plan OAuth client secret (build-time injection)

`GEMINI_OAUTH_CLIENT_SECRET` (`src/constants.ts`) is the Gemini CLI's installed-app
OAuth secret. It is **non-confidential by design** — Google's token endpoint requires
it even for the PKCE/native flow, but real security comes from PKCE + the per-user
refresh token, not from keeping this value private (the official `gemini-cli` ships it
openly; Google's docs state installed-app secrets are "not treated as a secret").

It is **not** stored in source. esbuild injects it at build time via `define`, reading
(in order): the `GEMINI_OAUTH_CLIENT_SECRET` env var, then `secrets.local.json`
(gitignored). When neither is supplied the value compiles to `''` and Gemini Plan OAuth
is disabled in that build (esbuild logs which case applies).

Why: keeping the literal out of committed source means GitHub push protection / secret
scanners never trip, and the public-mirror source needs no per-release hand-editing.

### One-time local setup (to build a release with Gemini Plan working)

```bash
cp secrets.local.example.json secrets.local.json
# put the real Gemini CLI installed-app secret in secrets.local.json
```

Every `npm run build` then embeds it into `main.js`. The file is gitignored, so the
secret never reaches either git remote — only the release-asset bundle. Alternatively,
per-build without a file: `GEMINI_OAUTH_CLIENT_SECRET=... npm run build`.

### Release checklist

- Source repo (private origin **and** public mirror) is always clean — nothing to strip.
- Decide whether the **release-asset `main.js`** should embed the secret:
  - **Embed** (Gemini Plan works for users): build with `secrets.local.json` present.
  - **Strip** (Gemini Plan OAuth fails with "client_secret is missing"): build with no
    env var and no `secrets.local.json`.
- Confirm the intended case from the esbuild build-log line before uploading the asset.

## Memory Leak on Plugin Reload

Reloading the plugin rapidly during development leaks memory and can make Obsidian unresponsive. Known upstream issue, no fix yet. Restart Obsidian as a workaround.
