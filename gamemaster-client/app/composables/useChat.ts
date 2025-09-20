import { ref, reactive } from 'vue'
import { useChatStream } from './useChatStream'
import { useMcpClient } from './useMcpClient'

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

export function useChat() {
  const { openChatStream } = useChatStream()
  const { recordInteraction, fetchTranscriptAsMessages, fetchCurrentPrompt } = useMcpClient()

  // --- provider + models ---
  const provider = ref<'anthropic' | 'openai'>('anthropic')
  const modelByProvider: Record<string, string> = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-5'
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

    const payload = {
      provider: provider.value,
      model: modelByProvider[provider.value],
      system: currentPrompt.value,
      messages: messages.value.filter(m => m.role !== 'system'),
      maxTokens: 1024,
      temperature: 0.2
    }

    console.log('Sending chat request with system prompt:', payload.system.substring(0, 100) + '...')
    console.log('Using provider:', payload.provider, 'Model:', payload.model)

    // batch tiny deltas to the next animation frame
    let pending = ''
    let raf = 0
    const flush = () => {
      if (!pending) return
      assistant.content += pending
      pending = ''
      raf = 0
    }

    try {
      stop.value = await openChatStream(
        payload,
        (delta: string) => {
          pending += delta
          if (!raf) raf = requestAnimationFrame(flush)
        },
        (err: any) => {
          error.value = typeof err === 'string' ? err : JSON.stringify(err, null, 2)
        },
        {
          debug: false,
          // ✅ When the stream ends, record interaction and refresh chat history
          onDone: async () => {
            stop.value = null
            try {
              await recordInteraction({
                player_entry: userMsg.content,
                game_response: assistant.content,
              })
              await loadTranscriptToMessages()
              if (onDone) await onDone()
            } catch (e: any) {
              error.value = `MCP error: ${e?.message ?? String(e)}`
            }
          }
        }
      )
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