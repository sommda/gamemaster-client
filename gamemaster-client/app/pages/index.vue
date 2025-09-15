<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, watch } from 'vue'
import StreamMarkdown from '@/components/StreamMarkdown.vue'
import { useChatStream } from '@/composables/useChatStream'

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

const { openChatStream } = useChatStream()
const { recordInteraction, fetchCurrentTranscript, getClient } = useMcpClient()

// --- provider + models ---
const provider = ref<'anthropic' | 'openai'>('anthropic')
const modelByProvider: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-5'
}

// --- system message (configurable) ---
const DEFAULT_SYSTEM = 'You are a helpful assistant.'
const systemMsg = ref<string>(DEFAULT_SYSTEM)
const showSettings = ref(false)

// --- conversation state ---
const messages = ref<Msg[]>([{ role: 'system', content: systemMsg.value }])
const visibleMessages = computed(() => messages.value.filter(m => m.role !== 'system'))

const userInput = ref('')
const error = ref<string | null>(null)
const stop = ref<null | (() => void)>(null) // active stream closer
const chatBox = ref<HTMLElement | null>(null)

// --- transcript panel ---
const showTranscript = ref(true)
const transcript = ref<string>('') // latest transcript text

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

function newChat() {
  messages.value = [{ role: 'system', content: systemMsg.value }]
  error.value = null
  userInput.value = ''
  transcript.value = ''
}

function resetSystem() {
  systemMsg.value = DEFAULT_SYSTEM
}

// Persist + bind system message
onMounted(() => {
  try { const saved = localStorage.getItem('systemMessage'); if (saved) systemMsg.value = saved } catch {}
  messages.value[0] = { role: 'system', content: systemMsg.value }
})
watch(systemMsg, (val) => {
  if (!messages.value.length || messages.value[0].role !== 'system') {
    messages.value.unshift({ role: 'system', content: val })
  } else {
    messages.value[0] = { role: 'system', content: val }
  }
  try { localStorage.setItem('systemMessage', val) } catch {}
})

async function send() {
  const text = userInput.value.trim()
  if (!text || stop.value) return
  error.value = null

  // add user msg
  const userMsg: Msg = { role: 'user', content: text }
  messages.value.push(userMsg)
  userInput.value = ''
  scrollToBottom()

  // reactive assistant placeholder
  const assistant = reactive<Msg>({ role: 'assistant', content: '' })
  messages.value.push(assistant)
  scrollToBottom()

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
      },
      {
        debug: false,
        // ✅ When the stream ends, record interaction and refresh transcript
        onDone: async () => {
          stop.value = null
          try {
            await recordInteraction({
              player_entry: userMsg.content,
              game_response: assistant.content,
            })
            transcript.value = await fetchCurrentTranscript()
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
</script>

<template>
  <div class="layout">
    <div class="left">
      <div class="toolbar">
        <div class="left-side">
          <label class="toolbar-item">
            Provider:
            <select v-model="provider">
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <button class="btn" @click="newChat">New chat</button>
        </div>
        <div class="right-side">
          <button class="btn secondary" @click="showSettings = !showSettings">⚙️ System</button>
          <button class="btn secondary" @click="showTranscript = !showTranscript">{{ showTranscript ? 'Hide' : 'Show' }} Transcript</button>
          <button class="btn danger" :disabled="!stop" @click="cancel">Cancel</button>
        </div>
      </div>

      <transition name="fade">
        <div v-if="showSettings" class="settings">
          <div class="settings-row">
            <label class="settings-label">System message</label>
            <textarea
              v-model="systemMsg"
              class="settings-input"
              rows="4"
              placeholder="Enter the system prompt for this chat..."
            />
          </div>
          <div class="settings-actions">
            <button class="btn" @click="resetSystem">Reset to default</button>
            <span class="hint">Saved to this browser (localStorage)</span>
          </div>
        </div>
      </transition>

      <div ref="chatBox" class="chat-box">
        <div v-for="(m, i) in visibleMessages" :key="i" class="msg" :class="m.role">
          <strong class="role">{{ m.role }}</strong>
          <div class="bubble">
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

    <aside v-if="showTranscript" class="right">
      <h3>Transcript</h3>
      <div class="transcript">
        <StreamMarkdown :source="transcript || '_No transcript yet_'"/>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: 1fr 360px; gap: 16px; max-width: 1200px; margin: 0 auto; padding: 16px; }
.left { display: flex; flex-direction: column; gap: 12px; }
.right { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #f8fafc; overflow:auto; max-height: 80vh; }
.right h3 { margin: 0 0 8px; }

.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.left-side, .right-side { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.toolbar-item { display: flex; gap: 8px; align-items: center; }
.btn { padding: 8px 14px; border: 0; border-radius: 8px; background: #111; color: #fff; cursor: pointer; }
.btn.secondary { background: #334155; }
.btn.danger { background: #b91c1c; }
.btn:disabled { opacity: .5; cursor: not-allowed; }

.settings { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #f8fafc; }
.settings-row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: start; }
.settings-label { padding-top: 6px; color: #475569; }
.settings-input { width: 100%; resize: vertical; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-family: system-ui, sans-serif; }
.settings-actions { display: flex; gap: 12px; align-items: center; margin-top: 8px; }
.hint { color: #64748b; font-size: 12px; }

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

.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.transcript { max-height: calc(80vh - 40px); overflow: auto; }
</style>
