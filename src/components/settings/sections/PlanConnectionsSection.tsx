import { Check, CircleMinus } from 'lucide-react'
import { App } from 'obsidian'
import { useTranslation } from 'react-i18next'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import SmartComposerPlugin from '../../../main'
import { LLMProvider } from '../../../types/provider.types'
import { ConfirmModal } from '../../modals/ConfirmModal'
import { ConnectGeminiPlanModal } from '../modals/ConnectGeminiPlanModal'
import { ConnectOpenAIPlanModal } from '../modals/ConnectOpenAIPlanModal'

type PlanConnectionsSectionProps = {
  app: App
  plugin: SmartComposerPlugin
}

const OPENAI_PLAN_PROVIDER_ID = PROVIDER_TYPES_INFO['openai-plan']
  .defaultProviderId as string
const GEMINI_PLAN_PROVIDER_ID = PROVIDER_TYPES_INFO['gemini-plan']
  .defaultProviderId as string

export function PlanConnectionsSection({
  app,
  plugin,
}: PlanConnectionsSectionProps) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation(['settings', 'modal'])

  const openAIPlanProvider = settings.providers.find(
    (p): p is Extract<LLMProvider, { type: 'openai-plan' }> =>
      p.id === OPENAI_PLAN_PROVIDER_ID && p.type === 'openai-plan',
  )
  const geminiPlanProvider = settings.providers.find(
    (p): p is Extract<LLMProvider, { type: 'gemini-plan' }> =>
      p.id === GEMINI_PLAN_PROVIDER_ID && p.type === 'gemini-plan',
  )

  const isOpenAIConnected = !!openAIPlanProvider?.oauth?.accessToken
  const isGeminiConnected = !!geminiPlanProvider?.oauth?.accessToken

  const disconnect = (providerType: 'openai-plan' | 'gemini-plan') => {
    const providerId =
      providerType === 'openai-plan'
        ? OPENAI_PLAN_PROVIDER_ID
        : GEMINI_PLAN_PROVIDER_ID

    new ConfirmModal(app, {
      title: t('modal:disconnectPlan.title'),
      message:
        providerType === 'openai-plan'
          ? t('modal:disconnectPlan.openai')
          : t('modal:disconnectPlan.gemini'),
      ctaText: t('modal:disconnectPlan.cta'),
      onConfirm: async () => {
        await setSettings({
          ...settings,
          providers: settings.providers.map((p) => {
            if (p.id !== providerId || p.type !== providerType) return p
            return {
              ...p,
              oauth: undefined,
            }
          }),
        })
      },
    }).open()
  }

  return (
    <div className="cc-plan-connections-block">
      <div className="cc-settings-sub-header">
        {t('settings:planConnections.header')}
      </div>

      <div className="cc-settings-desc">
        {t('settings:planConnections.desc')}
      </div>

      <div className="cc-plan-connection-grid">
        <div className="cc-plan-connection-card">
          <div className="cc-plan-connection-card-header">
            <div className="cc-plan-connection-card-title">
              {t('settings:planConnections.openai.title')}
            </div>
            <PlanConnectionStatusBadge connected={isOpenAIConnected} />
          </div>

          <div className="cc-plan-connection-card-desc">
            {t('settings:planConnections.openai.desc')}
            <br />
            <a
              href="https://chatgpt.com/codex/settings/usage"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('settings:planConnections.openai.usageLink')}
            </a>
          </div>

          <div className="cc-plan-connection-card-actions">
            {!isOpenAIConnected && (
              <button
                className="mod-cta"
                onClick={() => new ConnectOpenAIPlanModal(app, plugin).open()}
              >
                {t('settings:planConnections.connect')}
              </button>
            )}
            {isOpenAIConnected && (
              <button onClick={() => disconnect('openai-plan')}>
                {t('settings:planConnections.disconnect')}
              </button>
            )}
          </div>
        </div>

        <div className="cc-plan-connection-card">
          <div className="cc-plan-connection-card-header">
            <div className="cc-plan-connection-card-title">
              {t('settings:planConnections.gemini.title')}
            </div>
            <PlanConnectionStatusBadge connected={isGeminiConnected} />
          </div>

          <div className="cc-plan-connection-card-desc">
            {t('settings:planConnections.gemini.descPrefix')}
            <br />
            {t('settings:planConnections.gemini.descSuffix')}{' '}
            <code>/stats</code>.
          </div>

          <div className="cc-plan-connection-card-actions">
            {!isGeminiConnected && (
              <button
                className="mod-cta"
                onClick={() => new ConnectGeminiPlanModal(app, plugin).open()}
              >
                {t('settings:planConnections.connect')}
              </button>
            )}
            {isGeminiConnected && (
              <button onClick={() => disconnect('gemini-plan')}>
                {t('settings:planConnections.disconnect')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanConnectionStatusBadge({ connected }: { connected: boolean }) {
  const { t } = useTranslation('settings')
  const statusConfig = connected
    ? {
        icon: <Check size={16} />,
        label: t('mcp.status.connected'),
        statusClass: 'cc-mcp-server-status-badge--connected',
      }
    : {
        icon: <CircleMinus size={14} />,
        label: t('mcp.status.disconnected'),
        statusClass: 'cc-mcp-server-status-badge--disconnected',
      }

  return (
    <div className={`cc-mcp-server-status-badge ${statusConfig.statusClass}`}>
      {statusConfig.icon}
      <div className="cc-mcp-server-status-badge-label">
        {statusConfig.label}
      </div>
    </div>
  )
}
