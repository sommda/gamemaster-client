// composables/useSampling.ts - Handle MCP sampling requests
import type { CreateMessageRequest, CreateMessageResult } from '@modelcontextprotocol/sdk/types.js'
import { debug } from '../utils/debug'

export function useSampling() {
  /**
   * Handle a sampling request from an MCP tool.
   * This calls the LLM on behalf of the tool.
   */
  async function handleSamplingRequest(
    params: CreateMessageRequest['params']
  ): Promise<CreateMessageResult> {
    debug.log('🎯 Handling sampling request:', {
      messageCount: params.messages.length,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      systemPrompt: params.systemPrompt?.substring(0, 100)
    })

    // Convert MCP sampling messages to API format
    const apiMessages = params.messages.map(msg => {
      // Extract text from content union type
      let text = ''
      if (msg.content.type === 'text' && 'text' in msg.content) {
        text = msg.content.text
      }
      return {
        role: msg.role,
        content: text
      }
    })

    // Determine which model to use based on preferences
    // Default to Claude Sonnet 4.5 for now
    const model = params.modelPreferences?.hints?.[0]?.name || 'claude-sonnet-4-5-20250929'

    // Prepare the payload for the chat API
    const payload = {
      provider: 'anthropic', // Use Anthropic by default for sampling
      providerMode: 'anthropic-client-mcp',
      model: model,
      system: params.systemPrompt || 'You are a helpful assistant.',
      messages: apiMessages,
      maxTokens: params.maxTokens,
      temperature: params.temperature ?? 0.7,
      stopSequences: params.stopSequences
    }

    debug.log('🚀 Sending sampling request to LLM:', {
      provider: payload.provider,
      model: payload.model,
      messageCount: payload.messages.length
    })

    try {
      // Create a session for this sampling request
      const resp = await fetch('/api/chat/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      })

      if (!resp.ok) {
        const errorText = await resp.text()
        debug.error('❌ Sampling session creation failed:', resp.status, errorText)
        throw new Error(`Failed to create sampling session: ${errorText}`)
      }

      const { sid } = await resp.json()
      debug.log('✅ Sampling session created:', sid)

      // Stream the response
      const origin = window.location.origin
      const url = `${origin}/api/chat/stream?sid=${encodeURIComponent(sid)}`

      return new Promise<CreateMessageResult>((resolve, reject) => {
        const es = new EventSource(url)
        let fullResponse = ''
        let stopReason: string | undefined

        es.onmessage = (ev) => {
          try {
            const obj = JSON.parse(ev.data)
            if (typeof obj.text === 'string') {
              fullResponse += obj.text
            }
            if (obj.done) {
              es.close()
              debug.log('✅ Sampling completed, response length:', fullResponse.length)
              resolve({
                role: 'assistant',
                content: {
                  type: 'text',
                  text: fullResponse
                },
                model: model,
                stopReason: stopReason || 'endTurn'
              })
            }
          } catch (e) {
            debug.log('⚠️ Ignoring non-JSON frame:', ev.data)
          }
        }

        es.addEventListener('llm-error', (ev) => {
          debug.error('❌ Sampling error:', (ev as MessageEvent).data)
          es.close()
          try {
            const obj = JSON.parse((ev as MessageEvent).data)
            reject(new Error(obj.message || 'Sampling request failed'))
          } catch (e) {
            reject(new Error('Sampling request failed'))
          }
        })

        es.onerror = (ev) => {
          debug.error('❌ Sampling EventSource error:', ev)
          es.close()
          reject(new Error('EventSource connection error during sampling'))
        }
      })
    } catch (error) {
      debug.error('❌ Error in sampling request:', error)
      throw error
    }
  }

  return {
    handleSamplingRequest
  }
}
