import { App, Notice } from 'obsidian'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { t as tFn } from '../../../../i18n'
import SmartComposerPlugin from '../../../../main'
import { ChatModel, chatModelSchema } from '../../../../types/chat-model.types'
import { ObsidianButton } from '../../../common/ObsidianButton'
import { ObsidianDropdown } from '../../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../../common/ObsidianToggle'
import { ReactModal } from '../../../common/ReactModal'

type SettingsComponentProps = {
  model: ChatModel
  plugin: SmartComposerPlugin
  onClose: () => void
}

export class ChatModelSettingsModal extends ReactModal<SettingsComponentProps> {
  constructor(model: ChatModel, app: App, plugin: SmartComposerPlugin) {
    const modelSettings = getModelSettings(model)
    super({
      app: app,
      Component: modelSettings
        ? modelSettings.SettingsComponent
        : NoSettingsComponent,
      props: { model, plugin },
      options: {
        title: tFn('modal:chatModelEdit.title', { id: model.id }),
      },
    })
  }
}

function NoSettingsComponent() {
  const { t } = useTranslation('settings')
  return <div>{t('models.noSettings')}</div>
}

type ModelSettingsRegistry = {
  check: (model: ChatModel) => boolean
  SettingsComponent: React.FC<SettingsComponentProps>
}

/**
 * Registry of available model settings.
 *
 * The check function is used to determine if the model settings should be displayed.
 * The SettingsComponent is the component that will be displayed when the model settings are opened.
 */
