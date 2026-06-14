import { ChatModel } from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'
import { BaseLLMProvider } from '../llm/base'

import {
  CalibrationAnchorCluster,
  CalibrationBridge,
  CalibrationReview,
} from './calibrate'

export type ReviewStance = 'oppose' | 'bridge' | 'reinforce'
export type ThoughtMode = 'capture' | 'summary' | 'claim' | 'action'

export type SynthPoint = {
  stance: ReviewStance
  judgment: string
  why: string
  refs: string[]
}

export type SynthesizedReview = {
  summary: string
  mode: ThoughtMode
  next_step: string
  points: SynthPoint[]
}

const MAX_POINTS = 5
const MAX_SYNTH_WARNINGS = 2
const MAX_SYNTH_BRIDGES = 4
const MAX_SYNTH_REINFORCE = 2
const MAX_SYNTH_SELECTED_CHARS = 1200
const MAX_SYNTH_TEXT_CHARS = 220

function buildSystem(locale: 'zh' | 'en'): string {
  return `Return compact json only. Calibrate the user's thinking against curated KB candidates.

Surface only the points the signal supports, up to ${MAX_POINTS}; fewer when signal is thin, none when nothing bears. Lead with the strongest signal: a strong warning bearing on the user's claim leads as an objection; otherwise, when the thinking holds and reinforce or same-direction bridges back it, lead with grounded agreement. Never manufacture an objection to look critical. Use bridges only when they change how the selected text should be read; reinforce is a first-class point, not a last resort. Do not make a bucket report.

Mode: capture=inbox/log, summary=restates external material, claim=user judgement, action=commitment/task. ${languageDirective(locale)} Be direct, anti-sycophantic, and concrete. No em or en dashes, no bold, no rule-of-three lists, no formulaic closers. Do not mention KB, recall, fields, or implementation. Refs must be titles present in candidates. summary is one short sentence naming the overall shape of the thinking, one level above any single point, and matching the lead point's posture: when objecting, what the thinking leans on and what is missing; when the thinking holds, what makes it sound and the one question still open. Never force a deficiency. It must not restate a point, list the fixes, or paraphrase the selected text. Always provide it. Never restate or paraphrase the selected text back to the user.

OUTPUT: strict JSON only, no prose, no code fence:
{"summary": string, "mode": "capture"|"summary"|"claim"|"action", "next_step": string, "points": [{"stance": "oppose"|"bridge"|"reinforce", "judgment": string, "why": string, "refs": string[]}]}`
}

function buildUserMessage(
  selectedText: string,
  review: CalibrationReview,
): string {
  const pool = compactReviewForSynthesis(review)
  return `SELECTED_TEXT:\n${clipText(selectedText, MAX_SYNTH_SELECTED_CHARS)}\n\nCANDIDATES_JSON:\n${JSON.stringify(pool)}`
}

type CompactReviewCandidate = {
  summary: string
  warnings: {
    kind: string
    anchor: string
    far?: string
    claim?: string
    strength: number
  }[]
  bridges: {
    anchor: string
    near: string
    far: string
    claim: string
    cross_domain: boolean
    tier: number
  }[]
  reinforce: {
    anchor: string
    note: string
  }[]
}

function compactReviewForSynthesis(
  review: CalibrationReview,
): CompactReviewCandidate {
  return {
    summary: clipText(review.summary, MAX_SYNTH_TEXT_CHARS),
    warnings: rankWarningsForPreview(review.warnings)
      .slice(0, MAX_SYNTH_WARNINGS)
      .map((w) => ({
        kind: w.kind,
        anchor: clipText(w.anchor, 80),
        far: w.far ? clipText(w.far, 80) : undefined,
        claim: clipText(w.claim ?? w.note, MAX_SYNTH_TEXT_CHARS),
        strength: warningStrength(w),
      })),
    bridges: selectBridgesForSynthesis(review.clusters).map(
      ({ cluster, b }) => ({
        anchor: clipText(cluster.anchor, 80),
        near: clipText(b.near, 80),
        far: clipText(b.far, 80),
        claim: clipText(b.claim, MAX_SYNTH_TEXT_CHARS),
        cross_domain: b.cross_domain,
        tier: b.tier,
      }),
    ),
    reinforce: review.reinforce.slice(0, MAX_SYNTH_REINFORCE).map((r) => ({
      anchor: clipText(r.anchor, 80),
      note: clipText(r.note, MAX_SYNTH_TEXT_CHARS),
    })),
  }
}

