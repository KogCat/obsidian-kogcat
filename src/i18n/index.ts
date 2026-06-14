// KogCat i18n entry — i18next + react-i18next.
//
// Locale resolution: settings.locale (auto | en | zh) → Obsidian moment.locale()
// → navigator.language → 'en'. Resources are bundled as JSON namespaces under
// locales/<lang>/<ns>.json so external translation tooling can consume them.

import i18n from 'i18next'
import { Trans, initReactI18next, useTranslation } from 'react-i18next'

import en from './locales/en'
import zh from './locales/zh'

export type LocaleSetting = 'auto' | 'en' | 'zh'
export type ResolvedLocale = 'en' | 'zh'

const SUPPORTED: readonly ResolvedLocale[] = ['en', 'zh']

export function detectSystemLocale(): ResolvedLocale {
  const moment = (
    globalThis as unknown as { moment?: { locale?: () => string } }
  ).moment
  const fromMoment = moment?.locale?.()
  const raw = (
    fromMoment ||
    (typeof navigator !== 'undefined' ? navigator.language : '') ||
    'en'
  ).toLowerCase()
  return raw.startsWith('zh') ? 'zh' : 'en'
}

export function resolveLocale(setting: LocaleSetting): ResolvedLocale {
  if (setting === 'auto') return detectSystemLocale()
  return SUPPORTED.includes(setting) ? setting : 'en'
}

let initialized = false
const listeners: ((locale: ResolvedLocale) => void)[] = []

export function initI18n(setting: LocaleSetting = 'auto'): void {
  const lng = resolveLocale(setting)
  if (initialized) {
    void i18n.changeLanguage(lng)
    return
  }
  initialized = true
  void i18n.use(initReactI18next).init({
    resources: { en, zh },
    lng,
    fallbackLng: 'en',
    ns: Object.keys(en),
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
  })
  i18n.on('languageChanged', (lang) => {
    if (lang === 'en' || lang === 'zh') {
      listeners.forEach((l) => l(lang))
    }
  })
}

export async function applyLocale(setting: LocaleSetting): Promise<void> {
  await i18n.changeLanguage(resolveLocale(setting))
}

export function getCurrentLocale(): ResolvedLocale {
  const cur = i18n.language
  return cur === 'zh' ? 'zh' : 'en'
}

export function onLocaleChange(
  listener: (locale: ResolvedLocale) => void,
): () => void {
  listeners.push(listener)
  return () => {
    const idx = listeners.indexOf(listener)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

// Function-style API for non-React call sites (Notice, plugin entry, services).
// Keys take the i18next form `ns:key.path`. With no `:` separator the
// defaultNS ('common') applies.
export function t(key: string, vars?: Record<string, string | number>): string {
  return i18n.t(key, vars ?? {})
}

export { useTranslation, Trans, i18n }
