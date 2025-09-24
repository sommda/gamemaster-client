import { ref, reactive } from 'vue'
import { useChatStream } from './useChatStream'
import { useMcpClient } from './useMcpClient'
import { useClientToolCalling } from './useClientToolCalling'

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

export type ProviderMode =
  | 'anthropic-server-mcp'    // Current: Anthropic handles MCP
  | 'anthropic-client-mcp'    // New: Client handles tools
  | 'openai-client-mcp'       // New: OpenAI with client tools

export function useChat() {
  const { openChatStreamWithToolCalling } = useChatStream()
  const { recordInteraction, fetchTranscriptAsMessages, fetchCurrentPrompt } = useMcpClient()
  const { enhancePayloadWithTools, isClientMcpMode } = useClientToolCalling()

  // --- provider + models ---
  const provider = ref<ProviderMode>('anthropic-client-mcp')
  const modelByProvider: Record<ProviderMode, string> = {
    'anthropic-server-mcp': 'claude-sonnet-4-20250514',
    'anthropic-client-mcp': 'claude-sonnet-4-20250514',
    'openai-client-mcp': 'gpt-5'
  }

  // --- system message (from MCP server) ---
  const currentPrompt = ref<string>('You are a helpful assistant.')

  // --- conversation state ---
  const messages = ref<Msg[]>([{ role: 'system', content: currentPrompt.value }])
  const error = ref<string | null>(null)
  const stop = ref<null | (() => void)>(null) // active stream closer

  async function loadTranscriptToMessages() {
    try {
      const transcriptMessages = await fetchTranscriptAsMessages()

      // Always preserve the current system message at the start
      const systemMessage = messages.value[0]

      // Replace messages with system message + transcript messages
      messages.value = [systemMessage, ...transcriptMessages]
    } catch (e: any) {
      console.error('Failed to load transcript:', e)
    }
  }

  function cancel() {
    stop.value?.()
    stop.value = null
  }

  function newChat() {
    messages.value = [{ role: 'system', content: currentPrompt.value }]
    error.value = null
  }

  async function sendMessage(content: string, onDone?: () => Promise<void>) {
    if (!content.trim() || stop.value) return
    error.value = null

    // Fetch current prompt from MCP server before each interaction
    try {
      const latestPrompt = await fetchCurrentPrompt()
      console.log('Fetched prompt for chat request:', latestPrompt.substring(0, 100) + '...')
      currentPrompt.value = latestPrompt

      // Update system message in conversation
      if (messages.value.length > 0 && messages.value[0].role === 'system') {
        messages.value[0].content = latestPrompt
      } else {
        messages.value.unshift({ role: 'system', content: latestPrompt })
      }
    } catch (e: any) {
      console.error('Failed to fetch current prompt:', e)
      // Continue with existing prompt if fetch fails
    }

    // add user msg
    const userMsg: Msg = { role: 'user', content }
    messages.value.push(userMsg)

    // reactive assistant placeholder
    const assistant = reactive<Msg>({ role: 'assistant', content: '' })
    messages.value.push(assistant)

    // Extract base provider for backward compatibility
    const baseProvider = provider.value.split('-')[0] as 'anthropic' | 'openai'

    let payload: any = {
      provider: baseProvider,
      providerMode: provider.value,
      model: modelByProvider[provider.value],
      system: currentPrompt.value,
      messages: messages.value.filter(m => m.role !== 'system'),
      maxTokens: 16384,
      temperature: 0.2
    }

    // For client MCP modes, enhance payload with tools
    if (isClientMcpMode(provider.value)) {
      try {
        console.log('Client MCP mode detected - discovering tools...')
        payload = await enhancePayloadWithTools(payload, provider.value)
        console.log('Enhanced payload with tools:', payload.tools?.length || 0, 'tools available')
      } catch (error) {
        console.error('Error enhancing payload with tools:', error)
        // Continue without tools if discovery fails
      }
    }

    console.log('🚀 Sending chat request with system prompt:', payload.system.substring(0, 100) + '...')
    console.log('📡 Using provider:', payload.provider, 'Model:', payload.model)
    console.log('🔧 Provider mode:', payload.providerMode, 'Tools enabled:', !!payload.tools?.length)
    console.log('🎯 Final payload summary:', {
      provider: payload.provider,
      providerMode: payload.providerMode,
      toolCount: payload.tools?.length || 0,
      messageCount: payload.messages?.length || 0
    })

    // batch tiny deltas to the next animation frame
    let pending = ''
    let raf = 0
    const flush = () => {
      if (!pending) return
      assistant.content += pending
      pending = ''
      raf = 0
    }

    // Track actual response content separate from tool display
    let actualContent = ''

    try {
      const closeFunction = await openChatStreamWithToolCalling(
        payload,
        (delta: string) => {
          // Track actual content for recording
          actualContent += delta
          // Show to user immediately
          pending += delta
          if (!raf) raf = requestAnimationFrame(flush)
        },
        (err: any) => {
          error.value = typeof err === 'string' ? err : JSON.stringify(err, null, 2)
        },
        {
          debug: false,
          // Handle tool display messages separately - show to user but don't record
          onToolDisplay: (message: string) => {
            // Show tool message to user immediately
            pending += `\n\n${message}\n\n`
            if (!raf) raf = requestAnimationFrame(flush)
          },
          // ✅ When the stream ends, record interaction and refresh chat history
          onDone: async () => {
            stop.value = null
            try {
              // Record only the actual LLM content, not tool display messages
              await recordInteraction({
                player_entry: userMsg.content,
                game_response: actualContent.trim(),
              })
              await loadTranscriptToMessages()
              if (onDone) await onDone()
            } catch (e: any) {
              error.value = `MCP error: ${e?.message ?? String(e)}`
            }
          }
        }
      )

      // Only set stop.value if it hasn't been cleared by onDone callback
      if (stop.value !== null) {
        stop.value = closeFunction
      }
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      cancel()
    }
  }

  async function viewCurrentPrompt(): Promise<string> {
    try {
      return await fetchCurrentPrompt()
    } catch (e: any) {
      return `Error fetching prompt: ${e?.message ?? String(e)}`
    }
  }

  return {
    // State
    provider,
    currentPrompt,
    messages,
    error,
    stop,

    // Actions
    loadTranscriptToMessages,
    cancel,
    newChat,
    sendMessage,
    viewCurrentPrompt
  }
}