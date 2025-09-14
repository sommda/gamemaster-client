// server/routes/mcp/[...path].ts
import {
  defineEventHandler, getMethod, getRequestHeaders, readRawBody,
  setResponseStatus, setResponseHeaders, sendStream
} from 'h3'

const HOP_BY_HOP = new Set([
  'connection','keep-alive','proxy-authenticate','proxy-authorization',
  'te','trailer','transfer-encoding','upgrade','host','content-length'
])

export default defineEventHandler(async (event) => {
  const { mcp } = useRuntimeConfig() as {
    mcp: { url?: string }
  }

  const pathSegs = (event.context.params?.path as string[] | undefined) ?? []
  const suffix = pathSegs.join('/') // '' when hitting /mcp root
  let base = (mcp?.url || 'http://localhost:8000').replace(/\/+$/, '')
  base = base.replace(/(?:\/mcp)+$/, '')  // collapse trailing /mcp, /mcp/mcp, etc.
  const upstreamBase = `${base}/mcp`      // ✅ ends in /mcp exactly once
  const targetURL = suffix ? `${upstreamBase}/${suffix}` : `${upstreamBase}/`

  const method = getMethod(event)
  const incoming = getRequestHeaders(event)

  // Forward headers (minus hop-by-hop)
  const fwdHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(incoming)) {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && typeof v === 'string') fwdHeaders[k] = v
  }

  // Body for non-GET/HEAD
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const body = hasBody ? await readRawBody(event) : undefined

  let upstream: Response
  try {
    upstream = await fetch(targetURL, {
      method,
      headers: fwdHeaders,
      body: hasBody ? (body as any) : undefined
    })
  } catch (err: any) {
    setResponseStatus(event, 502, 'Bad Gateway')
    return { error: 'Upstream MCP not reachable', detail: String(err?.message ?? err) }
  }

  // Mirror status + headers (minus hop-by-hop)
  setResponseStatus(event, upstream.status, upstream.statusText)
  const outHeaders: Record<string, string> = {}
  upstream.headers.forEach((val, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders[key] = val
  })
  setResponseHeaders(event, outHeaders)

  // Stream body through (handles JSON, binary, SSE)
  if (upstream.body) {
    // Better UX for SSE
    if ((outHeaders['content-type'] || '').includes('text/event-stream')) {
      event.node.res.setHeader('Cache-Control', 'no-cache')
    }
    return sendStream(event, upstream.body as any)
  }
  return null
})
