<template>
  <div 
    :class="`mb-4 p-3 rounded-lg transition-all duration-200 ${
      message.role === 'user' 
        ? 'bg-blue-100 dark:bg-blue-900 ml-8' 
        : 'bg-gray-100 dark:bg-gray-800 mr-8'
    }`"
  >
    <!-- Message Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center space-x-2">
        <UAvatar
          :alt="message.role === 'user' ? 'You' : 'Gamemaster'"
          :ui="{ background: message.role === 'user' ? 'bg-blue-500' : 'bg-green-500' }"
          size="xs"
        >
          <template #fallback>
            {{ message.role === 'user' ? 'U' : 'GM' }}
          </template>
        </UAvatar>
        <span class="text-sm text-gray-500 dark:text-gray-400 font-medium">
          {{ message.role === 'user' ? 'You' : 'Gamemaster' }}
        </span>
      </div>
      <div class="text-xs text-gray-400">
        {{ formatTime(message.timestamp) }}
      </div>
    </div>
    
    <!-- Message Content -->
    <div class="text-gray-900 dark:text-white">
      <!-- Streaming animation for assistant messages -->
      <div v-if="message.isStreaming && message.role === 'assistant'" class="flex items-center space-x-2 mb-2">
        <div class="flex space-x-1">
          <div class="w-2 h-2 bg-green-500 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
          <div class="w-2 h-2 bg-green-500 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
          <div class="w-2 h-2 bg-green-500 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
        </div>
        <span class="text-sm text-gray-500">Gamemaster is typing...</span>
      </div>
      
      <!-- Render markdown content or plain text -->
      <div v-if="hasMarkdown && !message.isStreaming" class="prose prose-sm dark:prose-invert max-w-none">
        <MDC :value="message.content" />
      </div>
      
      <!-- Plain text with streaming cursor -->
      <div v-else class="whitespace-pre-wrap">
        <span>{{ displayContent }}</span>
        <span v-if="message.isStreaming" class="inline-block w-2 h-5 bg-blue-500 animate-pulse ml-1" />
      </div>
      
      <!-- D&D Command indicators -->
      <div v-if="detectedCommands.length > 0" class="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
        <div class="flex flex-wrap gap-1">
          <UBadge 
            v-for="command in detectedCommands" 
            :key="command"
            size="xs" 
            variant="outline"
            :color="getCommandColor(command)"
          >
            {{ command }}
          </UBadge>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '~/types/mcp'

interface Props {
  message: ChatMessage
}

const props = defineProps<Props>()

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Check if content contains markdown
const hasMarkdown = computed(() => {
  const content = props.message.content
  return /[#*_`\[\]()!]/.test(content) || content.includes('```') || content.includes('**')
})

// Display content with potential streaming animation
const displayContent = computed(() => {
  return props.message.content
})

// Detect D&D commands in user messages
const detectedCommands = computed(() => {
  if (props.message.role !== 'user') return []
  
  const content = props.message.content.toLowerCase()
  const commands: string[] = []
  
  // Common D&D command patterns
  if (content.includes('roll') || content.includes('d20') || /\bd\d+/i.test(content)) {
    commands.push('dice')
  }
  if (content.includes('attack') || content.includes('hit')) {
    commands.push('combat')
  }
  if (content.includes('spell') || content.includes('cast')) {
    commands.push('magic')
  }
  if (content.includes('check') || content.includes('save')) {
    commands.push('skill')
  }
  if (content.includes('initiative') || content.includes('turn')) {
    commands.push('initiative')
  }
  if (content.includes('heal') || content.includes('damage') || content.includes('hp')) {
    commands.push('health')
  }
  if (content.includes('inventory') || content.includes('item') || content.includes('equipment')) {
    commands.push('items')
  }
  if (content.includes('character') || content.includes('stats')) {
    commands.push('character')
  }
  
  return commands
})

const getCommandColor = (command: string) => {
  const colors: Record<string, string> = {
    dice: 'blue',
    combat: 'red',
    magic: 'purple',
    skill: 'green',
    initiative: 'orange',
    health: 'pink',
    items: 'yellow',
    character: 'cyan'
  }
  return colors[command] || 'gray'
}
</script>

<style scoped>
/* Custom prose styling for D&D content */
.prose :deep(h1), 
.prose :deep(h2), 
.prose :deep(h3) {
  @apply text-green-700 dark:text-green-400 font-bold;
}

.prose :deep(strong) {
  @apply text-red-600 dark:text-red-400;
}

.prose :deep(em) {
  @apply text-blue-600 dark:text-blue-400;
}

.prose :deep(code) {
  @apply bg-gray-200 dark:bg-gray-700 rounded px-1;
}

.prose :deep(blockquote) {
  @apply border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20 pl-4 py-2 rounded-r;
}

.prose :deep(ul) {
  @apply space-y-1;
}

.prose :deep(table) {
  @apply text-sm;
}

.prose :deep(th) {
  @apply bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200;
}
</style>