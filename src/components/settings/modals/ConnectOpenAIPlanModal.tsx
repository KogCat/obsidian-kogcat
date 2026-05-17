import { App, Notice } from 'obsidian'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import {
  buildCodexAuthorizeUrl,
  exchangeCodexCodeForTokens,
  extractCodexAccountId,
  generateCodexPkce,
  generateCodexState,
  startCodexCallbackServer,
  stopCodexCallbackServer,
} from '../../../core/llm/codexAuth'
import { t as tFn } from '../../../i18n'
import SmartComposerPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ReactModal } from '../../common/ReactModal'

type ConnectOpenAIPlanModalProps = {
  plugin: SmartComposerPlugin
  onClose: () => void
}

const OPENAI_PLAN_PROVIDER_ID = PROVIDER_TYPES_INFO['openai-plan']
  .defaultProviderId as string

export class ConnectOpenAIPlanModal extends ReactModal<ConnectOpenAIPlanModalProps> {
  constructor(app: App, plugin: SmartComposerPlugin) {
    super({
      app: app,
      Component: ConnectOpenAIPlanModalComponent,
      props: { plugin },
      options: {
        title: tFn('modal:connectOpenAIPlan.title'),
      },
    })
  }
}

function ConnectOpenAIPlanModalComponent({
  plugin,
  onClose,
}: ConnectOpenAIPlanModalProps) {
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
      void stopCodexCallbackServer()
    }
  }, [])

  const applyTokens = async (
    tokens: Awaited<ReturnType<typeof exchangeCodexCodeForTokens>>,
  ) => {
    const accountId = extractCodexAccountId(tokens)

    if (
      !plugin.settings.providers.find(
        (p) => p.type === 'openai-plan' && p.id === OPENAI_PLAN_PROVIDER_ID,
      )
    ) {
      throw new Error(t('modal:connectOpenAIPlan.providerNotFound'))
    }
    await plugin.setSettings({
      ...plugin.settings,
      providers: plugin.settings.providers.map((p) => {
        if (p.type === 'openai-plan' && p.id === OPENAI_PLAN_PROVIDER_ID) {
          return {
            ...p,
            oauth: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
              accountId,
            },
          }
        }
        return p
      }),
    })
  }

  const ensureAuthContext = async () => {
    if (authorizeUrl && pkceVerifier && state) return
    const pkce = await generateCodexPkce()
    const newState = generateCodexState()
    const url = buildCodexAuthorizeUrl({ pkce, state: newState })
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
      const callbackCode = await startCodexCallbackServer({
        state: effectiveState,
      })
      const tokens = await exchangeCodexCodeForTokens({
        code: callbackCode,
        pkceVerifier: effectivePkceVerifier,
      })
      await applyTokens(tokens)
      new Notice(t('notice:oauth.openaiConnected'))
      onClose()
    } catch {
      setAutoError(t('modal:connectOpenAIPlan.errors.autoFailed'))
    } finally {
      setIsWaitingForCallback(false)
    }
  }

  const connectWithRedirectUrl = async () => {
    if (isBusy) return
    setAutoError('')

    if (!redirectUrl.trim()) {
      setManualError(t('modal:connectOpenAIPlan.errors.redirectMissing'))
      return
    }

    if (!redirectCode) {
      setManualError(t('modal:connectOpenAIPlan.errors.codeMissing'))
      return
    }

    if (!redirectState) {
      setManualError(t('modal:connectOpenAIPlan.errors.stateMissing'))
      return
    }

    setManualError('')
    setIsManualConnecting(true)

    try {
      const ensured = await ensureAuthContext()
      const effectivePkceVerifier = ensured?.pkceVerifier ?? pkceVerifier
      const effectiveState = ensured?.state ?? state
      if (!effectivePkceVerifier || !effectiveState) {
        new Notice(t('notice:oauth.initFailed'))
        return
      }
      if (redirectState !== effectiveState) {
        setManualError(t('modal:connectOpenAIPlan.errors.stateMismatch'))
        return
      }
      const tokens = await exchangeCodexCodeForTokens({
        code: redirectCode,
        pkceVerifier: effectivePkceVerifier,
      })
      await applyTokens(tokens)
      new Notice(t('notice:oauth.openaiConnected'))
      onClose()
    } catch {
      setManualError(t('modal:connectOpenAIPlan.errors.manualFailed'))
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
          <li>{t('modal:connectOpenAIPlan.steps.step1')}</li>
          <li>{t('modal:connectOpenAIPlan.steps.step2')}</li>
          <li>{t('modal:connectOpenAIPlan.steps.step3')}</li>
        </ol>
      </div>

      <ObsidianSetting
        name={t('modal:connectOpenAIPlan.loginName')}
        desc={t('modal:connectOpenAIPlan.loginDesc')}
      >
        <ObsidianButton
          text={t('modal:connectOpenAIPlan.loginButton')}
          disabled={isBusy}
          onClick={() => void openLogin()}
          cta
        />
        {isWaitingForCallback && (
          <div className="cc-plan-connect-waiting">
            <div className="cc-plan-connect-waiting-content">
              <div className="cc-plan-connect-waiting-spinner" />
              <div className="cc-plan-connect-waiting-text">
                <strong>{t('modal:connectOpenAIPlan.waitingTitle')}</strong>
                <span>{t('modal:connectOpenAIPlan.waitingBody')}</span>
              </div>
            </div>
          </div>
        )}
      </ObsidianSetting>

      <ObsidianSetting
        name={t('modal:connectOpenAIPlan.fallbackName')}
        desc={t('modal:connectOpenAIPlan.fallbackDesc')}
        className="cc-plan-connect-fallback"
      >
        <div className="cc-plan-connect-fallback-controls">
          {autoError && (
            <div className="cc-plan-connect-error">{autoError}</div>
          )}
          <ObsidianTextInput
            value={redirectUrl}
            placeholder={t('modal:connectOpenAIPlan.fallbackPlaceholder')}
            onChange={(value) => {
              setRedirectUrl(value)
              if (manualError) setManualError('')
            }}
          />
          <ObsidianButton
            text={t('modal:connectOpenAIPlan.fallbackButton')}
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
