// Jest setup: boot i18n in English so tests asserting on translated strings
// (Notice messages, button labels) get deterministic English output without
// each test having to import and call initI18n explicitly.

import { initI18n } from '../i18n'

initI18n('en')
