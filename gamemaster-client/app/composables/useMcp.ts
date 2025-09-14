// composables/useMcp.ts
export type RecordInteractionArgs = {
  player_entry: string
  game_response: string
  campaign_name?: string | null
  session_number?: number | null
}

type JsonRpcError = { code: number; message: string; data?: any }
type JsonRpcEnvelope<T = any> = {
  jsonrpc?: '2.0'
  id?: string
  result?: T
  error?: JsonRpcError
  // non-standard shapes tolerated
  contents?: any
  content?: any
  text?: string
}

const SESSION_KEY = 'mcpSessionId'
const PROTOCOL_VERSION = '2025-03-26'

let inMemorySid: string | null = null
let initializing: Promise<string> | null = null

function looksLikeJson(text: string) {
  const s = text.trim()
  return s.startsWith('{') || s.startsWith('[')
}

function getStoredSid(): string | null {
  try {
    const v = localStorage.getItem(SESSION_KEY)
    return v && v.trim() ? v : null
  } catch { return null }
}
function setStoredSid(sid: string) {
  inMemorySid = sid
  try { localStorage.setItem(SESSION_KEY, sid) } catch {}
}

/** Read session id from headers, case-insensitively. */
function readSidFromHeaders(h: Headers): string | null {
  return (
    h.get('Mcp-Session-Id') ||
    h.get('mcp-session-id') ||
    h.get('MCP-SESSION-ID') ||
    null
  )
}

/** POST /mcp with method 'initialize' to obtain a new session id. */
async function initMcpSession(force = false): Promise<string> {
  if (!force) {
    if (inMemorySid) return inMemorySid
    const stored = getStoredSid()
    if (stored) { inMemorySid = stored; return stored }
  }

  const id = (typeof crypto?.randomUUID === 'function') ? crypto.randomUUID() : `${Date.now()}`
  const res = await fetch('/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Mcp-Protocol-Version': PROTOCOL_VERSION
      // NOTE: do NOT send a session header on initialize
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'initialize', params: {} }),
    credentials: 'same-origin'
  })

  const raw = await res.text()
  if (!res.ok) {
    // surface body snippet if server responds in text/html
    throw new Error(`initialize HTTP ${res.status} ${res.statusText}: ${raw.slice(0, 1000)}`)
  }

  // Session id MUST come from response header per spec
  const sid = readSidFromHeaders(res.headers)
  if (!sid) {
    // graceful fallback: if body is JSON and happens to carry it
    let parsed: any = null
    try { parsed = looksLikeJson(raw) ? JSON.parse(raw) : null } catch {}
    const fromBody = parsed?.sessionId || parsed?.session_id
    if (!fromBody) throw new Error('initialize succeeded but missing Mcp-Session-Id header')
    setStoredSid(String(fromBody))
    return inMemorySid!
  }

  setStoredSid(sid)
  return sid
}

/** Ensure we have a valid session id (single-flight). */
async function ensureSession(): Promise<string> {
  if (inMemorySid) return inMemorySid
  if (!initializing) initializing = initMcpSession()
  try { return await initializing } finally { initializing = null }
}

/** Optionally end the session explicitly (servers may support DELETE /mcp). */
async function endMcpSession() {
  const sid = inMemorySid || getStoredSid()
  if (!sid) return
  await fetch('/mcp', {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json, text/event-stream',
      'Mcp-Protocol-Version': PROTOCOL_VERSION,
      'Mcp-Session-Id': sid
    },
    credentials: 'same-origin'
  }).catch(() => {})
  try { localStorage.removeItem(SESSION_KEY) } catch {}
  inMemorySid = null
}

export function useMcp() {
  async function rpc<T = any>(method: string, params?: any): Promise<T> {
    // 1) be sure we have a session (initialize if needed)
    const sid = await ensureSession()

    const id = (typeof crypto?.randomUUID === 'function') ? crypto.randomUUID() : `${Date.now()}`
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params })

    const doFetch = async () => {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Protocol-Version': PROTOCOL_VERSION,
          'Mcp-Session-Id': sid    // REQUIRED on every call after initialize
        },
        body: payload,
        credentials: 'same-origin'
      })

      // If the server rotates the session id, capture it
      const newSid = readSidFromHeaders(res.headers)
      if (newSid && newSid !== inMemorySid) setStoredSid(newSid)

      const ct = (res.headers.get('content-type') || '').toLowerCase()
      const raw = await res.text()
      const parsed: JsonRpcEnvelope<T> | null =
        (ct.includes('application/json') || looksLikeJson(raw))
          ? (() => { try { return JSON.parse(raw) as JsonRpcEnvelope<T> } catch { return null } })()
          : null

      return { res, raw, parsed }
    }

    // 2) first attempt
    let { res, raw, parsed } = await doFetch()

    // 3) handle invalid/expired session → re-init once and retry
    if (!res.ok && (/session\s+not\s+found/i.test(raw) || res.status === 404)) {
      await initMcpSession(true) // force new session
      ;({ res, raw, parsed } = await doFetch())
    }

    if (!res.ok) {
      if (parsed?.error) {
        const e = parsed.error
        throw new Error(`${method} failed: ${e.message}${e.code !== undefined ? ` (code ${e.code})` : ''}`)
      }
      throw new Error(`${method} HTTP ${res.status} ${res.statusText}: ${raw.slice(0, 1000)}`)
    }

    if (parsed) {
      if (parsed.error) {
        const e = parsed.error
        throw new Error(`${method} failed: ${e.message}${e.code !== undefined ? ` (code ${e.code})` : ''}`)
      }
      return (parsed.result as T) ?? (parsed as any)
    }

    // Some resources may return plain text on success
    return raw as any as T
  }

  /** Tool wrapper */
  async function recordInteraction(args: RecordInteractionArgs): Promise<void> {
    await rpc('tools/call', {
      name: 'record_interaction',
      arguments: {
        player_entry: args.player_entry,
        game_response: args.game_response,
        campaign_name: args.campaign_name ?? null,
        session_number: args.session_number ?? null
      }
    })
  }

  /** Resource wrapper */
  async function fetchCurrentTranscript(): Promise<string> {
    const r = await rpc<any>('resources/read', { uri: 'resource://current_transcript' })
    const contents = r?.contents ?? r?.content ?? r
    if (Array.isArray(contents) && contents[0]?.text) return contents[0].text as string
    if (typeof contents?.text === 'string') return contents.text
    if (typeof r === 'string') return r
    return JSON.stringify(r)
  }

  return { initMcpSession, endMcpSession, rpc, recordInteraction, fetchCurrentTranscript }
}
