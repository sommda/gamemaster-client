// server/api/chat/stream.get.ts
import { defineEventHandler, getQuery } from 'h3'
import { executeMcpTools, type ToolCall, type ToolResult } from '../../utils/mcpTools'

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

    // Detect provider mode from providerMode field or infer from provider
    const providerMode = body.providerMode || body.provider
    const isServerMcp = providerMode === 'anthropic-server-mcp' || providerMode === 'anthropic'
    const isClientMcp = providerMode?.endsWith('-client-mcp')
    const baseProvider = providerMode?.split('-')[0] || body.provider

    if (debug) sendEvt('debug', { providerMode, isServerMcp, isClientMcp, baseProvider })

    if (isClientMcp) {
      // Route to client MCP handler
      await handleClientMcpMode(body, baseProvider, system, chatMsgs, sendEvt, sendError, res, event)
      return
    }

    // Original server MCP path
    let url = '', headers: Record<string,string> = {}, payload: any = {}
    const idem = crypto.randomUUID()

    if (baseProvider === 'openai') {
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
    } else if (baseProvider === 'anthropic') {
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
      sendError('unsupported_provider', { provider: baseProvider, providerMode })
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

// Handle client MCP mode (tools managed by client)
async function handleClientMcpMode(
  body: any,
  baseProvider: string,
  system: string,
  chatMsgs: any[],
  sendEvt: (name: string, obj: any) => void,
  sendError: (code: string, info: any) => void,
  res: any,
  event: any
) {
  const config = useRuntimeConfig()

  try {
    let url = '', headers: Record<string, string> = {}
    const idem = crypto.randomUUID()

    if (baseProvider === 'anthropic') {
      const { apiKey, baseURL, version } = config.anthropic ?? {}
      if (!apiKey) {
        sendError('missing_key', { provider: 'anthropic' })
        res.end()
        return
      }

      url = `${(baseURL || 'https://api.anthropic.com/v1').replace(/\/+$/, '')}/messages`
      headers = {
        'x-api-key': apiKey,
        'anthropic-version': version || '2023-06-01',
        'Content-Type': 'application/json',
        'Idempotency-Key': idem
        // Note: NO 'anthropic-beta': 'mcp-client-2025-04-04' header for client MCP
      }

      // For client MCP mode, tools are discovered client-side and passed in the request
      const payload = {
        model: body.model,
        messages: chatMsgs.map((m: any) => ({ role: m.role, content: m.content })),
        ...(system ? { system } : {}),
        stream: true,
        temperature: body.temperature ?? 0.7,
        max_tokens: body.maxTokens ?? 1024,
        // Include tools if provided by client
        ...(body.tools && body.tools.length > 0 ? { tools: body.tools } : {})
      }

      sendEvt('debug', { mode: 'client-mcp', provider: 'anthropic', toolsEnabled: !!(body.tools && body.tools.length > 0), toolCount: body.tools?.length || 0 })

      // Log what we're sending to Anthropic
      if (body.tools && body.tools.length > 0) {
        console.log('🔧 Server: Forwarding tools to Anthropic, count:', body.tools.length)
        console.log('🔍 First tool structure:', JSON.stringify(body.tools[0], null, 2))
        console.log('📤 Full payload keys:', Object.keys(payload))
      }

      // For client MCP mode, use simple streaming - client handles tool calling
      await streamSimpleResponse(url, headers, payload, sendEvt, sendError, res, baseProvider)

    } else if (baseProvider === 'openai') {
      const { apiKey, baseURL } = config.openai ?? {}
      if (!apiKey) {
        sendError('missing_key', { provider: 'openai' })
        res.end()
        return
      }

      url = `${(baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`
      headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idem
      }

      // For client MCP mode, tools are discovered client-side and passed in the request
      const payload = {
        model: body.model,
        messages: chatMsgs.map((m: any) => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: body.temperature ?? 0.7,
        max_tokens: body.maxTokens ?? 1024,
        // Include tools if provided by client
        ...(body.tools && body.tools.length > 0 ? { tools: body.tools } : {})
      }

      if (system) {
        payload.messages.unshift({ role: 'system', content: system })
      }

      sendEvt('debug', { mode: 'client-mcp', provider: 'openai', toolsEnabled: !!(body.tools && body.tools.length > 0), toolCount: body.tools?.length || 0 })

      // For client MCP mode, use simple streaming - client handles tool calling
      await streamSimpleResponse(url, headers, payload, sendEvt, sendError, res, baseProvider)

    } else {
      sendError('unsupported_client_mcp_provider', { provider: baseProvider })
      res.end()
    }
  } catch (e: any) {
    sendError('client_mcp_exception', { message: String(e?.message || e) })
    res.end()
  }
}

// Stream a simple response without tool calling (for Phase 2)
async function streamSimpleResponse(
  url: string,
  headers: Record<string, string>,
  payload: any,
  sendEvt: (name: string, obj: any) => void,
  sendError: (code: string, info: any) => void,
  res: any,
  provider: string
) {
  console.log('🚀 streamSimpleResponse: Making request to', provider)
  console.log('🔍 Payload summary:', {
    url,
    hasTools: !!payload.tools?.length,
    toolCount: payload.tools?.length || 0,
    messageCount: payload.messages?.length || 0
  })

  const send = (obj: any) => { res.write(`data: ${JSON.stringify(obj)}\n\n`); (res as any).flush?.() }

  let upstream: Response
  try {
    console.log('📤 Making fetch request to LLM API...')
    upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    console.log('📥 Received response from LLM API:', upstream.status, upstream.statusText)
  console.log('📋 Response headers:', Object.fromEntries(upstream.headers.entries()))
  } catch (e: any) {
    console.error('❌ Fetch failed:', e)
    sendError('upstream_fetch_failed', { message: String(e?.message || e) })
    res.end()
    return
  }

  if (!upstream.ok) {
    console.error('❌ LLM API returned error:', upstream.status, upstream.statusText)
    const text = (await upstream.text().catch(() => '')) || ''
    console.error('❌ Error details:', text.slice(0, 1000))
    sendError('upstream_non_2xx', {
      status: upstream.status,
      statusText: upstream.statusText,
      details: text.slice(0, 4000)
    })
    res.end()
    return
  }

  // Parse SSE stream
  const reader = upstream.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    for (;;) {
      const i = buf.indexOf('\n\n')
      if (i === -1) break
      const frame = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const dataLines = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart())
      if (!dataLines.length) continue
      const data = dataLines.join('\n').trim()
      if (!data || data === '[DONE]' || data === 'DONE') continue

      try {
        const evt = JSON.parse(data)
        console.log('📥 Server: Received SSE event from Anthropic:', evt.type, evt)

        // Handle Anthropic format
        if (provider === 'anthropic' && evt?.type === 'content_block_delta' && evt?.delta?.type === 'text_delta') {
          const t = evt.delta.text || ''
          console.log('📝 Server: Text delta:', t)
          if (t) send({ text: t })
          continue
        }

        // Handle Anthropic tool use events - forward to client for execution
        if (provider === 'anthropic' && evt?.type === 'content_block_start' && evt?.content_block?.type === 'tool_use') {
          console.log('🔧 Server: Tool use detected in Anthropic response!', evt.content_block)
          // Forward tool use event to client for execution
          sendEvt('anthropic-tool-use', {
            type: 'tool_use_start',
            tool_use: evt.content_block
          })
          continue
        }

        if (provider === 'anthropic' && evt?.type === 'content_block_delta' && evt?.delta?.type === 'input_json_delta') {
          console.log('🔧 Server: Tool input delta:', evt.delta)
          // Forward tool input delta to client
          sendEvt('anthropic-tool-use', {
            type: 'tool_input_delta',
            delta: evt.delta
          })
          continue
        }

        // Check for tool use completion
        if (provider === 'anthropic' && evt?.type === 'content_block_stop') {
          console.log('🔧 Server: Content block stopped')
          sendEvt('anthropic-tool-use', {
            type: 'tool_use_complete'
          })
          continue
        }

        // Stream ended - send done
        if (provider === 'anthropic' && evt?.type === 'message_stop') {
          console.log('✅ Server: Message complete from Anthropic')
          send({ done: true })
          break
        }

        // Handle OpenAI format
        if (provider === 'openai' && evt?.choices?.[0]?.delta?.content) {
          const t = evt.choices[0].delta.content
          if (t) send({ text: t })
          continue
        }

        // Error handling
        if (evt?.type === 'error' && evt?.error?.message) {
          sendError('provider_error', { provider, message: evt.error.message })
          continue
        }
      } catch {
        // Ignore non-JSON frames
      }
    }
  }

  send({ done: true })
  res.end()
}

