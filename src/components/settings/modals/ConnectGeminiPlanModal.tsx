import { App, Notice } from 'obsidian'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import {
  buildGeminiAuthorizeUrl,
  exchangeGeminiCodeForTokens,
  generateGeminiPkce,
  generateGeminiState,
  startGeminiCallbackServer,
  stopGeminiCallbackServer,
} from '../../../core/llm/geminiAuth'
import { t as tFn } from '../../../i18n'
import SmartComposerPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ReactModal } from '../../common/ReactModal'

type ConnectGeminiPlanModalProps = {
  plugin: SmartComposerPlugin
  onClose: () => void
}

const GEMINI_PLAN_PROVIDER_ID = PROVIDER_TYPES_INFO['gemini-plan']
  .defaultProviderId as string

export class ConnectGeminiPlanModal extends ReactModal<ConnectGeminiPlanModalProps> {
  constructor(app: App, plugin: SmartComposerPlugin) {
    super({
      app: app,
      Component: ConnectGeminiPlanModalComponent,
      props: { plugin },
      options: {
        title: tFn('modal:connectGeminiPlan.title'),
      },
    })
  }
}

function ConnectGeminiPlanModalComponent({
  plugin,
  onClose,
}: ConnectGeminiPlanModalProps) {
  const { t } = useTranslation(['modal', 'notice'])
  const extractParamFromRedirectUrl = (input: string, key: string) => {
    const trimmed = input.trim()
    if (!trimmed) return ''
    try {
      const parsed = new URL(trimmed)
      return parsed.searchParams.get(key) ?? ''
    } catch {
      const match = trimmed.match(new RegExp(`[?&]${key}=([^&]+)`))
      if (match?.[1]) return decodeURIComponent(match[1])
      return ''
    }
  }
  const extractCodeFromRedirectUrl = (input: string) =>
    extractParamFromRedirectUrl(input, 'code')
  const extractStateFromRedirectUrl = (input: string) =>
    extractParamFromRedirectUrl(input, 'state')

  const [authorizeUrl, setAuthorizeUrl] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [pkceVerifier, setPkceVerifier] = useState('')
  const [state, setState] = useState('')
  const [isWaitingForCallback, setIsWaitingForCallback] = useState(false)
  const [isManualConnecting, setIsManualConnecting] = useState(false)
  const [autoError, setAutoError] = useState('')
  const [manualError, setManualError] = useState('')

  const redirectCode = extractCodeFromRedirectUrl(redirectUrl)
  const redirectState = extractStateFromRedirectUrl(redirectUrl)
  const isBusy = isWaitingForCallback || isManualConnecting

  useEffect(() => {
    return () => {
      void stopGeminiCallbackServer()
    }
  }, [])

  const applyTokens = async (
    tokens: Awaited<ReturnType<typeof exchangeGeminiCodeForTokens>>,
  ) => {
    if (
      !plugin.settings.providers.find(
        (p) => p.type === 'gemini-plan' && p.id === GEMINI_PLAN_PROVIDER_ID,
      )
    ) {
      throw new Error(t('modal:connectGeminiPlan.providerNotFound'))
    }
    await plugin.setSettings({
      ...plugin.settings,
      providers: plugin.settings.providers.map((p) => {
        if (p.type === 'gemini-plan' && p.id === GEMINI_PLAN_PROVIDER_ID) {
          return {
            ...p,
            oauth: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
              email: tokens.email,
            },
          }
        }
        return p
      }),
    })
  }

  const ensureAuthContext = async () => {
    if (authorizeUrl && pkceVerifier && state) return
    const pkce = await generateGeminiPkce()
    const newState = generateGeminiState()
    const url = buildGeminiAuthorizeUrl({ pkce, state: newState })
    setPkceVerifier(pkce.verifier)
    setState(newState)
    setAuthorizeUrl(url)
    return { pkceVerifier: pkce.verifier, state: newState, authorizeUrl: url }
  }

  const openLogin = async () => {
    if (isBusy) return
    setAutoError('')
    setManualError('')

    const ensured = await ensureAuthContext()
    const effectiveAuthorizeUrl = ensured?.authorizeUrl ?? authorizeUrl
    const effectivePkceVerifier = ensured?.pkceVerifier ?? pkceVerifier
    const effectiveState = ensured?.state ?? state

    if (!effectiveAuthorizeUrl || !effectivePkceVerifier || !effectiveState) {
      new Notice(t('notice:oauth.initFailed'))
      return
    }

    window.open(effectiveAuthorizeUrl, '_blank')
    setIsWaitingForCallback(true)

    try {
      const callbackCode = await startGeminiCallbackServer({
        state: effectiveState,
      })
      const tokens = await exchangeGeminiCodeForTokens({
        code: callbackCode,
        pkceVerifier: effectivePkceVerifier,
      })
      await applyTokens(tokens)
      new Notice(t('notice:oauth.geminiConnected'))
      onClose()
    } catch {
      setAutoError(t('modal:connectGeminiPlan.errors.autoFailed'))
    } finally {
      setIsWaitingForCallback(false)
    }
  }

  const connectWithRedirectUrl = async () => {
    if (isBusy) return
    setAutoError('')

    if (!redirectUrl.trim()) {
      setManualError(t('modal:connectGeminiPlan.errors.redirectMissing'))
      return
    }

    if (!redirectCode) {
      setManualError(t('modal:connectGeminiPlan.errors.codeMissing'))
      return
    }

    if (!redirectState) {
      setManualError(t('modal:connectGeminiPlan.errors.stateMissing'))
      return
    }

    setManualError('')
    setIsManualConnecting(true)

    try {
      const hasRedirectState = Boolean(redirectState)
      const ensured = hasRedirectState ? undefined : await ensureAuthContext()
      const effectivePkceVerifier = ensured?.pkceVerifier ?? pkceVerifier
      const effectiveState = redirectState ?? ensured?.state ?? state
      if (!effectivePkceVerifier) {
        setManualError(t('modal:connectGeminiPlan.errors.loginFirst'))
        return
      }
      if (!effectiveState) {
        new Notice(t('notice:oauth.initFailed'))
        return
      }
      if (redirectState && state && redirectState !== state) {
        setManualError(t('modal:connectGeminiPlan.errors.stateMismatch'))
        return
      }
      const tokens = await exchangeGeminiCodeForTokens({
        code: redirectCode,
        pkceVerifier: effectivePkceVerifier,
      })
      await applyTokens(tokens)
      new Notice(t('notice:oauth.geminiConnected'))
      onClose()
    } catch {
      setManualError(t('modal:connectGeminiPlan.errors.manualFailed'))
    } finally {
      setIsManualConnecting(false)
    }
  }

  return (
    <div>
      <div className="cc-plan-connect-steps">
        <div className="cc-plan-connect-steps-title">
          {t('modal:connectPlan.howItWorks')}
        </div>
        <ol>
          <li>{t('modal:connectGeminiPlan.steps.step1')}</li>
          <li>{t('modal:connectGeminiPlan.steps.step2')}</li>
          <li>{t('modal:connectGeminiPlan.steps.step3')}</li>
        </ol>
      </div>

      <ObsidianSetting
        name={t('modal:connectGeminiPlan.loginName')}
        desc={t('modal:connectGeminiPlan.loginDesc')}
      >
        <ObsidianButton
          text={t('modal:connectGeminiPlan.loginButton')}
          disabled={isBusy}
          onClick={() => void openLogin()}
          cta
        />
        {isWaitingForCallback && (
          <div className="cc-plan-connect-waiting">
            <div className="cc-plan-connect-waiting-content">
              <div className="cc-plan-connect-waiting-spinner" />
              <div className="cc-plan-connect-waiting-text">
                <strong>{t('modal:connectGeminiPlan.waitingTitle')}</strong>
                <span>{t('modal:connectGeminiPlan.waitingBody')}</span>
              </div>
            </div>
          </div>
        )}
      </ObsidianSetting>

      <ObsidianSetting
        name={t('modal:connectGeminiPlan.fallbackName')}
        desc={t('modal:connectGeminiPlan.fallbackDesc')}
        className="cc-plan-connect-fallback"
      >
        <div className="cc-plan-connect-fallback-controls">
          {autoError && (
            <div className="cc-plan-connect-error">{autoError}</div>
          )}
          <ObsidianTextInput
            value={redirectUrl}
            placeholder={t('modal:connectGeminiPlan.fallbackPlaceholder')}
            onChange={(value) => {
              setRedirectUrl(value)
              if (manualError) setManualError('')
            }}
          />
          <ObsidianButton
            text={t('modal:connectGeminiPlan.fallbackButton')}
            disabled={!redirectCode || isBusy}
            onClick={() => void connectWithRedirectUrl()}
          />
          {manualError && (
            <div className="cc-plan-connect-error">{manualError}</div>
          )}
        </div>
      </ObsidianSetting>

      <ObsidianSetting>
        <ObsidianButton text={t('modal:connectPlan.cancel')} onClick={onClose} />
      </ObsidianSetting>
    </div>
  )
}
