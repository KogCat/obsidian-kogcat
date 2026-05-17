#!/usr/bin/env node
// Mock om-core HTTP server for full-chain KogCat acceptance.
// Implements every endpoint the obsidian-kogcat client touches:
//   GET  /healthz
//   POST /v1/calibrate
//   GET  /v1/prompts/manifest
//   GET  /v1/prompts/:name
//   POST /v1/ingest/submit
//   GET  /v1/ingest/recent
//   DELETE /v1/ingest/:id
//   GET  /v1/pending/list
//   DELETE /v1/pending/:id
//
// Stance routing is deterministic by keyword in the input text so test cases
// are reproducible without a real KB. See `decideStance` below.

import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

const args = parseArgs(process.argv.slice(2))
const PORT = Number(args.port ?? process.env.MOCK_OM_PORT ?? 18271)
const VERSION = args.version ?? '0.32.0-mock'

// Persistent in-memory state — wiped per process.
const recent = [] // {id, subject, predicate, object, status, created_at, source}
const pending = []
let nextId = 1
const newId = (prefix) => `${prefix}_${nextId++}_${Date.now().toString(36)}`

const PROMPTS = {
  'calibrate-rewrite': {
    name: 'calibrate-rewrite',
    version: '0.3.0',
    system:
      'You rewrite an LLM response to integrate the KogCat calibration directive. Output plain markdown only.',
    user_template:
      'Original answer (R):\n{{R}}\n\n' +
      'KogCat directive phrasing:\n{{phrasing}}\n\n' +
      'Placement: {{placement}}\n' +
      'User-facing note: {{user_facing_note}}\n\n' +
      'Inline refs ({{inline_ref_count}}):\n{{inline_refs}}\n\n' +
      'Rewrite R per the rules above. Output plain markdown only.',
    model_hints: { temperature: 0.3 },
  },
  'ingest-extract': {
    name: 'ingest-extract',
    version: '0.1.0',
    system:
      'Extract structured (subject, predicate, object) claims from the input text. Return JSON array.',
    user_template: 'Text:\n{{input_text}}\n\nReturn JSON array of candidates.',
    output_schema: {
      type: 'array',
      items: { subject: 'string', predicate: 'string', object: 'string' },
    },
  },
}

for (const p of Object.values(PROMPTS)) {
  p.hash = sha256(JSON.stringify({ s: p.system, u: p.user_template }))
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex')
}

function decideStance(text) {
  const t = (text || '').toLowerCase()
  if (t.includes('warn')) return 'warn'
  if (t.includes('calibrate+enrich')) return 'calibrate+enrich'
  if (t.includes('calibrate')) return 'calibrate'
  if (t.includes('reinforce')) return 'reinforce'
  if (t.includes('answer')) return 'answer'
  if (t.includes('flag_gap')) return 'flag_gap'
  return null
}

// Mirrors om-core's CalibrateDirective shape. Each stance maps to one
// placement so the client can route deterministically in tests.
function compileMockDirective(stance) {
  const ref = { title: 'Mock principle', stable_id: null }
  switch (stance) {
    case 'warn':
      return {
        should_emit: true,
        placement: 'front',
        phrasing: 'Kogcat 反对：命中已知反模式 [Mock principle]',
        inline_refs: [ref],
        user_facing_note: null,
        extras: {},
      }
    case 'calibrate':
      return {
        should_emit: true,
        placement: 'inline',
        phrasing: 'Kogcat 校准：参见 [Mock principle]',
        inline_refs: [ref],
        user_facing_note: null,
        extras: {},
      }
    case 'calibrate+enrich':
      return {
        should_emit: true,
        placement: 'inline',
        phrasing: 'Kogcat 跨域类比/差异：参见 [Mock principle]',
        inline_refs: [ref],
        user_facing_note: null,
        extras: {},
      }
    case 'reinforce':
      return {
        should_emit: true,
        placement: 'inline',
        phrasing: 'Kogcat 印证：[Mock principle]',
        inline_refs: [ref],
        user_facing_note: null,
        extras: {},
      }
    case 'answer':
      return {
        should_emit: true,
        placement: 'front',
        phrasing: 'Kogcat 主答：以 [Mock principle] 为准',
        inline_refs: [ref],
        user_facing_note: null,
        extras: { primary_mode: 'kb' },
      }
    case 'flag_gap':
      return {
        should_emit: true,
        placement: 'suffix',
        phrasing: '（Kogcat 未覆盖该主题）',
        inline_refs: [],
        user_facing_note: null,
        extras: {},
      }
    default:
      return {
        should_emit: false,
        placement: 'none',
        phrasing: '',
        inline_refs: [],
        user_facing_note: null,
        extras: {},
      }
  }
}

