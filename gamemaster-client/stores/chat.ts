import { defineStore } from 'pinia'
import type { ChatMessage } from '~/types/mcp'
import { debug } from '../utils/debug'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const currentStreamingMessage = ref<ChatMessage | null>(null)
  
  const { callTool, streamChat, isConnected } = useMcpClient()
  
  const addMessage = (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: new Date()
    }
    messages.value.push(newMessage)
    return newMessage
  }
  
  const sendUserMessage = async (content: string) => {
    // Add user message
    const userMessage = addMessage({
      role: 'user',
      content,
      isStreaming: false
    })
    
    // Start streaming assistant response
    const assistantMessage = addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true
    })
    
    currentStreamingMessage.value = assistantMessage
    isStreaming.value = true
    
    try {
      // Stream the response
      let fullResponse = ''
      for await (const token of streamChat(content)) {
        fullResponse += token
        assistantMessage.content = fullResponse
      }
      
      assistantMessage.isStreaming = false
      isStreaming.value = false
      currentStreamingMessage.value = null
      
    } catch (error) {
      debug.error('Error streaming chat:', error)
      assistantMessage.content = 'Sorry, I encountered an error processing your message.'
      assistantMessage.isStreaming = false
      isStreaming.value = false
      currentStreamingMessage.value = null
    }
  }
  
  const clearHistory = () => {
    messages.value = []
    isStreaming.value = false
    currentStreamingMessage.value = null
  }
  
  const generateId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9)
  }
  
  // Initialize with welcome message
  onMounted(() => {
    if (messages.value.length === 0) {
      addMessage({
        role: 'assistant',
        content: 'Welcome to your D&D campaign! I\'m your AI Gamemaster assistant. I can help you manage characters, track quests, run combat, and more. How would you like to begin?'
      })
    }
  })
  
  return {
    messages: readonly(messages),
    isStreaming: readonly(isStreaming),
    currentStreamingMessage: readonly(currentStreamingMessage),
    isConnected,
    sendUserMessage,
    addMessage,
    clearHistory
  }
})