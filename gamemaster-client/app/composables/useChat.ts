import { ref, reactive, nextTick } from 'vue'
import { useChatStream } from './useChatStream'
import { useMcpClient } from './useMcpClient'

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

export function useChat() {
  const { openChatStream } = useChatStream()
  const { recordInteraction, fetchTranscriptAsMessages } = useMcpClient()

  // --- provider + models ---
  const provider = ref<'anthropic' | 'openai'>('anthropic')
  const modelByProvider: Record<string, string> = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-5'
  }

  // --- system message (configurable) ---
  const DEFAULT_SYSTEM = 'You are a helpful assistant.'
  const systemMsg = ref<string>(DEFAULT_SYSTEM)

  // --- conversation state ---
  const messages = ref<Msg[]>([{ role: 'system', content: systemMsg.value }])
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
    messages.value = [{ role: 'system', content: systemMsg.value }]
    error.value = null
  }

  function resetSystem() {
    systemMsg.value = DEFAULT_SYSTEM
  }

  async function sendMessage(content: string, onDone?: () => Promise<void>) {
    if (!content.trim() || stop.value) return
    error.value = null

    // add user msg
    const userMsg: Msg = { role: 'user', content }
    messages.value.push(userMsg)

    // reactive assistant placeholder
    const assistant = reactive<Msg>({ role: 'assistant', content: '' })
    messages.value.push(assistant)

    const payload = {
      provider: provider.value,
      model: modelByProvider[provider.value],
      system: systemMsg.value,
      messages: messages.value.filter(m => m.role !== 'system'),
      maxTokens: 1024,
      temperature: 0.2
    }

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

  return {
    // State
    provider,
    systemMsg,
    messages,
    error,
    stop,
    DEFAULT_SYSTEM,

    // Actions
    loadTranscriptToMessages,
    cancel,
    newChat,
    resetSystem,
    sendMessage
  }
}