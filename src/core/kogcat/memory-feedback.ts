// Records calibration outcomes into om-core memory so the shared sidecar
// accumulates a user-behavior trace across clients (CC plugins + Obsidian).
//
// Bucket strategy: one fixed-name `feedback` memory per directive placement
// (front / inline / suffix). Each call reads the existing body, appends a
// single line, caps history, and upserts. Failures are swallowed — memory
// write must never break chat.

import {
  type MemoryType,
  OmMemoryError,
  memoryGet,
  memorySave,
} from '../om-core/memory'
import type { OmCoreAuth } from '../om-core/transport'

import type {
  CalibrationDirective,
  CalibrationPlacement,
  CalibrationResult,
} from './calibrate'

const MAX_LINES = 50
const MEMORY_TYPE: MemoryType = 'feedback'

export type RecordSource = 'chat_response' | 'vault_selection' | 'chat_share'

export async function recordCalibrationObservation(args: {
  auth: OmCoreAuth
  result: CalibrationResult
  source: RecordSource
}): Promise<void> {
  const { auth, result, source } = args
  const { directive } = result
  if (!directive.should_emit) return

  const name = memoryNameForPlacement(directive.placement)
  const description = descriptionForPlacement(directive.placement)
  const line = formatLine(directive, source)

  let existingBody = ''
  try {
    const existing = await memoryGet(auth, name)
    if (existing) existingBody = existing.body
  } catch (e) {
    if (e instanceof OmMemoryError && e.status !== 404) {
      console.debug('[KogCat memory] get failed, will overwrite', e)
    }
  }

  const body = appendCapped(existingBody, line, MAX_LINES)

  try {
    await memorySave(auth, {
      name,
      description,
      type: MEMORY_TYPE,
      source: 'client_inferred',
      body,
    })
  } catch (e) {
    // 429 throttle / 400 policy / 409 dup — all non-fatal here.
    console.debug('[KogCat memory] save failed', e)
  }
}

export function memoryNameForPlacement(placement: CalibrationPlacement): string {
  // ASCII-safe, fixed per placement so re-upserts merge cleanly server-side.
  return `feedback_obsidian_calibration_${placement}`
}

function descriptionForPlacement(placement: CalibrationPlacement): string {
  return `Obsidian KogCat calibration trace — placement=${placement}`
}

function formatLine(
  directive: CalibrationDirective,
  source: RecordSource,
): string {
  const ts = new Date().toISOString()
  const topRefs = directive.inline_refs
    .slice(0, 3)
    .map((r) => r.title)
    .filter((s) => s && s.length > 0)
    .join(' | ')
  const parts = [ts, `source=${source}`, `placement=${directive.placement}`]
  if (directive.phrasing) parts.push(`phrasing=${truncate(directive.phrasing, 120)}`)
  if (topRefs) parts.push(`refs=${truncate(topRefs, 160)}`)
  if (directive.user_facing_note) {
    parts.push(`note=${truncate(directive.user_facing_note, 80)}`)
  }
  return parts.join(' | ')
}

function appendCapped(existing: string, line: string, maxLines: number): string {
  const trimmed = existing.trim()
  const lines = trimmed.length === 0 ? [] : trimmed.split('\n')
  lines.push(line)
  if (lines.length > maxLines) lines.splice(0, lines.length - maxLines)
  return lines.join('\n') + '\n'
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}
