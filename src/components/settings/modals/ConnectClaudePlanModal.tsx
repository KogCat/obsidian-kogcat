import { App, Notice } from 'obsidian'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import {
  buildClaudeCodeAuthorizeUrl,
  exchangeClaudeCodeForTokens,
  generateClaudeCodePkce,
  generateClaudeCodeState,
} from '../../../core/llm/claudeCodeAuth'
import { t as tFn } from '../../../i18n'
import SmartComposerPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ReactModal } from '../../common/ReactModal'

type ConnectClaudePlanModalProps = {
  plugin: SmartComposerPlugin
  onClose: () => void
}

const CLAUDE_PLAN_PROVIDER_ID = PROVIDER_TYPES_INFO['anthropic-plan']
  .defaultProviderId as string

export class ConnectClaudePlanModal extends ReactModal<ConnectClaudePlanModalProps> {
  constructor(app: App, plugin: SmartComposerPlugin) {
    super({
      app: app,
      Component: ConnectClaudePlanModalComponent,
      props: { plugin },
      options: {
        title: tFn('modal:connectClaudePlan.title'),
      },
    })
  }
}

function ConnectClaudePlanModalComponent({
  plugin,
  onClose,
}: ConnectClaudePlanModalProps) {
  const { t } = useTranslation(['modal', 'notice'])
  const [authorizeUrl, setAuthorizeUrl] = useState('')
  const [code, setCode] = useState('')
  const [pkceVerifier, setPkceVerifier] = useState('')
  const [state, setState] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)

  const hasAuthData = authorizeUrl.length > 0 && pkceVerifier.length > 0

  useEffect(() => {
    ;(async () => {
      try {
        const pkce = await generateClaudeCodePkce()
        const newState = generateClaudeCodeState()
        const url = buildClaudeCodeAuthorizeUrl({ pkce, state: newState })
        setPkceVerifier(pkce.verifier)
        setState(newState)
        setAuthorizeUrl(url)
      } catch {
        new Notice(tFn('notice:oauth.initFailed'))
      }
    })()
  }, [])

  const connect = async () => {
    if (isConnecting) return
    if (!hasAuthData) {
      new Notice(t('notice:oauth.linkNotReady'))
      return
    }
    if (!code) {
      new Notice(t('notice:oauth.pasteCode'))
      return
    }

    try {
      setIsConnecting(true)

      const tokens = await exchangeClaudeCodeForTokens({
        code,
        pkceVerifier,
        state,
      })

      if (
        !plugin.settings.providers.find(
          (p) =>
            p.type === 'anthropic-plan' && p.id === CLAUDE_PLAN_PROVIDER_ID,
        )
      ) {
        throw new Error(t('modal:connectClaudePlan.providerNotFound'))
      }
      await plugin.setSettings({
        ...plugin.settings,
        providers: plugin.settings.providers.map((p) => {
          if (p.type === 'anthropic-plan' && p.id === CLAUDE_PLAN_PROVIDER_ID) {
            return {
              ...p,
              oauth: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
              },
            }
          }
          return p
        }),
      })

      new Notice(t('notice:oauth.claudeConnected'))
      onClose()
    } catch {
      new Notice(t('notice:oauth.failed'))
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div>
      <div className="cc-plan-connect-steps">
        <div className="cc-plan-connect-steps-title">
          {t('modal:connectPlan.howItWorks')}
        </div>
        <ol>
          <li>{t('modal:connectPlan.step1')}</li>
          <li>{t('modal:connectPlan.step2')}</li>
          <li>{t('modal:connectPlan.step3')}</li>
        </ol>
      </div>

      <ObsidianSetting
        name={t('modal:connectPlan.loginField.name', { provider: 'Claude' })}
        desc={t('modal:connectPlan.loginField.desc', { provider: 'Claude' })}
      >
        <ObsidianButton
          text={t('modal:connectPlan.loginButton', { provider: 'Claude' })}
          disabled={!authorizeUrl || isConnecting}
          onClick={() => {
            if (!authorizeUrl) return
            window.open(authorizeUrl, '_blank')
          }}
          cta
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('modal:connectPlan.codeField.name')}
        desc={t('modal:connectPlan.codeField.desc')}
        required
      >
        <ObsidianTextInput
          value={code}
          placeholder={t('modal:connectPlan.codeField.placeholder')}
          onChange={(value) => setCode(value)}
        />
      </ObsidianSetting>

      <ObsidianSetting>
        <ObsidianButton
          text={t('modal:connectPlan.submit')}
          onClick={() => void connect()}
          disabled={isConnecting}
          cta
        />
        <ObsidianButton
          text={t('modal:connectPlan.cancel')}
          onClick={onClose}
          disabled={isConnecting}
        />
      </ObsidianSetting>
    </div>
  )
}
