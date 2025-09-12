<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue'
import { useChatStream } from '@/composables/useChatStream'
import StreamMarkdown from '@/components/StreamMarkdown.vue' // adjust path if needed

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

const { openChatStream } = useChatStream()

// --- state ---
const provider = ref<'anthropic' | 'openai'>('anthropic')
const modelByProvider: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-5'
}
const messages = ref<Msg[]>([{ role: 'system', content: 'You are a helpful assistant.' }])
const userInput = ref('')
const error = ref<string | null>(null)
const stop = ref<null | (() => void)>(null)        // close EventSource when set
const chatBox = ref<HTMLElement | null>(null)

const visibleMessages = computed(() => messages.value.filter(m => m.role !== 'system'))

function scrollToBottom() {
  nextTick(() => chatBox.value?.scrollTo({ top: chatBox.value!.scrollHeight, behavior: 'smooth' }))
}

function onComposerKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function cancel() {
  stop.value?.()
  stop.value = null
}

async function send() {
  const text = userInput.value.trim()
  if (!text || stop.value) return
  error.value = null

  // add user msg
  messages.value.push({ role: 'user', content: text })
  userInput.value = ''
  scrollToBottom()

  // 🔑 assistant placeholder is REACTIVE (so content mutation triggers renders)
  const assistant = reactive<Msg>({ role: 'assistant', content: '' })
  messages.value.push(assistant)
  scrollToBottom()

  const payload = {
    provider: provider.value,
    model: modelByProvider[provider.value],
    system: messages.value.find(m => m.role === 'system')?.content,
    messages: messages.value.filter(m => m.role !== 'system'),
    maxTokens: 1024,
    temperature: 0.2
  }

  // Batch tiny deltas to the next animation frame for smoothness
  let pending = ''
  let raf = 0
  const flush = () => {
    if (!pending) return
    assistant.content += pending
    pending = ''
    raf = 0
    scrollToBottom()
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
        cancel()
      },
      { debug: false }
    )
  } catch (e: any) {
    error.value = e?.message ?? String(e)
    cancel()
  }
}
</script>

<template>
  <div class="chat-layout">
    <div class="toolbar">
      <label class="toolbar-item">
        Provider:
        <select v-model="provider">
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>
      <button class="btn" :disabled="!stop" @click="cancel">Cancel</button>
    </div>

    <div ref="chatBox" class="chat-box">
      <div v-for="(m, i) in visibleMessages" :key="i" class="msg" :class="m.role">
        <strong class="role">{{ m.role }}</strong>
        <div class="bubble">
          <!-- Render markdown live for assistant; plain for user -->
          <StreamMarkdown v-if="m.role === 'assistant'" :source="m.content" />
          <div v-else class="user-text">{{ m.content }}</div>
        </div>
      </div>
    </div>

    <div class="composer">
      <textarea
        v-model="userInput"
        class="input"
        placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
        rows="3"
        @keydown="onComposerKeydown"
      />
      <button class="send btn" @click="send" :disabled="!userInput.trim()">Send</button>
    </div>

    <pre v-if="error" class="error">⚠️ {{ error }}</pre>
  </div>
</template>

<style scoped>
.chat-layout { display: flex; flex-direction: column; gap: 12px; max-width: 860px; margin: 0 auto; padding: 16px; }
.toolbar { display: flex; gap: 12px; align-items: center; }
.toolbar-item { display: flex; gap: 8px; align-items: center; }
.btn { padding: 8px 14px; border: 0; border-radius: 8px; background: #111; color: #fff; cursor: pointer; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.chat-box { height: 60vh; overflow: auto; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa; }
.msg { display: flex; gap: 8px; margin: 6px 0; }
.msg.user .bubble { background: #e8f0fe; }
.msg.assistant .bubble { background: #f1f5f9; }
.role { width: 80px; text-transform: capitalize; }
.bubble { padding: 8px 10px; border-radius: 10px; white-space: normal; flex: 1; }
.user-text { white-space: pre-wrap; }
.composer { display: flex; gap: 8px; align-items: flex-end; }
.input { flex: 1; resize: vertical; padding: 10px; border-radius: 8px; border: 1px solid #ccc; }
.send { margin-left: 6px; }
.error { color: #b00020; white-space: pre-wrap; background: #fff3f3; border: 1px solid #f3c0c0; border-radius: 8px; padding: 8px; }
</style>
