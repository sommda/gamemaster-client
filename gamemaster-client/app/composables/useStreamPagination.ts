import { ref, computed } from 'vue'

export type PaginationMode = 'streaming' | 'paused' | 'interrupted'

export interface PaginationState {
  mode: PaginationMode
  buffer: string[]
  renderedContent: string
  pageHeight: number
  currentHeight: number
  messageId: string | null
}

export function useStreamPagination() {
  const mode = ref<PaginationMode>('streaming')
  const buffer = ref<string[]>([])
  const renderedContent = ref('')
  const pageHeight = ref(0)
  const currentHeight = ref(0)
  const messageId = ref<string | null>(null)

  /**
   * Initialize pagination for a new message
   */
  function init(msgId: string, viewportHeight: number) {
    mode.value = 'streaming'
    buffer.value = []
    renderedContent.value = ''
    pageHeight.value = viewportHeight
    currentHeight.value = 0
    messageId.value = msgId
  }

  /**
   * Reset pagination state
   */
  function reset() {
    mode.value = 'streaming'
    buffer.value = []
    renderedContent.value = ''
    pageHeight.value = 0
    currentHeight.value = 0
    messageId.value = null
  }

  /**
   * Add a text delta during streaming
   * Returns the text to render (null if buffered)
   */
  function addDelta(delta: string, estimatedHeightIncrease: number = 0): string | null {
    if (mode.value === 'interrupted') {
      // Don't accept any more deltas if interrupted
      return null
    }

    if (mode.value === 'paused') {
      // Buffer the delta
      buffer.value.push(delta)
      return null
    }

    // Normal streaming mode - check if we should pause
    renderedContent.value += delta
    currentHeight.value += estimatedHeightIncrease

    // Check if we've filled one screen
    if (pageHeight.value > 0 && currentHeight.value >= pageHeight.value) {
      mode.value = 'paused'
      // Return the delta to render before pausing
      return delta
    }

    return delta
  }

  /**
   * User pressed a key to continue
   * Releases buffered content
   */
  function continueStreaming(): string {
    if (mode.value !== 'paused') {
      return ''
    }

    const bufferedText = buffer.value.join('')
    buffer.value = []
    renderedContent.value += bufferedText

    // Reset height tracking for next page
    currentHeight.value = 0
    mode.value = 'streaming'

    return bufferedText
  }

  /**
   * User pressed space to interrupt
   */
  function interrupt() {
    mode.value = 'interrupted'
    buffer.value = []
  }

  /**
   * Flush any remaining buffered content
   * Called when stream ends
   */
  function flushBuffer(): string {
    if (buffer.value.length === 0) {
      return ''
    }

    const bufferedText = buffer.value.join('')
    buffer.value = []
    renderedContent.value += bufferedText
    mode.value = 'streaming'

    return bufferedText
  }

  /**
   * Check if currently paused
   */
  const isPaused = computed(() => mode.value === 'paused')

  /**
   * Check if interrupted
   */
  const isInterrupted = computed(() => mode.value === 'interrupted')

  /**
   * Get current buffer size
   */
  const bufferSize = computed(() => buffer.value.length)

  return {
    // State
    mode: computed(() => mode.value),
    isPaused,
    isInterrupted,
    bufferSize,
    messageId: computed(() => messageId.value),

    // Actions
    init,
    reset,
    addDelta,
    continueStreaming,
    interrupt,
    flushBuffer
  }
}
