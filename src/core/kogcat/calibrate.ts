import { OmCoreAuth, describeAuth, requestOmCore } from '../om-core/transport'

// KogCat /v1/calibrate client (v25+: directive shape).

export type CalibrationPlacement = 'front' | 'inline' | 'suffix' | 'none'

export type CalibrationInlineRef = {
  title: string
  stable_id?: string | null
}

export type CalibrationDirective = {
  should_emit: boolean
  placement: CalibrationPlacement
  phrasing: string
  inline_refs: CalibrationInlineRef[]
  user_facing_note?: string | null
  extras?: Record<string, unknown>
}

export type CalibrationResult = {
  directive: CalibrationDirective
  debug?: Record<string, unknown> | null
}

export type CalibrateOptions = {
  auth: OmCoreAuth
  text: string
  source: 'chat_response' | 'vault_selection' | 'chat_share'
  topK?: number
  timeoutMs?: number
}

export async function calibrate(
  opts: CalibrateOptions,
): Promise<CalibrationResult | null> {
  const { auth, text, source, topK = 5, timeoutMs = 30000 } = opts

  // Race against a timer to bound latency without blocking chat. Timer
  // handle is cleared once the fetcher resolves so test runs don't leave
  // a dangling timeout in the event loop.
  let timerId: ReturnType<typeof setTimeout> | null = null
  const timer = new Promise<null>((resolve) => {
    timerId = setTimeout(() => resolve(null), timeoutMs)
  })
  const fetcher = (async () => {
    const t0 = Date.now()
    console.log(
      '[KogCat] requestOmCore POST',
      `${describeAuth(auth)}/v1/calibrate`,
      'textLen=',
      text.length,
    )
    try {
      const res = await requestOmCore(auth, {
        method: 'POST',
        path: '/v1/calibrate',
        body: JSON.stringify({ text, top_k: topK, source: { kind: source } }),
        timeoutMs,
      })
      console.log(
        '[KogCat] requestOmCore returned in',
        Date.now() - t0,
        'ms status=',
        res.status,
        'jsonType=',
        typeof res.json,
      )
      if (res.status >= 200 && res.status < 300) {
        return res.json as CalibrationResult
      }
      console.log('[KogCat] non-2xx response body:', res.text?.slice(0, 500))
      return null
    } catch (e) {
      console.log('[KogCat] requestOmCore threw after', Date.now() - t0, 'ms:', e)
      return null
    }
  })()

  try {
    return await Promise.race([fetcher, timer])
  } finally {
    if (timerId !== null) clearTimeout(timerId)
  }
}

// Routes the directive into one of three UX bins. The server commits to:
//   • !should_emit                                      → idle
//   • placement === 'suffix'                            → gap notice
//   • placement === 'front' && extras.primary_mode==='kb' → KB-primary answer
//   • everything else (front/inline with should_emit)   → advisor rewrite

export function directiveTriggersRewrite(d: CalibrationDirective): boolean {
  if (!d.should_emit) return false
  if (d.placement !== 'front' && d.placement !== 'inline') return false
  if (d.placement === 'front' && d.extras?.primary_mode === 'kb') return false
  return true
}

export function directiveIsIdle(d: CalibrationDirective): boolean {
  return !d.should_emit
}
