import { defineEventHandler, readBody, setResponseStatus } from 'h3'

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }
type ChatBody = {
  provider: 'openai' | 'anthropic'
  model: string
  messages: Msg[]
  system?: string
  maxTokens?: number
  temperature?: number
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<ChatBody>(event)

  if (!body?.provider || !body?.model || !Array.isArray(body?.messages)) {
    setResponseStatus(event, 400)
    return { error: 'provider, model, and messages are required' }
  }

  const systemFromList = body.messages.find((m) => m.role === 'system')?.content
  const system = body.system ?? systemFromList
  const chatMsgs = body.messages.filter((m) => m.role !== 'system')

  // Build upstream request
  let url = ''
  let headers: Record<string, string> = {}
  let payload: any = {}
  const idem = crypto.randomUUID()

  if (body.provider === 'openai') {
    const { apiKey, baseURL } = config.openai ?? {}
    if (!apiKey) { setResponseStatus(event, 500); return { error: 'OpenAI API key missing' } }
    url = `${(baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/responses`
    headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idem
    }
    payload = {
      model: body.model,
      input: chatMsgs.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      max_output_tokens: body.maxTokens ?? 1024,
      ...(system ? { instructions: system } : {})
    }
  } else {
    const { apiKey, baseURL, version } = config.anthropic ?? {}
    if (!apiKey) { setResponseStatus(event, 500); return { error: 'Anthropic API key missing' } }
    url = `${(baseURL || 'https://api.anthropic.com/v1').replace(/\/+$/, '')}/messages`
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': version || '2023-06-01',
      'Content-Type': 'application/json',
      'Idempotency-Key': idem
    }
    payload = {
      model: body.model,
      messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
      ...(system ? { system } : {}),
      stream: true,
      temperature: body.temperature ?? 0.7,
      max_tokens: body.maxTokens ?? 1024
    }
  }

  const upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '')
    setResponseStatus(event, upstream.status, upstream.statusText)
    return { error: 'Upstream error', status: upstream.status, details: errText || 'No body' }
  }

  // --- Prepare *our* SSE stream to the browser ---
  const res = event.node.res
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // nginx
  res.setHeader('Keep-Alive', 'timeout=60')
  // Reduce coalescing:
  // @ts-ignore
  res.socket?.setNoDelay?.(true)
  res.flushHeaders?.()

  const reader = upstream.body!.getReader()
  const decoder = new TextDecoder()

  let buf = ''
  const writeSSE = (dataObj: any) => {
    const line = `data: ${JSON.stringify(dataObj)}\n\n`
    res.write(line)
    // flush ASAP (compression middlewares expose flush())
    // @ts-ignore
    res.flush?.()
  }

  // Parse upstream SSE and re-emit as tiny SSE frames
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    // process complete SSE events (sep: blank line)
    for (;;) {
      const sep = buf.indexOf('\n\n')
      if (sep === -1) break
      const raw = buf.slice(0, sep)
      buf = buf.slice(sep + 2)

      // collect data: lines only
      const dataLines: string[] = []
      for (const line of raw.split('\n')) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      if (!dataLines.length) continue
      const dataStr = dataLines.join('\n').trim()
      if (!dataStr || dataStr === '[DONE]' || dataStr === 'DONE') continue

      try {
        const evt = JSON.parse(dataStr)

        // Anthropic token
        if (evt?.type === 'content_block_delta' && evt?.delta?.type === 'text_delta') {
          const t = evt.delta.text || ''
          if (t) writeSSE({ text: t })
          continue
        }
        if (evt?.type === 'error' && evt?.error?.message) throw new Error(evt.error.message)

        // OpenAI token
        if (evt?.type === 'response.output_text.delta' && typeof evt?.delta === 'string') {
          writeSSE({ text: evt.delta })
          continue
        }
        if (evt?.type === 'response.refusal.delta' && typeof evt?.delta === 'string') {
          writeSSE({ text: evt.delta })
          continue
        }
        if (evt?.type === 'response.error' && evt?.error?.message) throw new Error(evt.error.message)

        // ignore control frames
      } catch {
        // ignore non-JSON frames
      }
    }
  }

  // final keepalive end (optional)
  res.write('data: {"done": true}\n\n')
  // @ts-ignore
  res.flush?.()
  res.end()
})
