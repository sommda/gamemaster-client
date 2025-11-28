<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import ChatMessage from './ChatMessage.vue'
import ChatComposer from './ChatComposer.vue'
import type { ProviderMode } from '~/composables/useChat'

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

const props = defineProps<{
  messages: Msg[]
  provider: ProviderMode
  error: string | null
  isPaginationPaused?: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
  newChat: []
  changeProvider: [provider: ProviderMode]
  viewPrompt: []
  paginationContinue: []
  paginationInterrupt: []
}>()

const userInput = ref('')
const chatBox = ref<HTMLElement | null>(null)
const lastUserInputLength = ref(0)

const visibleMessages = computed(() => props.messages.filter(m => m.role !== 'system'))

function scrollToBottom() {
  nextTick(() => chatBox.value?.scrollTo({ top: chatBox.value!.scrollHeight, behavior: 'smooth' }))
}

function onComposerKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function send() {
  const text = userInput.value.trim()
  if (!text) return

  emit('send', text)
  userInput.value = ''
  scrollToBottom()
}

function newChat() {
  emit('newChat')
}

function changeProvider(provider: ProviderMode) {
  emit('changeProvider', provider)
}

function viewPrompt() {
  emit('viewPrompt')
}

/**
 * Handle click on chat box to continue when paused
 */
function handleChatBoxClick() {
  if (props.isPaginationPaused) {
    emit('paginationContinue')
  }
}

// Watch for user typing to trigger interrupt when paused
watch(
  () => userInput.value,
  (newValue) => {
    // Only trigger if paused and user is actually typing (adding characters)
    if (props.isPaginationPaused && newValue.length > lastUserInputLength.value) {
      emit('paginationInterrupt')
    }
    lastUserInputLength.value = newValue.length
  }
)

// Reset lastUserInputLength when paused state changes
watch(
  () => props.isPaginationPaused,
  (isPaused) => {
    if (isPaused) {
      // When entering paused state, track current input length
      lastUserInputLength.value = userInput.value.length
    }
  }
)

// Auto-scroll when messages change (for streaming)
watch(
  () => props.messages,
  () => {
    // Use nextTick to ensure DOM is updated
    nextTick(() => {
      scrollToBottom()
    })
  },
  { deep: true }
)

/**
 * Get the current chat box height
 */
function getChatBoxHeight(): number {
  return chatBox.value?.clientHeight || 0
}

// Expose scrollToBottom and getChatBoxHeight for parent component
defineExpose({
  scrollToBottom,
  getChatBoxHeight
})
</script>

<template>
  <div class="chat-interface">
    <div class="toolbar">
      <div class="left-side">
        <label class="toolbar-item">
          Provider:
          <select :value="provider" @change="changeProvider(($event.target as HTMLSelectElement).value as ProviderMode)">
            <option value="anthropic-client-mcp">Anthropic (Client MCP)</option>
            <option value="openai-client-mcp">OpenAI (Client MCP)</option>
            <option value="anthropic-server-mcp">Anthropic (Server MCP)</option>
          </select>
        </label>
        <button class="btn" @click="newChat">New chat</button>
      </div>
      <div class="right-side">
        <button class="btn secondary" @click="viewPrompt">👁️ View Prompt</button>
      </div>
    </div>

    <div ref="chatBox" class="chat-box" @click="handleChatBoxClick">
      <ChatMessage
        v-for="(message, i) in visibleMessages"
        :key="i"
        :message="message"
        :is-paused="isPaginationPaused && i === visibleMessages.length - 1"
      />
    </div>

    <ChatComposer
      v-model:user-input="userInput"
      @send="send"
      @keydown="onComposerKeydown"
    />

    <pre v-if="error" class="error">⚠️ {{ error }}</pre>
  </div>
</template>

<style scoped>
.chat-interface {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.left-side, .right-side {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn {
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  background: #111;
  color: #fff;
  cursor: pointer;
}

.btn.secondary {
  background: #334155;
}

.btn.danger {
  background: #b91c1c;
}

.btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.chat-box {
  height: 60vh;
  overflow: auto;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
}

.chat-box:has(.more-indicator) {
  cursor: pointer;
}

.error {
  color: #b00020;
  white-space: pre-wrap;
  background: #fff3f3;
  border: 1px solid #f3c0c0;
  border-radius: 8px;
  padding: 8px;
}
</style>