function parseSynth(raw: string): SynthesizedReview | null {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const summary = typeof o.summary === 'string' ? o.summary : ''
  const mode = coerceThoughtMode(o.mode)
  const next_step = typeof o.next_step === 'string' ? o.next_step.trim() : ''
  const rawPoints = Array.isArray(o.points) ? o.points : []
  const points: SynthPoint[] = []
  for (const p of rawPoints) {
    if (!p || typeof p !== 'object') continue
    const r = p as Record<string, unknown>
    const judgment = typeof r.judgment === 'string' ? r.judgment.trim() : ''
    if (!judgment) continue
    points.push({
      stance: coerceStance(r.stance),
      judgment,
      why: typeof r.why === 'string' ? r.why.trim() : '',
      refs: Array.isArray(r.refs)
        ? r.refs.filter((x): x is string => typeof x === 'string' && !!x)
        : [],
    })
    if (points.length >= MAX_POINTS) break
  }
  return { summary, mode, next_step, points }
}

function coerceStance(v: unknown): ReviewStance {
  return v === 'oppose' || v === 'bridge' || v === 'reinforce' ? v : 'bridge'
}

function coerceThoughtMode(v: unknown): ThoughtMode {
  return v === 'capture' || v === 'summary' || v === 'claim' || v === 'action'
    ? v
    : 'claim'
}

export type SynthesizeParams = {
  selectedText: string
  review: CalibrationReview
  providerClient: BaseLLMProvider<LLMProvider>
  model: ChatModel
  abortSignal?: AbortSignal
}

export async function synthesizeReview(
  params: SynthesizeParams,
): Promise<SynthesizedReview | null> {
  const { selectedText, review, providerClient, model, abortSignal } = params
  if (!review.has_signal) {
    const mode = inferThoughtMode(selectedText)
    return {
      summary: review.summary,
      mode,
      next_step: nextStepForMode(mode),
      points: [],
    }
  }
  try {
    const request = {
      model: model.model,
      messages: [
        {
          role: 'system' as const,
          content: buildSystem(inferTextLocale(selectedText)),
        },
        {
          role: 'user' as const,
          content: buildUserMessage(selectedText, review),
        },
      ],
      response_format: { type: 'json_object' as const },
      max_tokens: 1200,
    }
    const res = await tryGenerateReviewSynthesis({
      providerClient,
      model,
      request,
      abortSignal,
    })
    return parseReviewSynthesisResponse(res)
  } catch (error) {
    console.warn('[KogCat] review synthesis failed:', error)
    return null
  }
}

async function tryGenerateReviewSynthesis({
  providerClient,
  model,
  request,
  abortSignal,
}: {
  providerClient: BaseLLMProvider<LLMProvider>
  model: ChatModel
  request: Parameters<BaseLLMProvider<LLMProvider>['generateResponse']>[1]
  abortSignal?: AbortSignal
}) {
  try {
    return await providerClient.generateResponse(model, request, {
      signal: abortSignal,
    })
  } catch (error) {
    console.warn(
      '[KogCat] review synthesis JSON mode failed, retrying plain JSON prompt:',
      error,
    )
    const { response_format: _responseFormat, ...plainRequest } = request
    return providerClient.generateResponse(model, plainRequest, {
      signal: abortSignal,
    })
  }
}

function parseReviewSynthesisResponse(
  res: Awaited<ReturnType<BaseLLMProvider<LLMProvider>['generateResponse']>>,
): SynthesizedReview | null {
  const content = res.choices?.[0]?.message?.content
  const finishReason = res.choices?.[0]?.finish_reason
  if (finishReason === 'length') {
    console.warn('[KogCat] review synthesis truncated')
    return null
  }
  if (typeof content !== 'string' || !content.trim()) {
    console.warn('[KogCat] review synthesis empty content', {
      finishReason,
    })
    return null
  }
  const parsed = parseSynth(content)
  if (!parsed) {
    console.warn('[KogCat] review synthesis invalid JSON', {
      finishReason,
      contentStart: content.slice(0, 300),
    })
  }
  return parsed
}

export function curateReviewDeterministic(
  review: CalibrationReview,
  selectedText = '',
): SynthesizedReview {
  const mode = inferThoughtMode(selectedText)
  const locale = inferTextLocale(selectedText)
  if (!review.has_signal) {
    return {
      summary: review.summary,
      mode,
      next_step: nextStepForMode(mode, locale),
      points: [],
    }
  }
  const points: SynthPoint[] = []

  for (const w of rankWarningsForPreview(review.warnings).slice(0, 3)) {
    const point = warningToPreviewPoint(w, locale)
    if (point) points.push(point)
  }

  if (points.length === 0) {
    for (const b of rankBridges(review.clusters).slice(0, 2)) {
      points.push({
        stance: 'bridge',
        judgment:
          locale === 'zh'
            ? `可用「${b.far}」重新检查这段判断。`
            : `Re-check this judgment through “${b.far}”.`,
        why: b.claim,
        refs: [b.near, b.far].filter((x): x is string => !!x),
      })
    }
  }

  return {
    summary:
      points.length > 0
        ? ''
        : locale === 'zh'
          ? '本地召回有信号,但没有足够清晰的强校准点可展示。'
          : 'Local recall found signals, but none were clear enough to show as strong calibration points.',
    mode,
    next_step: nextStepForMode(mode, locale),
    points: dedupePoints(points).slice(0, 3),
  }
}

