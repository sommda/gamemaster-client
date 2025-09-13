// server/api/chat/stream.get.ts
import { defineEventHandler, getQuery } from 'h3'

const store: Map<string, any> = (globalThis as any).__CHAT_STORE__ ?? new Map()

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const { sid, debug } = getQuery(event)
  const body = sid ? store.get(String(sid)) : null
  store.delete(String(sid || ''))

  // --- open SSE immediately so we can stream detailed errors ---
  const res = event.node.res
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  // @ts-ignore
  res.socket?.setNoDelay?.(true)
  res.flushHeaders?.()

  const send = (obj: any) => { res.write(`data: ${JSON.stringify(obj)}\n\n`); /* @ts-ignore */ res.flush?.() }
  const sendEvt = (name: string, obj: any) => { res.write(`event: ${name}\n` + `data: ${JSON.stringify(obj)}\n\n`); /* @ts-ignore */ res.flush?.() }
  const sendError = (code: string, info: any) => sendEvt('llm-error', { code, ...info })

  if (!body?.provider || !body?.model || !Array.isArray(body?.messages)) {
    sendError('bad_request', { message: 'provider, model, messages required' })
    res.end(); return
  }

  try {
    const systemFromList = body.messages.find((m: any) => m.role === 'system')?.content
    const system = body.system ?? systemFromList
    const chatMsgs = body.messages.filter((m: any) => m.role !== 'system')

    let url = '', headers: Record<string,string> = {}, payload: any = {}
    const idem = crypto.randomUUID()

    if (body.provider === 'openai') {
      const { apiKey, baseURL } = config.openai ?? {}
      if (!apiKey) { sendError('missing_key', { provider: 'openai' }); res.end(); return }
      url = `${(baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/responses`
      headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idem
      }
      payload = {
        model: body.model,
        input: chatMsgs.map((m: any) => ({ role: m.role, content: m.content })),
        ...(system ? { system } : {}),
        stream: true,
        temperature: body.temperature ?? 0.7,
        max_output_tokens: body.maxTokens ?? 1024
      }
    } else if (body.provider === 'anthropic') {
      const { apiKey, baseURL, version } = config.anthropic ?? {}
      if (!apiKey) { sendError('missing_key', { provider: 'anthropic' }); res.end(); return }

      // 🔑 MCP URL (public) required for Anthropic MCP
      const mcpBase = (config.mcp?.url || '').replace(/\/+$/, '')
      if (!mcpBase) {
        sendError('missing_mcp_url', {
          message: 'Set MCP_URL (public base URL). Anthropic must reach MCP_URL + /mcp/.'
        })
        res.end(); return
      }

      url = `${(baseURL || 'https://api.anthropic.com/v1').replace(/\/+$/, '')}/messages`
      headers = {
        'x-api-key': apiKey,
        'anthropic-version': version || '2023-06-01',
        'Content-Type': 'application/json',
        'Idempotency-Key': idem,
        // ✅ enable server-side MCP
        'anthropic-beta': 'mcp-client-2025-04-04'
      }

      // ✅ mcp_servers list (server-side MCP)
      const mcpServers = [
        {
          type: 'url',
          name: 'gamemaster-mcp',
          url: `${mcpBase}/mcp/` // ensure trailing slash
        }
      ]

      payload = {
        model: body.model,
        messages: chatMsgs.map((m: any) => ({ role: m.role, content: m.content })),
        ...(system ? { system } : {}),
        stream: true,
        temperature: body.temperature ?? 0.7,
        max_tokens: body.maxTokens ?? 1024,
        mcp_servers: mcpServers
      }
    } else {
      sendError('unsupported_provider', { provider: body.provider })
      res.end(); return
    }

    if (debug) sendEvt('debug', { url, headers: Object.keys(headers), model: body.model })

    let upstream: Response
    try {
      upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
    } catch (e: any) {
      sendError('upstream_fetch_failed', { message: String(e?.message || e) })
      res.end(); return
    }

    if (!upstream.ok) {
      const text = (await upstream.text().catch(() => '')) || ''
      sendError('upstream_non_2xx', {
        status: upstream.status,
        statusText: upstream.statusText,
        details: text.slice(0, 4000)
      })
      res.end(); return
    }

    // --- parse provider SSE, re-emit small {text:"..."} frames to client ---
    const reader = upstream.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      for (;;) {
        const i = buf.indexOf('\n\n'); if (i === -1) break
        const frame = buf.slice(0, i); buf = buf.slice(i + 2)
        const dataLines = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart())
        if (!dataLines.length) continue
        const data = dataLines.join('\n').trim()
        if (!data || data === '[DONE]' || data === 'DONE') continue

        try {
          const evt = JSON.parse(data)

          // Anthropic tokens (works with/without MCP calls)
          if (evt?.type === 'content_block_delta' && evt?.delta?.type === 'text_delta') {
            const t = evt.delta.text || ''
            if (t) send({ text: t })
            continue
          }
          if (evt?.type === 'error' && evt?.error?.message) {
            sendError('provider_error', { provider: body.provider, message: evt.error.message })
            continue
          }

          // OpenAI tokens
          if (evt?.type === 'response.output_text.delta' && typeof evt?.delta === 'string') {
            send({ text: evt.delta }); continue
          }
          if (evt?.type === 'response.refusal.delta' && typeof evt?.delta === 'string') {
            send({ text: evt.delta }); continue
          }
          if (evt?.type === 'response.error' && evt?.error?.message) {
            sendError('provider_error', { provider: body.provider, message: evt.error.message })
            continue
          }

          // (Optional) observe other frames in debug
          if (debug) sendEvt('debug', { frameType: evt?.type })
        } catch {
          if (debug) sendEvt('debug', { nonJsonFrame: (data || '').slice(0, 200) })
        }
      }
    }

    send({ done: true })
    res.end()
  } catch (e: any) {
    sendError('server_exception', { message: String(e?.message || e) })
    res.end()
  }
})
