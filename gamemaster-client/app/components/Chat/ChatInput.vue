<template>
  <div class="border-t border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
    <!-- Quick Action Buttons -->
    <div v-if="showQuickActions" class="mb-3 flex flex-wrap gap-2">
      <UButton
        v-for="action in quickActions"
        :key="action.label"
        @click="insertQuickAction(action.text)"
        size="xs"
        variant="outline"
        :color="action.color"
        :icon="action.icon"
      >
        {{ action.label }}
      </UButton>
    </div>

    <!-- Main input area -->
    <div class="flex space-x-3">
      <div class="flex-1 relative">
        <UTextarea
          ref="textareaRef"
          v-model="message"
          :placeholder="inputPlaceholder"
          :rows="dynamicRows"
          :disabled="isStreaming"
          class="pr-10"
          @keydown.enter.prevent="handleSubmit"
          @keydown.shift.enter.prevent="addNewLine"
          @keydown.ctrl.enter.prevent="handleSubmit"
          @input="handleInput"
          @focus="showQuickActions = true"
        />
        
        <!-- Command suggestions -->
        <div v-if="showSuggestions && commandSuggestions.length > 0" 
             class="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
          <div
            v-for="(suggestion, index) in commandSuggestions"
            :key="suggestion.command"
            @click="applySuggestion(suggestion)"
            :class="`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
              index === selectedSuggestionIndex ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`"
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-sm">{{ suggestion.command }}</div>
                <div class="text-xs text-gray-500">{{ suggestion.description }}</div>
              </div>
              <UBadge size="xs" :color="suggestion.type === 'dice' ? 'blue' : suggestion.type === 'action' ? 'green' : 'gray'">
                {{ suggestion.type }}
              </UBadge>
            </div>
          </div>
        </div>
        
        <!-- Character counter and quick actions toggle -->
        <div class="absolute bottom-2 right-2 flex items-center space-x-2">
          <span v-if="message.length > 100" class="text-xs text-gray-400">
            {{ message.length }}
          </span>
          <UButton
            @click="showQuickActions = !showQuickActions"
            size="2xs"
            variant="ghost"
            :icon="showQuickActions ? 'i-heroicons-chevron-down' : 'i-heroicons-plus'"
          />
        </div>
      </div>
      
      <UButton
        @click="handleSubmit"
        :disabled="!message.trim() || isStreaming"
        :loading="isStreaming"
        size="lg"
        color="primary"
        :icon="isStreaming ? undefined : 'i-heroicons-paper-airplane'"
      >
        {{ isStreaming ? 'Sending...' : 'Send' }}
      </UButton>
    </div>
    
    <!-- Footer info -->
    <div class="mt-2 flex items-center justify-between">
      <div class="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
        <span>Enter to send • Shift+Enter for new line</span>
        <span v-if="detectedCommands.length > 0" class="flex items-center space-x-1">
          <UIcon name="i-heroicons-command-line" />
          <span>{{ detectedCommands.length }} command{{ detectedCommands.length > 1 ? 's' : '' }} detected</span>
        </span>
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400">
        <span v-if="isConnected" class="flex items-center space-x-1">
          <div class="w-2 h-2 bg-green-500 rounded-full"></div>
          <span>Connected</span>
        </span>
        <span v-else class="flex items-center space-x-1">
          <div class="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          <span>Connecting...</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface CommandSuggestion {
  command: string
  description: string
  type: 'dice' | 'action' | 'spell' | 'command'
}

const chatStore = useChatStore()
const { isStreaming, isConnected } = storeToRefs(chatStore)

const message = ref('')
const textareaRef = ref<HTMLElement>()
const showQuickActions = ref(false)
const showSuggestions = ref(false)
const selectedSuggestionIndex = ref(0)

// Quick actions for common D&D commands
const quickActions = [
  { label: 'Roll d20', text: 'roll 1d20', color: 'blue', icon: 'i-heroicons-cube' },
  { label: 'Initiative', text: 'roll initiative', color: 'red', icon: 'i-heroicons-bolt' },
  { label: 'Attack', text: 'I attack with my ', color: 'red', icon: 'i-heroicons-sword' },
  { label: 'Ability Check', text: 'I make a perception check', color: 'green', icon: 'i-heroicons-eye' },
  { label: 'Cast Spell', text: 'I cast ', color: 'purple', icon: 'i-heroicons-sparkles' },
  { label: 'Rest', text: 'I take a short rest', color: 'cyan', icon: 'i-heroicons-moon' }
]

// D&D command suggestions
const allCommandSuggestions: CommandSuggestion[] = [
  // Dice rolling
  { command: 'roll 1d20', description: 'Standard d20 roll', type: 'dice' },
  { command: 'roll 2d6+3', description: 'Roll with modifier', type: 'dice' },
  { command: 'roll advantage', description: 'Roll with advantage', type: 'dice' },
  { command: 'roll disadvantage', description: 'Roll with disadvantage', type: 'dice' },
  
  // Actions
  { command: 'attack', description: 'Make an attack roll', type: 'action' },
  { command: 'cast spell', description: 'Cast a spell', type: 'spell' },
  { command: 'ability check', description: 'Make an ability check', type: 'action' },
  { command: 'saving throw', description: 'Make a saving throw', type: 'action' },
  { command: 'initiative', description: 'Roll for initiative', type: 'action' },
  
  // Character commands
  { command: 'show character', description: 'Display character sheet', type: 'command' },
  { command: 'show inventory', description: 'Display inventory', type: 'command' },
  { command: 'show spells', description: 'Display spell list', type: 'command' },
  { command: 'level up', description: 'Level up character', type: 'command' },
  { command: 'rest', description: 'Take a rest', type: 'command' }
]

// Dynamic input properties
const inputPlaceholder = computed(() => {
  const placeholders = [
    'Ask your Gamemaster anything...',
    'Type "roll 1d20" for a dice roll...',
    'Try "I attack with my sword"...',
    'Say "I cast fireball"...',
    'Ask "What do I see?"...'
  ]
  return placeholders[Math.floor(Math.random() * placeholders.length)]
})

const dynamicRows = computed(() => {
  const lines = message.value.split('\n').length
  return Math.min(Math.max(lines, 2), 6)
})

// Command detection and suggestions
const detectedCommands = computed(() => {
  const content = message.value.toLowerCase()
  const commands: string[] = []
  
  if (content.includes('roll') || /\bd\d+/i.test(content)) commands.push('dice')
  if (content.includes('attack') || content.includes('hit')) commands.push('combat')
  if (content.includes('spell') || content.includes('cast')) commands.push('magic')
  if (content.includes('check') || content.includes('save')) commands.push('skill')
  if (content.includes('initiative')) commands.push('initiative')
  
  return commands
})

const commandSuggestions = computed(() => {
  const query = message.value.toLowerCase().trim()
  if (query.length < 2) return []
  
  return allCommandSuggestions
    .filter(cmd => 
      cmd.command.toLowerCase().includes(query) || 
      cmd.description.toLowerCase().includes(query)
    )
    .slice(0, 5)
})

// Event handlers
const handleSubmit = async () => {
  if (!message.value.trim() || isStreaming.value) return
  
  const messageContent = message.value.trim()
  message.value = ''
  showSuggestions.value = false
  
  try {
    await chatStore.sendUserMessage(messageContent)
  } catch (error) {
    console.error('Failed to send message:', error)
    message.value = messageContent
  }
}

const addNewLine = () => {
  message.value += '\n'
}

const handleInput = () => {
  showSuggestions.value = commandSuggestions.value.length > 0
}

const insertQuickAction = (actionText: string) => {
  const cursorPos = textareaRef.value?.selectionStart || message.value.length
  const before = message.value.substring(0, cursorPos)
  const after = message.value.substring(cursorPos)
  message.value = before + actionText + after
  
  // Focus back to textarea
  nextTick(() => {
    textareaRef.value?.focus()
    const newPos = cursorPos + actionText.length
    textareaRef.value?.setSelectionRange(newPos, newPos)
  })
}

const applySuggestion = (suggestion: CommandSuggestion) => {
  message.value = suggestion.command
  showSuggestions.value = false
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

// Keyboard navigation for suggestions
const handleKeyNavigation = (event: KeyboardEvent) => {
  if (!showSuggestions.value || commandSuggestions.value.length === 0) return
  
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedSuggestionIndex.value = Math.max(0, selectedSuggestionIndex.value - 1)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedSuggestionIndex.value = Math.min(
      commandSuggestions.value.length - 1,
      selectedSuggestionIndex.value + 1
    )
  } else if (event.key === 'Tab') {
    event.preventDefault()
    applySuggestion(commandSuggestions.value[selectedSuggestionIndex.value])
  }
}

// Click outside to hide suggestions
const clickOutside = (event: Event) => {
  if (!textareaRef.value?.contains(event.target as Node)) {
    showSuggestions.value = false
    showQuickActions.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', clickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', clickOutside)
})
</script>