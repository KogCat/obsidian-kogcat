import { useCallback, useMemo, useRef, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { useSettings } from '../../contexts/settings-context'
import {
  type CalibrationResult,
  calibrate,
  directiveTriggersRewrite,
} from '../../core/kogcat/calibrate'
import { recordCalibrationObservation } from '../../core/kogcat/memory-feedback'
import { PromptCache } from '../../core/kogcat/prompts'
import {
  type KogCatAnswerMode,
  rewriteResponse,
} from '../../core/kogcat/rewrite'
import { getChatModelClient } from '../../core/llm/manager'
import { OmCoreAuth } from '../../core/om-core/lifecycle'
import { ensureLlmConsent } from '../modals/PrivacyConsentModal'

import { CogCalibrationView } from './CogCalibrationStatus'

// Per-message calibration runtime state (spec §3.1).
// Stores both the original LLM response and the KogCat advisor response so
// Quick Answer can keep R stable while Advisor Answer can make KogCat primary.
export type KogCatMessageState = {
  view: CogCalibrationView
  showAdvisor: boolean
  // Cached so AssistantMessageContent can render the right primary answer
  // without re-running the advisor generation.
  original: string | null
  advisorAnswer: string | null
  calibration: CalibrationResult | null
}

export type KogCatCalibrationManager = {
  states: Map<string, KogCatMessageState>
  toggleAdvisor: (messageId: string) => void
  startCalibration: (params: {
    messageId: string
    responseText: string
  }) => Promise<void>
  reset: (messageId: string) => void
}

const DEFAULT_STATE: KogCatMessageState = {
  view: { kind: 'idle' },
  showAdvisor: false,
  original: null,
  advisorAnswer: null,
  calibration: null,
}

export function useKogCatCalibration(args: {
  promptCache: PromptCache | null
  // Resolved fresh on every calibration call so a lifecycle restart picks up
  // the new port + token without remounting the chat view.
  getAuth: () => OmCoreAuth | null
}): KogCatCalibrationManager {
  const { promptCache } = args
  const app = useApp()
  const { settings, setSettings } = useSettings()
  const [states, setStates] = useState<Map<string, KogCatMessageState>>(
    () => new Map(),
  )
  const inFlight = useRef<Map<string, AbortController>>(new Map())

  const update = useCallback(
    (id: string, patch: Partial<KogCatMessageState>) => {
      setStates((prev) => {
        const next = new Map(prev)
        const cur = next.get(id) ?? DEFAULT_STATE
        next.set(id, { ...cur, ...patch })
        return next
      })
    },
    [],
  )

  const toggleAdvisor = useCallback(
    (id: string) => {
      setStates((prev) => {
        const next = new Map(prev)
        const cur = next.get(id)
        if (!cur) return prev
        next.set(id, { ...cur, showAdvisor: !cur.showAdvisor })
        return next
      })
    },
    [],
  )

  const reset = useCallback((id: string) => {
    inFlight.current.get(id)?.abort()
    inFlight.current.delete(id)
    setStates((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const startCalibration = useCallback(
    async ({
      messageId,
      responseText,
    }: {
      messageId: string
      responseText: string
    }) => {
      console.log('[KogCat] startCalibration called', { messageId, responseTextLen: responseText?.length, kogcatEnabled: settings.kogcatEnabled })
      if (!settings.kogcatEnabled) { console.log('[KogCat] EXIT: kogcatEnabled=false'); return }
      if (!responseText || responseText.trim().length === 0) { console.log('[KogCat] EXIT: empty responseText'); return }

      // Cancel any prior calibration for this message (e.g. on regenerate).
      inFlight.current.get(messageId)?.abort()
      const ac = new AbortController()
      inFlight.current.set(messageId, ac)

      update(messageId, {
        view: { kind: 'calibrating' },
        original: responseText,
        advisorAnswer: null,
        showAdvisor: false,
      })

      const auth = args.getAuth()
      console.log(
        '[KogCat] auth:',
        auth ? `OK ${auth.transport}:${auth.target}` : 'NULL',
      )
      if (!auth) {
        // om-core not ready (still booting / failed to start). Silent skip
        // per §3.1 boundary table — same UX as a network failure below.
        update(messageId, { view: { kind: 'idle' } })
        return
      }
      console.log('[KogCat] calling calibrate API...')
      const result = await calibrate({
        auth,
        text: responseText,
        source: 'chat_response',
      })
      console.log(
        '[KogCat] calibrate result:',
        result
          ? `placement=${result.directive.placement} emit=${result.directive.should_emit} refs=${result.directive.inline_refs.length}`
          : 'NULL',
      )

      if (ac.signal.aborted) return

      // Network failure / timeout — silent skip per §3.1 boundary table.
      if (!result) {
        update(messageId, { view: { kind: 'idle' } })
        return
      }

      update(messageId, { calibration: result })

      // Fire-and-forget: accumulate calibration trace in shared om-core memory.
      // Non-null stances only; failures are swallowed inside the recorder.
      void recordCalibrationObservation({
        auth,
        result,
        source: 'chat_response',
      })

      if (!shouldComposeKogcatAdvisor(result, settings.kogcatAnswerMode)) {
        update(messageId, { view: getPassiveCalibrationView(result) })
        return
      }

      if (!promptCache || settings.chatModels.length === 0) {
        update(messageId, { view: { kind: 'unavailable_no_llm' } })
        return
      }

      // §4 / P1 #18 — first advisor answer triggers consent. Decline silently leaves
      // the original R visible (per §9.5 calibration failure shouldn't break chat).
      const consented = await ensureLlmConsent({
        app,
        consented: settings.kogcatLlmConsented,
        setConsented: async (value) => {
          await setSettings({ ...settings, kogcatLlmConsented: value })
        },
      })
      if (ac.signal.aborted) return
      if (!consented) {
        update(messageId, { view: { kind: 'idle' } })
        return
      }

      let providerClient
      let model
      try {
        const lookup = getChatModelClient({
          modelId: settings.chatModelId,
          settings,
          setSettings,
        })
        providerClient = lookup.providerClient
        model = lookup.model
      } catch (_e) {
        update(messageId, { view: { kind: 'unavailable_no_llm' } })
        return
      }

      update(messageId, { view: { kind: 'composing_advisor' } })

      const outcome = await rewriteResponse({
        originalResponse: responseText,
        calibration: result,
        answerMode: settings.kogcatAnswerMode,
        promptCache,
        providerClient,
        model,
        abortSignal: ac.signal,
        onDelta: (chunk) => {
          if (ac.signal.aborted) return
          setStates((prev) => {
            const next = new Map(prev)
            const cur = next.get(messageId) ?? DEFAULT_STATE
            next.set(messageId, {
              ...cur,
              advisorAnswer: (cur.advisorAnswer ?? '') + chunk,
            })
            return next
          })
        },
      })

      if (ac.signal.aborted) return

      if (outcome.kind === 'ok') {
        const advisorAnswer = outcome.text
        update(
          messageId,
          settings.kogcatAnswerMode === 'advisor'
            ? {
                view: { kind: 'advisor_primary', advisorAnswer },
                advisorAnswer,
                showAdvisor: true,
              }
            : {
                view: {
                  kind: 'advisor',
                  intensity: advisorIntensity(result),
                  advisorAnswer,
                },
                advisorAnswer,
                showAdvisor: false,
              },
        )
      } else if (outcome.kind === 'no_prompt') {
        update(messageId, {
          view: { kind: 'failed', message: 'advisor prompt unavailable' },
        })
      } else {
        update(messageId, {
          view: { kind: 'failed', message: outcome.message },
        })
      }
    },
    [app, settings, setSettings, promptCache, update],
  )

  return useMemo(
    () => ({ states, toggleAdvisor, startCalibration, reset }),
    [states, toggleAdvisor, startCalibration, reset],
  )
}

function advisorIntensity(result: CalibrationResult): 'supplement' | 'caution' {
  // placement=front is the server's strongest signal (replaces old warn
  // stance), so map it to caution; inline stays as supplement.
  return result.directive.placement === 'front' ? 'caution' : 'supplement'
}

export function shouldComposeKogcatAdvisor(
  result: CalibrationResult,
  answerMode: KogCatAnswerMode,
): boolean {
  return answerMode === 'advisor' || directiveTriggersRewrite(result.directive)
}

export function getPassiveCalibrationView(
  result: CalibrationResult,
): CogCalibrationView {
  const d = result.directive
  if (!d.should_emit) return { kind: 'checked' }
  if (d.placement === 'suffix') return { kind: 'flag_gap' }
  if (d.placement === 'front' && d.extras?.primary_mode === 'kb') {
    return { kind: 'reinforce' }
  }
  return { kind: 'idle' }
}