const MODEL_SETTINGS_REGISTRY: ModelSettingsRegistry[] = [
  /**
   * OpenAI model settings
   */
  {
    check: (model) => model.providerType === 'openai',

    SettingsComponent: (props: SettingsComponentProps) => {
      const { t } = useTranslation(['settings', 'modal', 'notice'])
      const { model, plugin, onClose } = props
      const typedModel = model as ChatModel & { providerType: 'openai' }
      const [reasoningEnabled, setReasoningEnabled] = useState<boolean>(
        typedModel.reasoning?.enabled ?? false,
      )
      const [reasoningEffort, setReasoningEffort] = useState<string>(
        typedModel.reasoning?.reasoning_effort ?? 'medium',
      )

      const handleSubmit = async () => {
        if (!['low', 'medium', 'high'].includes(reasoningEffort)) {
          new Notice(t('notice:model.reasoningEffortInvalid'))
          return
        }

        const updatedModel = {
          ...typedModel,
          reasoning: {
            enabled: reasoningEnabled,
            reasoning_effort: reasoningEffort,
          },
        }

        const validationResult = chatModelSchema.safeParse(updatedModel)
        if (!validationResult.success) {
          new Notice(
            validationResult.error.issues.map((v) => v.message).join('\n'),
          )
          return
        }

        await plugin.setSettings({
          ...plugin.settings,
          chatModels: plugin.settings.chatModels.map((m) =>
            m.id === model.id ? updatedModel : m,
          ),
        })
        onClose()
      }

      return (
        <>
          <ObsidianSetting
            name={t('settings:modelOptions.openai.reasoning.name')}
            desc={t('settings:modelOptions.openai.reasoning.desc')}
          >
            <ObsidianToggle
              value={reasoningEnabled}
              onChange={(value: boolean) => setReasoningEnabled(value)}
            />
          </ObsidianSetting>
          {reasoningEnabled && (
            <ObsidianSetting
              name={t('settings:modelOptions.openai.reasoningEffort.name')}
              desc={t('settings:modelOptions.openai.reasoningEffort.desc')}
              className="cc-setting-item--nested"
              required
            >
              <ObsidianDropdown
                value={reasoningEffort}
                options={{
                  low: 'low',
                  medium: 'medium',
                  high: 'high',
                }}
                onChange={(value: string) => setReasoningEffort(value)}
              />
            </ObsidianSetting>
          )}

          <ObsidianSetting>
            <ObsidianButton
              text={t('modal:addProvider.save')}
              onClick={handleSubmit}
              cta
            />
            <ObsidianButton
              text={t('modal:addProvider.cancel')}
              onClick={onClose}
            />
          </ObsidianSetting>
        </>
      )
    },
  },

  /**
   * OpenAI Codex model settings
   */
  {
    check: (model) => model.providerType === 'openai-plan',

    SettingsComponent: (props: SettingsComponentProps) => {
      const { t } = useTranslation(['settings', 'modal'])
      const { model, plugin, onClose } = props
      const typedModel = model as ChatModel & { providerType: 'openai-plan' }
      const [reasoningEffort, setReasoningEffort] = useState<string>(
        typedModel.reasoning?.reasoning_effort ?? '',
      )
      const [reasoningSummary, setReasoningSummary] = useState<string>(
        typedModel.reasoning?.reasoning_summary ?? '',
      )

      const handleSubmit = async () => {
        const updatedReasoning = {
          reasoning_effort: reasoningEffort || undefined,
          reasoning_summary: reasoningSummary || undefined,
        }
        const updatedModel = {
          ...typedModel,
          reasoning:
            updatedReasoning.reasoning_effort ||
            updatedReasoning.reasoning_summary
              ? updatedReasoning
              : undefined,
        }

        const validationResult = chatModelSchema.safeParse(updatedModel)
        if (!validationResult.success) {
          new Notice(
            validationResult.error.issues.map((v) => v.message).join('\n'),
          )
          return
        }

        await plugin.setSettings({
          ...plugin.settings,
          chatModels: plugin.settings.chatModels.map((m) =>
            m.id === model.id ? updatedModel : m,
          ),
        })
        onClose()
      }

      return (
        <>
          <ObsidianSetting
            name={t('settings:modelOptions.openaiPlan.reasoningEffort.name')}
            desc={t('settings:modelOptions.openaiPlan.reasoningEffort.desc')}
          >
            <ObsidianDropdown
              value={reasoningEffort}
              options={{
                '': t(
                  'settings:modelOptions.openaiPlan.reasoningEffort.notSet',
                ),
                none: 'none',
                minimal: 'minimal',
                low: 'low',
                medium: 'medium',
                high: 'high',
                xhigh: 'xhigh',
              }}
              onChange={(value: string) => setReasoningEffort(value)}
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('settings:modelOptions.openaiPlan.reasoningSummary.name')}
            desc={t('settings:modelOptions.openaiPlan.reasoningSummary.desc')}
          >
            <ObsidianDropdown
              value={reasoningSummary}
              options={{
                '': t(
                  'settings:modelOptions.openaiPlan.reasoningSummary.notSet',
                ),
                auto: 'auto',
                concise: 'concise',
                detailed: 'detailed',
              }}
              onChange={(value: string) => setReasoningSummary(value)}
            />
          </ObsidianSetting>

          <ObsidianSetting>
            <ObsidianButton
              text={t('modal:addProvider.save')}
              onClick={handleSubmit}
              cta
            />
            <ObsidianButton
              text={t('modal:addProvider.cancel')}
              onClick={onClose}
            />
          </ObsidianSetting>
        </>
      )
    },
  },

  /**
   * Claude model settings
   *
   * For extended thinking, see:
   * @see https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
   */
  {
    check: (model) =>
      model.providerType === 'anthropic' ||
      model.providerType === 'anthropic-plan',
    SettingsComponent: (props: SettingsComponentProps) => {
      const { t } = useTranslation(['settings', 'modal', 'notice'])
      const DEFAULT_THINKING_BUDGET_TOKENS = 8192

      const { model, plugin, onClose } = props
      const typedModel = model as ChatModel & { providerType: 'anthropic' }
      const [thinkingEnabled, setThinkingEnabled] = useState<boolean>(
        typedModel.thinking?.enabled ?? false,
      )
      const [budgetTokens, setBudgetTokens] = useState(
        (
          typedModel.thinking?.budget_tokens ?? DEFAULT_THINKING_BUDGET_TOKENS
        ).toString(),
      )

      const handleSubmit = async () => {
        const parsedTokens = parseInt(budgetTokens, 10)
        if (isNaN(parsedTokens)) {
          new Notice(t('notice:model.invalidNumber'))
          return
        }

        if (parsedTokens < 1024) {
          new Notice(t('notice:model.budgetTooLow'))
          return
        }

        const updatedModel = {
          ...typedModel,
          thinking: {
            enabled: thinkingEnabled,
            budget_tokens: parsedTokens,
          },
        }

        const validationResult = chatModelSchema.safeParse(updatedModel)
        if (!validationResult.success) {
          new Notice(
            validationResult.error.issues.map((v) => v.message).join('\n'),
          )
          return
        }

        await plugin.setSettings({
          ...plugin.settings,
          chatModels: plugin.settings.chatModels.map((m) =>
            m.id === model.id ? updatedModel : m,
          ),
        })
        onClose()
      }

      return (
        <>
          <ObsidianSetting
            name={t('settings:modelOptions.anthropic.extendedThinking.name')}
            desc={t('settings:modelOptions.anthropic.extendedThinking.desc')}
          >
            <ObsidianToggle
              value={thinkingEnabled}
              onChange={(value: boolean) => setThinkingEnabled(value)}
            />
          </ObsidianSetting>
          {thinkingEnabled && (
            <ObsidianSetting
              name={t('settings:modelOptions.anthropic.budgetTokens.name')}
              desc={t('settings:modelOptions.anthropic.budgetTokens.desc')}
              className="cc-setting-item--nested"
              required
            >
              <ObsidianTextInput
                value={budgetTokens}
                placeholder={t(
                  'settings:modelOptions.anthropic.budgetTokens.placeholder',
                )}
                onChange={(value: string) => setBudgetTokens(value)}
                type="number"
              />
            </ObsidianSetting>
          )}

          <ObsidianSetting>
            <ObsidianButton
              text={t('modal:addProvider.save')}
              onClick={handleSubmit}
              cta
            />
            <ObsidianButton
              text={t('modal:addProvider.cancel')}
              onClick={onClose}
            />
          </ObsidianSetting>
        </>
      )
    },
  },

  /**
   * Gemini model settings
   *
   * For thinking, see:
   * @see https://ai.google.dev/gemini-api/docs/thinking
   */
  {
    check: (model) =>
      model.providerType === 'gemini' || model.providerType === 'gemini-plan',
    SettingsComponent: (props: SettingsComponentProps) => {
      const { t } = useTranslation(['settings', 'modal', 'notice'])
      const { model, plugin, onClose } = props
      const typedModel = model as ChatModel & {
        providerType: 'gemini' | 'gemini-plan'
      }
      const [thinkingEnabled, setThinkingEnabled] = useState<boolean>(
        typedModel.thinking?.enabled ?? false,
      )
      const [controlMode, setControlMode] = useState<'level' | 'budget'>(
        typedModel.thinking?.control_mode ?? 'level',
      )
      const [thinkingLevel, setThinkingLevel] = useState<string>(
        String(typedModel.thinking?.thinking_level ?? 'high'),
      )
      const [thinkingBudget, setThinkingBudget] = useState<string>(
        String(typedModel.thinking?.thinking_budget ?? -1),
      )
      const [includeThoughts, setIncludeThoughts] = useState<boolean>(
        Boolean(typedModel.thinking?.include_thoughts ?? false),
      )

      const handleSubmit = async () => {
        let parsedBudget: number | undefined
        if (controlMode === 'budget') {
          parsedBudget = parseInt(thinkingBudget, 10)
          if (isNaN(parsedBudget)) {
            new Notice(t('notice:model.invalidBudgetNumber'))
            return
          }
        }

        const updatedModel = {
          ...typedModel,
          thinking: {
            enabled: thinkingEnabled,
            control_mode: controlMode,
            thinking_level:
              controlMode === 'level'
                ? (thinkingLevel as 'minimal' | 'low' | 'medium' | 'high')
                : undefined,
            thinking_budget:
              controlMode === 'budget' ? parsedBudget : undefined,
            include_thoughts: includeThoughts,
          },
        }

        const validationResult = chatModelSchema.safeParse(updatedModel)
        if (!validationResult.success) {
          new Notice(
            validationResult.error.issues.map((v) => v.message).join('\n'),
          )
          return
        }

        await plugin.setSettings({
          ...plugin.settings,
          chatModels: plugin.settings.chatModels.map((m) =>
            m.id === model.id ? updatedModel : m,
          ),
        })
        onClose()
      }

      return (
        <>
          <ObsidianSetting
            name={t('settings:modelOptions.gemini.thinkingSettings.name')}
            desc={t('settings:modelOptions.gemini.thinkingSettings.desc')}
          >
            <ObsidianToggle
              value={thinkingEnabled}
              onChange={(value: boolean) => setThinkingEnabled(value)}
            />
          </ObsidianSetting>
          {thinkingEnabled && (
            <>
              <ObsidianSetting
                name={t('settings:modelOptions.gemini.controlMode.name')}
                desc={t('settings:modelOptions.gemini.controlMode.desc')}
                className="cc-setting-item--nested"
              >
                <ObsidianDropdown
                  value={controlMode}
                  options={{
                    level: t('settings:modelOptions.gemini.controlMode.level'),
                    budget: t(
                      'settings:modelOptions.gemini.controlMode.budget',
                    ),
                  }}
                  onChange={(value: string) =>
                    setControlMode(value as 'level' | 'budget')
                  }
                />
              </ObsidianSetting>
              {controlMode === 'level' && (
                <ObsidianSetting
                  name={t('settings:modelOptions.gemini.thinkingLevel.name')}
                  desc={t('settings:modelOptions.gemini.thinkingLevel.desc')}
                  className="cc-setting-item--nested"
                >
                  <ObsidianDropdown
                    value={thinkingLevel}
                    options={{
                      minimal: 'minimal',
                      low: 'low',
                      medium: 'medium',
                      high: 'high',
                    }}
                    onChange={(value: string) => setThinkingLevel(value)}
                  />
                </ObsidianSetting>
              )}
              {controlMode === 'budget' && (
                <ObsidianSetting
                  name={t('settings:modelOptions.gemini.thinkingBudget.name')}
                  desc={t('settings:modelOptions.gemini.thinkingBudget.desc')}
                  className="cc-setting-item--nested"
                >
                  <ObsidianTextInput
                    value={thinkingBudget}
                    placeholder={t(
                      'settings:modelOptions.gemini.thinkingBudget.placeholder',
                    )}
                    onChange={(value: string) => setThinkingBudget(value)}
                    type="number"
                  />
                </ObsidianSetting>
              )}
              <ObsidianSetting
                name={t('settings:modelOptions.gemini.includeThoughts.name')}
                desc={t('settings:modelOptions.gemini.includeThoughts.desc')}
                className="cc-setting-item--nested"
              >
                <ObsidianToggle
                  value={includeThoughts}
                  onChange={(value: boolean) => setIncludeThoughts(value)}
                />
              </ObsidianSetting>
            </>
          )}

          <ObsidianSetting>
            <ObsidianButton
              text={t('modal:addProvider.save')}
              onClick={handleSubmit}
              cta
            />
            <ObsidianButton
              text={t('modal:addProvider.cancel')}
              onClick={onClose}
            />
          </ObsidianSetting>
        </>
      )
    },
  },

  // Perplexity settings
  {
    check: (model) =>
      model.providerType === 'perplexity' &&
      [
        'sonar',
        'sonar-pro',
        'sonar-deep-research',
        'sonar-reasoning',
        'sonar-reasoning-pro',
      ].includes(model.model),

    SettingsComponent: (props: SettingsComponentProps) => {
      const { t } = useTranslation(['settings', 'modal', 'error'])
      const { model, plugin, onClose } = props
      const typedModel = model as ChatModel & { providerType: 'perplexity' }
      const [searchContextSize, setSearchContextSize] = useState(
        typedModel.web_search_options?.search_context_size ?? 'low',
      )

      const handleSubmit = async () => {
        if (!['low', 'medium', 'high'].includes(searchContextSize)) {
          new Notice(t('error:searchContextSizeInvalid'))
          return
        }

        const updatedModel = {
          ...typedModel,
          web_search_options: {
            ...typedModel.web_search_options,
            search_context_size: searchContextSize,
          },
        }
        await plugin.setSettings({
          ...plugin.settings,
          chatModels: plugin.settings.chatModels.map((m) =>
            m.id === model.id ? updatedModel : m,
          ),
        })
        onClose()
      }

      return (
        <>
          <ObsidianSetting
            name={t('settings:modelOptions.perplexity.searchContextSize.name')}
            desc={t('settings:modelOptions.perplexity.searchContextSize.desc')}
          >
            <ObsidianDropdown
              value={searchContextSize}
              options={{
                low: 'low',
                medium: 'medium',
                high: 'high',
              }}
              onChange={(value: string) => setSearchContextSize(value)}
            />
          </ObsidianSetting>

          <ObsidianSetting>
            <ObsidianButton
              text={t('modal:addProvider.save')}
              onClick={handleSubmit}
              cta
            />
            <ObsidianButton
              text={t('modal:addProvider.cancel')}
              onClick={onClose}
            />
          </ObsidianSetting>
        </>
      )
    },
  },
]

function getModelSettings(model: ChatModel): ModelSettingsRegistry | undefined {
  return MODEL_SETTINGS_REGISTRY.find((registry) => registry.check(model))
}

export function hasChatModelSettings(model: ChatModel): boolean {
  return !!getModelSettings(model)
}
