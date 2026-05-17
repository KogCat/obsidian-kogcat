// Type augmentation for react-i18next so `t('ns:key')` is checked against the
// English resource tree. Keeping the source of truth at `locales/en/index.ts`
// means renames break the build instead of silently mistranslating at runtime.

import 'react-i18next'

import en from './locales/en'

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: typeof en
    returnNull: false
  }
}
