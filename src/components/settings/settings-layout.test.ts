import fs from 'fs'
import path from 'path'

const rootDir = path.resolve(__dirname, '../../..')
const manifest = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'),
)
const settingsRootSource = fs.readFileSync(
  path.join(__dirname, './SettingsTabRoot.tsx'),
  'utf8',
)
const kogCatSectionSource = fs.readFileSync(
  path.join(__dirname, './sections/KogCatSection.tsx'),
  'utf8',
)
const providerFormSource = fs.readFileSync(
  path.join(__dirname, './modals/ProviderFormModal.tsx'),
  'utf8',
)
const modelsSectionSource = fs.readFileSync(
  path.join(__dirname, './sections/ModelsSection.tsx'),
  'utf8',
)
const etcSectionSource = fs.readFileSync(
  path.join(__dirname, './sections/EtcSection.tsx'),
  'utf8',
)
const providersSectionSource = fs.readFileSync(
  path.join(__dirname, './sections/ProvidersSection.tsx'),
  'utf8',
)
const reviewViewSource = fs.readFileSync(
  path.join(rootDir, 'src/KogCatReviewView.tsx'),
  'utf8',
)

const settingsEn = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../i18n/locales/en/settings.json'),
    'utf8',
  ),
) as Record<string, unknown>
const modalEn = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../i18n/locales/en/modal.json'),
    'utf8',
  ),
) as Record<string, unknown>
const calibrationEn = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../i18n/locales/en/calibration.json'),
    'utf8',
  ),
) as Record<string, unknown>

const kogcatStrings = settingsEn.kogcat as {
  header: string
  intro: { name: string; open: string; panel: string }
}
const modelsStrings = settingsEn.models as {
  desc: string
  chatModels: { addCustom: string }
}
const addProviderStrings = modalEn.addProvider as {
  modelsHeader: string
  fetchModels: string
  manualModel: string
  manualModelFallback: string
  testConnection: string
}
const calibrationStrings = calibrationEn as {
  source: { llm: string; local: string }
}

describe('settings page layout', () => {
  test('uses KogCat as the plugin name shown by Obsidian settings', () => {
    expect(manifest.name).toBe('KogCat')
  })

  test('does not render the phase-two support block', () => {
    expect(settingsRootSource).not.toContain('Support Kog')
    expect(settingsRootSource).not.toContain('Buy Me a Coffee')
    expect(settingsRootSource).not.toContain('cc-settings-support-kog-cat')
  })

  test('labels the KogCat settings section consistently', () => {
    expect(kogcatStrings.header).toBe('KogCat')
  })

  test('uses intro and review panel as the primary KogCat controls', () => {
    expect(kogCatSectionSource).toContain('KogCatIntroModal')
    expect(kogCatSectionSource).toContain('settings:kogcat.intro.name')
    expect(kogcatStrings.intro.name).toBe('Getting started')
    expect(kogcatStrings.intro.open).toBe('Show intro')
    expect(kogcatStrings.intro.panel).toBe('Open review panel')
    expect(kogCatSectionSource).not.toContain('settings:kogcat.answerMode')
    expect(kogCatSectionSource).not.toContain('Response comparison')
  })

  test('groups settings into Basics / Models / Other tabs', () => {
    // Tab bar with three tabs in order.
    expect(settingsRootSource).toContain("useState<TabKey>('basic')")
    for (const tab of ['tabs.basic', 'tabs.models', 'tabs.other']) {
      expect(settingsRootSource).toContain(`settings:${tab}`)
    }
    // Section render order in source: basic → (plan, providers, models) → other.
    const order = [
      'KogCatSection',
      'PlanConnectionsSection',
      'ProvidersSection',
      'ModelsSection',
      'EtcSection',
    ]
    const positions = order.map((s) => settingsRootSource.indexOf(`<${s}`))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  test('Basics tab holds website, status card and language', () => {
    // Intro precedes the local-service status card; engine buttons live in it.
    expect(
      kogCatSectionSource.indexOf('settings:kogcat.intro.name'),
    ).toBeLessThan(kogCatSectionSource.indexOf('kogcat-engine-card'))
    expect(kogCatSectionSource).toContain('kogcat-engine-card__actions')
    expect(kogCatSectionSource).toContain('settings:kogcat.engine.restart')
    expect(kogCatSectionSource).toContain('https://www.kogcat.com')
    expect(kogCatSectionSource).toContain('settings:kogcat.learnMore')
    // Language moved into Basics; Etc keeps only the reset control.
    expect(kogCatSectionSource).toContain('settings:language.name')
    expect(etcSectionSource).not.toContain('settings:language.name')
  })

  test('consistent header level: no h1 section headers inside tabs', () => {
    for (const src of [
      kogCatSectionSource,
      providersSectionSource,
      modelsSectionSource,
      etcSectionSource,
    ]) {
      expect(src).not.toContain('cc-settings-header')
    }
    // Group titles in the Models tab all use the same sub-header level.
    expect(providersSectionSource).toContain('cc-settings-sub-header')
    expect(modelsSectionSource).toContain('cc-settings-sub-header')
  })

  test('drops the advanced engine settings disclosure', () => {
    expect(kogCatSectionSource).not.toContain('showAdvancedEngineSettings')
    expect(kogCatSectionSource).not.toContain('binaryPath')
    expect(kogcatStrings).not.toHaveProperty('advanced')
    expect(kogcatStrings).not.toHaveProperty('binaryPath')
    expect(kogCatSectionSource).not.toContain('om-core port')
    expect(kogCatSectionSource).not.toContain('settings:kogcat.port')
  })

  test('lets a provider fetch, test and pick models, with manual as fallback', () => {
    expect(addProviderStrings.modelsHeader).toBe('Models')
    expect(addProviderStrings.fetchModels).toBe('Fetch models')
    expect(addProviderStrings.testConnection).toBe('Test')
    expect(addProviderStrings.manualModel).toBe('Add model manually')
    expect(addProviderStrings.manualModelFallback).toBe('Model not listed?')
    expect(providerFormSource).toContain('listModels')
    expect(providerFormSource).toContain('testChatModel')
    expect(providerFormSource).toContain('chatModels:')
    expect(providerFormSource).toContain('plugin.settings.chatModels')
    expect(providerFormSource).toContain('makeChatModelId')
    expect(providerFormSource).toContain('showManualModel')
    expect(providerFormSource).not.toContain('PromptLevel')
  })

  test('uses configured provider models as the review-model picker', () => {
    expect(modelsStrings.desc).toContain('refines calibration')
    expect(modelsStrings.desc).toContain('checked models')
    expect(modelsStrings.desc).toContain('limited local preview')
    expect(modelsStrings.chatModels.addCustom).toBe('Add custom model')
    expect(modelsSectionSource).toContain("t('models.desc')")
    expect(modelsSectionSource).toContain('formatModelOption')
    expect(modelsSectionSource).toContain('isModelUsable')
    expect(modelsSectionSource).not.toContain('EmbeddingModelsSubSection')
  })

  test('review panel gates LLM refinement on a usable selected model and shows source', () => {
    expect(calibrationStrings.source.llm).toContain('Refined with')
    expect(calibrationStrings.source.local).toContain('Local basic result')
    expect(reviewViewSource).toContain('resolveReviewModel')
    expect(reviewViewSource).toContain('isModelUsable')
    expect(reviewViewSource).toContain('kogcat-review-source')
    expect(reviewViewSource).toContain('calibration:source.llm')
    expect(reviewViewSource).toContain('calibration:source.local')
  })
})