function dedupeKey(c) {
  return sha256(`${c.subject}|${c.predicate}|${c.object}`)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    const path = url.pathname
    // Only DELETE uses the :id trailing segment — everything else is a known
    // literal sub-path under /v1/{ingest,pending}/. Doing this with regex
    // normalization swallows submit/recent/list, hence the explicit table.
    const route =
      req.method === 'DELETE'
        ? `${req.method} ${path.replace(/\/v1\/(pending|ingest)\/[^/]+$/, '/v1/$1/:id')}`
        : `${req.method} ${path}`

    if (route === 'GET /healthz') {
      return json(res, 200, { ok: true, version: VERSION, api_minor: 0 })
    }

    if (route === 'POST /v1/calibrate') {
      const body = await readJson(req)
      const stance = decideStance(body.text)
      const directive = compileMockDirective(stance)
      return json(res, 200, { directive })
    }

    if (route === 'GET /v1/prompts/manifest') {
      return json(
        res,
        200,
        Object.values(PROMPTS).map((p) => ({
          name: p.name,
          version: p.version,
          hash: p.hash,
        })),
      )
    }

    if (req.method === 'GET' && url.pathname.startsWith('/v1/prompts/')) {
      const name = url.pathname.slice('/v1/prompts/'.length)
      const p = PROMPTS[name]
      if (!p) return json(res, 404, { error: 'not found' })
      return json(res, 200, p)
    }

    if (route === 'POST /v1/ingest/submit') {
      const body = await readJson(req)
      const candidates = Array.isArray(body.candidates) ? body.candidates : []
      const seen = new Set()
      let accepted = 0
      let pendingCount = 0
      let duplicates = 0
      const ids = []
      for (const c of candidates) {
        if (
          typeof c.subject !== 'string' ||
          typeof c.predicate !== 'string' ||
          typeof c.object !== 'string'
        ) {
          continue
        }
        const key = dedupeKey(c)
        if (
          seen.has(key) ||
          recent.some((r) => dedupeKey(r) === key) ||
          pending.some((r) => dedupeKey(r) === key)
        ) {
          duplicates++
          continue
        }
        seen.add(key)
        // First candidate goes to materialized, rest go to pending — gives
        // the e2e test something to exercise both lists with.
        const goesPending = accepted >= 1
        const id = newId(goesPending ? 'pend' : 'mat')
        ids.push(id)
        const row = {
          id,
          subject: c.subject,
          predicate: c.predicate,
          object: c.object,
          evidence_md: c.evidence_md,
          status: goesPending ? 'pending' : 'materialized',
          created_at: Date.now(),
          source: body.source,
        }
        if (goesPending) {
          pending.push(row)
          pendingCount++
        } else {
          recent.push(row)
          accepted++
        }
      }
      return json(res, 200, {
        accepted,
        pending: pendingCount,
        duplicates,
        candidate_ids: ids,
      })
    }

    if (route === 'GET /v1/ingest/recent') {
      const limit = Number(url.searchParams.get('limit') ?? '30')
      return json(res, 200, {
        items: recent.slice(-limit).reverse(),
      })
    }

    if (route === 'GET /v1/pending/list') {
      return json(res, 200, { items: pending.slice().reverse() })
    }

    if (route === 'DELETE /v1/ingest/:id') {
      const id = decodeURIComponent(url.pathname.split('/').pop())
      const idx = recent.findIndex((r) => r.id === id)
      if (idx === -1) return json(res, 404, { error: 'not found' })
      recent.splice(idx, 1)
      return json(res, 204, null)
    }

    if (route === 'DELETE /v1/pending/:id') {
      const id = decodeURIComponent(url.pathname.split('/').pop())
      const idx = pending.findIndex((r) => r.id === id)
      if (idx === -1) return json(res, 404, { error: 'not found' })
      pending.splice(idx, 1)
      return json(res, 204, null)
    }

    return json(res, 404, { error: `no route for ${route}` })
  } catch (err) {
    return json(res, 500, { error: String(err && err.message) })
  }
})

function json(res, status, body) {
  res.statusCode = status
  if (body === null) {
    res.end()
    return
  }
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8') || '{}'
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=')
      out[k] = v ?? argv[++i]
    }
  }
  return out
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `mock-om-core listening on http://127.0.0.1:${PORT} (version=${VERSION})`,
  )
})

process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
