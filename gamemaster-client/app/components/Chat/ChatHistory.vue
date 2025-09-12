<template>
  <div class="flex-1 overflow-y-auto p-4" ref="chatContainer">
    <div class="space-y-2">
      <ChatMessage 
        v-for="message in messages"
        :key="message.id"
        :message="message"
      />
      
      <!-- Connection status -->
      <div v-if="!isConnected" class="text-center py-4">
        <div class="inline-flex items-center space-x-2 text-yellow-600 dark:text-yellow-400">
          <UIcon name="i-heroicons-exclamation-triangle" />
          <span class="text-sm">Connecting to gamemaster server...</span>
        </div>
      </div>
      
      <!-- Empty state -->
      <div v-if="messages.length === 0" class="text-center py-8">
        <div class="text-gray-500 dark:text-gray-400">
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 class="text-lg font-medium mb-2">Welcome to your D&D Campaign!</h3>
          <p class="text-sm max-w-md mx-auto">
            Start a conversation with your AI Gamemaster. Ask questions, request dice rolls, 
            manage your character, or begin your adventure!
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const chatStore = useChatStore()
const { messages, isConnected } = storeToRefs(chatStore)

const chatContainer = ref<HTMLElement>()

// Auto-scroll to bottom when new messages arrive
watch(messages, () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}, { deep: true })
</script>