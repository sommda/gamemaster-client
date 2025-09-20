<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ChatInterface from '@/components/Chat/ChatInterface.vue'
import GameSidebar from '@/components/Sidebar/GameSidebar.vue'
import { useChat } from '@/composables/useChat'
import { useGameData } from '@/composables/useGameData'

// Initialize composables
const chat = useChat()
const gameData = useGameData()

// Chat interface ref for scrolling
const chatInterface = ref<InstanceType<typeof ChatInterface> | null>(null)

// Initialize data on page load
onMounted(async () => {
  // Load existing transcript and game data on page load
  await chat.loadTranscriptToMessages()
  await gameData.refreshGameData()
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

async function handleViewPrompt() {
  try {
    const prompt = await chat.viewCurrentPrompt()
    alert(`Current System Prompt:\n\n${prompt}`)
  } catch (e: any) {
    alert(`Error fetching prompt: ${e?.message ?? String(e)}`)
  }
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
        @send="handleSend"
        @new-chat="handleNewChat"
        @change-provider="(p: 'anthropic' | 'openai') => chat.provider.value = p"
        @view-prompt="handleViewPrompt"
      />

      <!-- System settings component temporarily disabled -->
      <!-- <transition name="fade">
        <SystemSettings
          v-if="settings.showSettings.value"
        />
      </transition> -->
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