<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import ChatInterface from '@/components/Chat/ChatInterface.vue'
import SystemSettings from '@/components/Settings/SystemSettings.vue'
import GameSidebar from '@/components/Sidebar/GameSidebar.vue'
import { useChat } from '@/composables/useChat'
import { useGameData } from '@/composables/useGameData'
import { useSettings } from '@/composables/useSettings'

// Initialize composables
const chat = useChat()
const gameData = useGameData()
const settings = useSettings()

// Chat interface ref for scrolling
const chatInterface = ref<InstanceType<typeof ChatInterface> | null>(null)

// Initialize system message persistence
onMounted(async () => {
  try {
    const saved = localStorage.getItem('systemMessage')
    if (saved) chat.systemMsg.value = saved
  } catch {}

  chat.messages.value[0] = { role: 'system', content: chat.systemMsg.value }

  // Load existing transcript and game data on page load
  await chat.loadTranscriptToMessages()
  await gameData.refreshGameData()
})

// Watch system message changes for persistence
watch(chat.systemMsg, (val) => {
  if (!chat.messages.value.length || chat.messages.value[0].role !== 'system') {
    chat.messages.value.unshift({ role: 'system', content: val })
  } else {
    chat.messages.value[0] = { role: 'system', content: val }
  }
  try {
    localStorage.setItem('systemMessage', val)
  } catch {}
})

// Handle chat events
async function handleSend(message: string) {
  await chat.sendMessage(message, async () => {
    await gameData.refreshGameData()
    chatInterface.value?.scrollToBottom()
  })
}

function handleNewChat() {
  chat.newChat()
  gameData.selectedCharacter.value = null
  gameData.characterViewMode.value = 'summary'
}

function handleResetSystem() {
  chat.systemMsg.value = chat.DEFAULT_SYSTEM
}
</script>

<template>
  <div class="layout">
    <div class="left">
      <ChatInterface
        ref="chatInterface"
        :messages="chat.messages.value"
        :provider="chat.provider.value"
        :error="chat.error.value"
        :can-cancel="!!chat.stop.value"
        @send="handleSend"
        @cancel="chat.cancel"
        @new-chat="handleNewChat"
        @toggle-settings="settings.toggleSettings"
        @change-provider="(p: 'anthropic' | 'openai') => chat.provider.value = p"
      />

      <transition name="fade">
        <SystemSettings
          v-if="settings.showSettings.value"
          v-model:system-msg="chat.systemMsg.value"
          @reset="handleResetSystem"
        />
      </transition>
    </div>

    <GameSidebar
      :characters="gameData.characters.value"
      :selected-character="gameData.selectedCharacter.value"
      :character-view-mode="gameData.characterViewMode.value"
      :game-state="gameData.gameState.value"
      @select-character="gameData.selectCharacter"
      @return-to-character-summary="gameData.returnToCharacterSummary"
    />
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}

.left {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity .15s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>