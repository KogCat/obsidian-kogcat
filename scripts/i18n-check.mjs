#!/usr/bin/env node
// i18n-check: enforce key parity between en/zh namespace files.
//
// Fails (exit 1) if:
//   - en/<ns>.json and zh/<ns>.json have different sets of leaf keys
//   - either side has an empty value
//   - either side is missing a namespace the other has
//
// This is the single source of truth for "no untranslated key shipped" — wire
// it into CI to catch drift before users see English fallbacks in zh mode.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesRoot = resolve(__dirname, '..', 'src', 'i18n', 'locales')
const SUPPORTED = ['en', 'zh']

function flatten(obj, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key))
    } else {
      out[key] = v
    }
  }
  return out
}

function loadNamespace(locale, ns) {
  const file = join(localesRoot, locale, `${ns}.json`)
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return { __error: err.message }
  }
}

let hadError = false

const enFiles = readdirSync(join(localesRoot, 'en'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
const zhFiles = readdirSync(join(localesRoot, 'zh'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))

const allNs = new Set([...enFiles, ...zhFiles])

for (const ns of allNs) {
  const enHas = enFiles.includes(ns)
  const zhHas = zhFiles.includes(ns)
  if (!enHas) {
    console.error(`[i18n] missing en/${ns}.json (zh has it)`)
    hadError = true
    continue
  }
  if (!zhHas) {
    console.error(`[i18n] missing zh/${ns}.json (en has it)`)
    hadError = true
    continue
  }

  const en = loadNamespace('en', ns)
  const zh = loadNamespace('zh', ns)
  if (en.__error) {
    console.error(`[i18n] en/${ns}.json parse error: ${en.__error}`)
    hadError = true
    continue
  }
  if (zh.__error) {
    console.error(`[i18n] zh/${ns}.json parse error: ${zh.__error}`)
    hadError = true
    continue
  }

  const enFlat = flatten(en)
  const zhFlat = flatten(zh)

  const enKeys = new Set(Object.keys(enFlat))
  const zhKeys = new Set(Object.keys(zhFlat))

  for (const key of enKeys) {
    if (!zhKeys.has(key)) {
      console.error(`[i18n] zh/${ns}.json missing key: ${key}`)
      hadError = true
    } else if (zhFlat[key] === '' || zhFlat[key] == null) {
      console.error(`[i18n] zh/${ns}.json empty value: ${key}`)
      hadError = true
    }
  }
  for (const key of zhKeys) {
    if (!enKeys.has(key)) {
      console.error(`[i18n] en/${ns}.json missing key: ${key}`)
      hadError = true
    } else if (enFlat[key] === '' || enFlat[key] == null) {
      console.error(`[i18n] en/${ns}.json empty value: ${key}`)
      hadError = true
    }
  }
}

if (hadError) {
  console.error('\n[i18n] FAIL — fix the errors above.')
  process.exit(1)
}
console.log(
  `[i18n] OK — ${allNs.size} namespaces parity-checked across ${SUPPORTED.join(', ')}.`,
)