function rankWarningsForPreview(
  warnings: CalibrationReview['warnings'],
): CalibrationReview['warnings'] {
  const score = (w: CalibrationReview['warnings'][number]) => {
    const strength = warningStrength(w) * 10
    if (w.kind === 'anti_pattern') return strength + 4
    if (w.kind === 'contradicts') return strength + 3
    if (w.kind === 'open_challenge') return strength + 2
    return strength + 1
  }
  return [...warnings].sort((a, z) => score(z) - score(a))
}

function warningStrength(w: CalibrationReview['warnings'][number]): number {
  return typeof w.strength === 'number' ? w.strength : 0.5
}

function warningToPreviewPoint(
  warning: CalibrationReview['warnings'][number],
  locale: 'zh' | 'en',
): SynthPoint | null {
  const anchor = warning.anchor?.trim()
  if (!anchor) return null

  const refs = [warning.anchor, warning.far].filter((x): x is string => !!x)
  if (warning.kind === 'anti_pattern') {
    return {
      stance: 'oppose',
      judgment:
        locale === 'zh'
          ? `这段可能命中「${anchor}」。`
          : `This may match “${anchor}”.`,
      why:
        warning.claim ??
        (locale === 'zh'
          ? '模型精炼未完成,当前只能先展示本地命中的反模式名称；建议先检查这段判断是否只挑了支持性证据、忽略了反例或退出条件。'
          : 'Model refinement did not finish, so this preview can only show the matched local anti-pattern. First check whether this judgment is selecting supportive evidence while ignoring counterexamples or exit criteria.'),
      refs,
    }
  }

  if (warning.claim) {
    const far = warning.far
      ? locale === 'zh'
        ? `,需要对照「${warning.far}」`
        : ` and should be checked against “${warning.far}”`
      : ''
    return {
      stance: 'oppose',
      judgment:
        locale === 'zh'
          ? `这段判断与「${anchor}」相关${far}。`
          : `This judgment relates to “${anchor}”${far}.`,
      why: warning.claim,
      refs,
    }
  }

  const cleaned = warning.note.replace(/^Kogcat\s*反对（[^）]+）：/i, '').trim()
  if (!cleaned) return null
  return {
    stance: 'oppose',
    judgment: cleaned,
    why: '',
    refs,
  }
}

