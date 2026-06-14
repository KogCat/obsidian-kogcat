import { ChatModel } from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'
import { BaseLLMProvider } from '../llm/base'

import { CalibrationResult } from './calibrate'
import { PromptAsset, PromptCache } from './prompts'
import { inferTextLocale, languageDirective } from './reviewSynthesis'

// KogCat advisor-answer path. Pulls the `calibrate-rewrite` prompt from
// om-core and invokes the user's chat LLM to stream the advisor response.

export type RewriteParams = {
  originalResponse: string
  calibration: CalibrationResult
  answerMode?: KogCatAnswerMode
  promptCache: PromptCache
  providerClient: BaseLLMProvider<LLMProvider>
  model: ChatModel
  abortSignal?: AbortSignal
  onDelta: (chunk: string) => void
}

export type KogCatAnswerMode = 'quick' | 'advisor'

export type RewriteOutcome =
  | { kind: 'ok'; text: string }
  | { kind: 'no_prompt' }
  | { kind: 'error'; message: string }

export async function rewriteResponse(
  params: RewriteParams,
): Promise<RewriteOutcome> {
  const {
    originalResponse,
    calibration,
    promptCache,
    providerClient,
    model,
    abortSignal,
    onDelta,
  } = params

  const prompt = await promptCache.get('calibrate-rewrite')
  if (!prompt) return { kind: 'no_prompt' }

  const { directive } = calibration
  const userMessage = renderUserTemplate(prompt, {
    R: originalResponse,
    phrasing: directive.phrasing,
    user_facing_note: directive.user_facing_note ?? '',
    placement: directive.placement,
    inline_refs: directive.inline_refs,
    inline_ref_count: directive.inline_refs.length,
  })

  try {
    const stream = await providerClient.streamResponse(model, {
      model: model.model,
      stream: true,
      messages: [
        {
          role: 'system',
          content: withRewriteOutputConstraints(
            prompt.system,
            params.answerMode ?? 'quick',
            inferTextLocale(originalResponse),
          ),
        },
        { role: 'user', content: userMessage },
      ],
    })

    let acc = ''
    for await (const chunk of stream) {
      if (abortSignal?.aborted) break
      const delta = chunk.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) {
        acc += delta
        onDelta(delta)
      }
    }
    return { kind: 'ok', text: acc }
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

function withRewriteOutputConstraints(
  systemPrompt: string,
  answerMode: KogCatAnswerMode,
  locale: 'zh' | 'en',
): string {
  const refSection = locale === 'zh' ? '参考依据' : 'References'
  return `${systemPrompt.trim()}

Output style:
- Return a KogCat advisor answer, not a diff and not a rewritten copy of the original answer.
- ${answerModeConstraints(answerMode, locale)}
- ${languageDirective(locale)}
- Make the language smooth and natural: connect the advice into readable sentences, avoid stiff framework exposition, and avoid a preachy or didactic tone.
- No em or en dashes; use commas, periods, parentheses.
- No bold section-headers as a skeleton and no bolded lead-in on every paragraph; no rule-of-three parallelism; no formulaic closer (一句话/总之/综上/归根结底).
- Vary sentence length and paragraph openings.
- Use KB hits as private guidance. Do not place KB references inline in the body, including forms like ([KB:...]) or [KB:...].
- If references are useful, put them only at the end under a compact "${refSection}" section.
- Do not mention raw directive field names, placement values, JSON, or implementation details.
- Keep the tone concise, calm, and advisory.`
}

function answerModeConstraints(
  answerMode: KogCatAnswerMode,
  locale: 'zh' | 'en',
): string {
  if (answerMode === 'advisor') {
    return [
      'Advisor Answer mode: KogCat is the complete primary answer.',
      'The user should not need the original LLM answer to understand or act.',
      'Organize the response for judgment: conclusion, situation-specific advice, why it matters, boundaries or risks, and the recommended next step when useful.',
      'Differentiate advice by user condition when relevant, such as beginner vs experienced, high-risk vs low-risk, or cautious vs aggressive goals.',
    ].join('\n- ')
  }

  const quickLead =
    locale === 'zh'
      ? 'Prefer one short "KogCat 提醒" section plus one concise takeaway.'
      : 'Prefer one short reminder section plus one concise takeaway.'
  return [
    'Quick Answer mode: the original LLM answer remains primary.',
    'Return a short supplemental note, warning, or boundary reminder.',
    'Do not write a full replacement answer.',
    quickLead,
    'Differentiate advice by user condition only when it materially helps the user decide.',
  ].join('\n- ')
}

// Replaces {{var}} tokens in user_template. Object-valued substitutions are
// JSON-stringified so the prompt author controls fenced-block layout.
function renderUserTemplate(
  prompt: PromptAsset,
  vars: Record<string, unknown>,
): string {
  return prompt.user_template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key as string]
    if (v == null) return ''
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  })
}
