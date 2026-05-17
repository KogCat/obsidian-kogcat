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

const kogcatStrings = settingsEn.kogcat as {
  header: string
  answerMode: { name: string; options: Record<string, string> }
  advanced: { name: string }
  binaryPath: { name: string }
  port: { name: string }
}
const modelsStrings = settingsEn.models as {
  desc: string
  chatModels: { addCustom: string }
}
const addProviderStrings = modalEn.addProvider as {
  chatModelOptional: string
  modelId: string
  modelName: string
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
    expect(kogCatSectionSource).toContain("t('settings:kogcat.header')")
  })

  test('uses answer mode as the primary KogCat control', () => {
    expect(kogCatSectionSource).toContain('ObsidianDropdown')
    expect(kogCatSectionSource).toContain('settings:kogcat.answerMode.name')
    expect(kogcatStrings.answerMode.name).toBe('Answer mode')
    expect(kogcatStrings.answerMode.options.quick).toBe('Quick Answer')
    expect(kogcatStrings.answerMode.options.advisor).toBe('Advisor Answer')
    expect(kogcatStrings.answerMode.options.off).toBe('Off')
    expect(kogCatSectionSource).not.toContain('Response comparison')
  })

  test('keeps low-frequency engine settings behind advanced disclosure', () => {
    expect(kogCatSectionSource).toContain('showAdvancedEngineSettings &&')
    expect(kogcatStrings.advanced.name).toBe('Advanced engine settings')
    expect(kogcatStrings.binaryPath.name).toBe('Binary path')
    expect(kogcatStrings.port.name).toBe('Port')
    expect(kogCatSectionSource).not.toContain('om-core binary path')
    expect(kogCatSectionSource).not.toContain('om-core port')
  })

  test('lets a new provider optionally create a chat model', () => {
    expect(addProviderStrings.chatModelOptional).toContain('Chat model')
    expect(addProviderStrings.modelId).toBe('Model ID')
    expect(addProviderStrings.modelName).toBe('Model Name')
    expect(providerFormSource).toContain('chatModels:')
    expect(providerFormSource).toContain('plugin.settings.chatModels')
  })

  test('explains that model IDs can be entered manually', () => {
    expect(modelsStrings.desc).toContain('manual')
    expect(modelsStrings.desc).toContain('model IDs')
    expect(modelsStrings.chatModels.addCustom).toBe('Add custom model')
    expect(modelsSectionSource).toContain("t('models.desc')")
  })
})