function dedupePoints(points: SynthPoint[]): SynthPoint[] {
  const seen = new Set<string>()
  const out: SynthPoint[] = []
  for (const p of points) {
    const key = `${p.judgment}\n${p.why}`.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

function rankBridges(
  clusters: CalibrationAnchorCluster[],
): CalibrationBridge[] {
  const flat: { b: CalibrationBridge; rel: number }[] = []
  for (const c of clusters) {
    for (const b of c.bridges) flat.push({ b, rel: c.relevance })
  }
  flat.sort((a, z) => {
    const ax = a.b.cross_domain ? 1 : 0
    const zx = z.b.cross_domain ? 1 : 0
    if (ax !== zx) return zx - ax
    if (a.b.tier !== z.b.tier) return a.b.tier - z.b.tier
    return z.rel - a.rel
  })
  return flat.map((x) => x.b)
}

function selectBridgesForSynthesis(
  clusters: CalibrationAnchorCluster[],
): { cluster: CalibrationAnchorCluster; b: CalibrationBridge }[] {
  const candidates: {
    cluster: CalibrationAnchorCluster
    b: CalibrationBridge
    score: number
  }[] = []
  for (const cluster of clusters) {
    for (const b of cluster.bridges) {
      const score =
        cluster.relevance * 10 +
        (b.cross_domain ? 4 : 0) +
        (b.tier === 1 ? 2 : 0) +
        (b.claim ? 1 : 0)
      candidates.push({ cluster, b, score })
    }
  }
  candidates.sort((a, z) => z.score - a.score)

  const out: {
    cluster: CalibrationAnchorCluster
    b: CalibrationBridge
  }[] = []
  const seen = new Set<string>()
  for (const item of candidates) {
    const key = `${item.b.near}\n${item.b.far}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ cluster: item.cluster, b: item.b })
    if (out.length >= MAX_SYNTH_BRIDGES) break
  }
  return out
}

function clipText(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trim()}…`
}

export function inferThoughtMode(text: string): ThoughtMode {
  const t = text.trim().toLowerCase()
  if (!t) return 'capture'
  if (
    /\[[ x]\]|todo|待办|next action|下一步|deadline|due|今天要|明天要|本周要|(^|\n)\s*[-*+]\s*(做|完成|整理|联系|发布|检查|修复|决定|验证)/.test(
      t,
    )
  ) {
    return 'action'
  }
  if (
    /我认为|我觉得|我判断|我打算|应该|不应该|因为|所以|取决于|风险|机会|值得|不值得|假设|结论|判断|\bi\s+(think|believe|judge|assume|plan)\b|\bshould\b|\bshouldn't\b|\bbecause\b|\btherefore\b|\bdepends\b|\brisk\b|\bopportunity\b|\bworth\b|\bassumption\b|\bclaim\b/.test(
      t,
    )
  ) {
    return 'claim'
  }
  if (
    /摘录|摘要|总结|原文|转述|提到|作者说|他说|她说|according to|summary|quote|highlight|clip/.test(
      t,
    )
  ) {
    return 'summary'
  }
  if (t.length < 80) return 'capture'
  return 'summary'
}

export function nextStepForMode(
  mode: ThoughtMode,
  locale: 'zh' | 'en' = 'zh',
): string {
  if (locale === 'en') {
    switch (mode) {
      case 'capture':
        return 'Decide whether this is worth keeping; if yes, add one sentence of your own judgment, otherwise archive it.'
      case 'summary':
        return 'Compress the summary into one claim of your own: what you agree with, reject, or will use.'
      case 'action':
        return 'Add a trigger and an acceptance check so the action does not stop at feeling planned.'
      case 'claim':
      default:
        return 'Write down the key assumption and test it against a counterexample or an older note.'
    }
  }
  switch (mode) {
    case 'capture':
      return '先决定这条是否值得保留；值得就补一句自己的判断，不值得就归档。'
    case 'summary':
      return '把复述压成一句自己的主张：你同意什么、反对什么、准备用它做什么。'
    case 'action':
      return '给行动补上触发条件和验收标准，避免它只停留在计划感。'
    case 'claim':
    default:
      return '把最关键的假设写明，并用反例或旧笔记检验它。'
  }
}

export function inferTextLocale(text: string): 'zh' | 'en' {
  return /[\u3400-\u9fff]/.test(text) ? 'zh' : 'en'
}

// Hard single-language output directive shared by review + rewrite prompts.
export function languageDirective(locale: 'zh' | 'en'): string {
  return locale === 'zh'
    ? 'Write the entire output in Chinese (\u7b80\u4f53\u4e2d\u6587) only; never mix languages. Translate any non-Chinese candidate material into Chinese. Keep proper nouns, code identifiers, and established technical terms in their original form. Do not translate ref/reference titles: reproduce them exactly as given.'
    : 'Write the entire output in English only; never mix languages. Translate any non-English candidate material into English. Keep proper nouns, code identifiers, and established technical terms in their original form. Do not translate ref/reference titles: reproduce them exactly as given.'
}

export function buildObsidianReviewSeeds(text: string): string[] {
  const mode = inferThoughtMode(text)
  const base = [
    'Obsidian 用户 daily note 剪藏 复述 判断 行动 知识管理',
    '个人知识库 认知工效学 主动产出 认知负荷 工具折腾',
  ]
  const byMode: Record<ThoughtMode, string[]> = {
    capture: [
      '剪藏墓地 收集者谬误 信息囤积 注意力公地 低价值收集',
      'capture inbox read-it-later collector fallacy cognitive ergonomics',
      '认知工效学 减法组织 存储结构匹配查询意图',
    ],
    summary: [
      '复述 外部材料 自己的主张 主动产出 学习方法',
      '知识与行动并济 纯知识 行动 双路径并济',
      'summary to claim active recall output-driven learning',
    ],
    claim: [
      '判断 假设 反例 因果谬误 确认偏误 德克萨斯神枪手谬误',
      'claim hypothesis counterexample causal fallacy confirmation bias',
      '决策辅助工具 价值观澄清 获益伤害平衡',
    ],
    action: [
      '行动 项目 承诺谬误 规划谬误 事前验尸 验收标准',
      'action project commitment fallacy premortem acceptance criteria',
      '知识与行动并济 行动 不执 验证反馈',
    ],
  }
  return [...base, ...byMode[mode]].slice(0, 6)
}