// Stream response with tool calling orchestration
async function streamWithToolCalling(
  url: string,
  headers: Record<string, string>,
  initialPayload: any,
  sendEvt: (name: string, obj: any) => void,
  sendError: (code: string, info: any) => void,
  res: any,
  provider: string,
  event: any
) {
  const send = (obj: any) => { res.write(`data: ${JSON.stringify(obj)}\n\n`); (res as any).flush?.() }

  let conversationMessages = [...initialPayload.messages]
  let maxIterations = 10 // Prevent infinite tool calling loops
  let iterations = 0

  while (iterations < maxIterations) {
    iterations++

    const payload = {
      ...initialPayload,
      messages: conversationMessages
    }

    sendEvt('debug', { iteration: iterations, messageCount: conversationMessages.length })

    let upstream: Response
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      })
    } catch (e: any) {
      sendError('upstream_fetch_failed', { message: String(e?.message || e) })
      res.end()
      return
    }

    if (!upstream.ok) {
      const text = (await upstream.text().catch(() => '')) || ''
      sendError('upstream_non_2xx', {
        status: upstream.status,
        statusText: upstream.statusText,
        details: text.slice(0, 4000)
      })
      res.end()
      return
    }

    // Parse the stream and collect assistant response + tool calls
    let assistantContent = ''
    let toolCalls: ToolCall[] = []
    let finishReason = ''

    const reader = upstream.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      for (;;) {
        const i = buf.indexOf('\n\n')
        if (i === -1) break
        const frame = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const dataLines = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart())
        if (!dataLines.length) continue
        const data = dataLines.join('\n').trim()
        if (!data || data === '[DONE]' || data === 'DONE') continue

        try {
          const evt = JSON.parse(data)

          if (provider === 'anthropic') {
            // Handle Anthropic streaming format
            if (evt?.type === 'content_block_delta' && evt?.delta?.type === 'text_delta') {
              const text = evt.delta.text || ''
              if (text) {
                assistantContent += text
                send({ text })
              }
            } else if (evt?.type === 'content_block_start' && evt?.content_block?.type === 'tool_use') {
              // Anthropic tool call start
              const toolCall: ToolCall = {
                id: evt.content_block.id,
                type: 'function',
                function: {
                  name: evt.content_block.name,
                  arguments: JSON.stringify(evt.content_block.input)
                }
              }
              toolCalls.push(toolCall)
            } else if (evt?.type === 'message_delta' && evt?.delta?.stop_reason) {
              finishReason = evt.delta.stop_reason
            }
          } else if (provider === 'openai') {
            // Handle OpenAI streaming format
            if (evt?.choices?.[0]?.delta?.content) {
              const text = evt.choices[0].delta.content
              assistantContent += text
              send({ text })
            } else if (evt?.choices?.[0]?.delta?.tool_calls) {
              // OpenAI tool calls (may be chunked)
              for (const toolCallDelta of evt.choices[0].delta.tool_calls) {
                if (toolCallDelta.function) {
                  const toolCall: ToolCall = {
                    id: toolCallDelta.id || `tool_${Date.now()}`,
                    type: 'function',
                    function: {
                      name: toolCallDelta.function.name || '',
                      arguments: toolCallDelta.function.arguments || ''
                    }
                  }
                  toolCalls.push(toolCall)
                }
              }
            } else if (evt?.choices?.[0]?.finish_reason) {
              finishReason = evt.choices[0].finish_reason
            }
          }

          // Error handling
          if (evt?.type === 'error' && evt?.error?.message) {
            sendError('provider_error', { provider, message: evt.error.message })
            res.end()
            return
          }
        } catch {
          // Ignore non-JSON frames
        }
      }
    }

    // Add assistant message to conversation
    const assistantMessage: any = {
      role: 'assistant',
      content: assistantContent
    }

    if (toolCalls.length > 0) {
      assistantMessage.tool_calls = toolCalls
    }

    conversationMessages.push(assistantMessage)

    // If we have tool calls, execute them
    if (toolCalls.length > 0) {
      sendEvt('tool-thinking', {
        toolCalls: toolCalls.map(tc => ({ name: tc.function.name, id: tc.id })),
        iteration: iterations
      })

      // Execute tools against MCP server
      const toolResults = await executeMcpTools(toolCalls, event)

      // Add tool results to conversation
      for (const result of toolResults) {
        conversationMessages.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.content
        })
      }

      sendEvt('tool-results', {
        results: toolResults.map((r: ToolResult) => ({ id: r.tool_call_id, success: !r.content.startsWith('Error') })),
        iteration: iterations
      })

      // Continue the loop to get the final response
      continue
    }

    // No tool calls - we're done
    break
  }

  if (iterations >= maxIterations) {
    sendError('max_iterations_reached', { iterations })
  }

  send({ done: true })
  res.end()
}
