import comments from '@eslint-community/eslint-plugin-eslint-comments'
import obsidianmd from 'eslint-plugin-obsidianmd'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// Align with the Obsidian community-plugin review bot: only the rules the bot
// treats as blocking are `error`; everything else from obsidianmd recommended is
// surfaced as `warn` (non-blocking, matches the published review report).
const toWarn = (configs) =>
  configs.map((c) => {
    if (!c.rules) return c
    const rules = {}
    for (const [k, v] of Object.entries(c.rules)) {
      const sev = Array.isArray(v) ? v[0] : v
      rules[k] =
        sev === 'error' || sev === 2
          ? Array.isArray(v)
            ? ['warn', ...v.slice(1)]
            : 'warn'
          : v
    }
    return { ...c, rules }
  })

export default tseslint.config(
  {
    ignores: [
      'main.js',
      'meta.json',
      'node_modules/**',
      '__mocks__/**',
      'scripts/**',
      '*.js',
      '*.mjs',
      '*.cjs',
      'package.json',
    ],
  },
  ...toWarn(obsidianmd.configs.recommended),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@eslint-community/eslint-comments': comments,
      'react-hooks': reactHooks,
    },
    rules: {
      // --- blocking (the three categories the review bot fails on) ---
      'obsidianmd/no-unsupported-api': 'error',
      '@eslint-community/eslint-comments/require-description': [
        'error',
        { ignore: [] },
      ],
      '@eslint-community/eslint-comments/no-restricted-disable': [
        'error',
        '@typescript-eslint/no-explicit-any',
      ],
      // --- non-blocking dev signal ---
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
)
