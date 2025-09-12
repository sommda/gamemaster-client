import type { McpRequest, McpResponse, McpToolCall, McpToolResult, GamemasterTool } from '~/types/mcp'

interface McpClientConfig {
  serverUrl: string
  reconnectDelay: number
}

export const useMcpClient = () => {
  const config: McpClientConfig = {
    serverUrl: 'ws://localhost:3001', // Default gamemaster-mcp server port
    reconnectDelay: 5000
  }
  
  const connection = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const availableTools = ref<GamemasterTool[]>([])
  const connectionError = ref<string | null>(null)
  
  let requestId = 0
  const pendingRequests = new Map<string | number, {
    resolve: (value: any) => void
    reject: (error: any) => void
  }>()
  
  const generateRequestId = () => ++requestId
  
  const connect = async (): Promise<void> => {
    if (isConnected.value || isConnecting.value) return
    
    return new Promise((resolve, reject) => {
      try {
        isConnecting.value = true
        connectionError.value = null
        
        // Create WebSocket connection to MCP server
        connection.value = new WebSocket(config.serverUrl)
        
        connection.value.onopen = () => {
          isConnected.value = true
          isConnecting.value = false
          connectionError.value = null
          console.log('MCP client connected')
          
          // Initialize MCP protocol handshake
          initializeMcp().then(() => {
            resolve()
          }).catch(reject)
        }
        
        connection.value.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            handleMessage(message)
          } catch (error) {
            console.error('Failed to parse MCP message:', error)
          }
        }
        
        connection.value.onerror = (error) => {
          connectionError.value = 'Connection failed'
          isConnecting.value = false
          isConnected.value = false
          console.error('MCP connection error:', error)
          reject(new Error('WebSocket connection failed'))
        }
        
        connection.value.onclose = () => {
          isConnected.value = false
          console.log('MCP connection closed')
          scheduleReconnect()
        }
        
        // Timeout for connection
        setTimeout(() => {
          if (isConnecting.value) {
            isConnecting.value = false
            connectionError.value = 'Connection timeout'
            connection.value?.close()
            reject(new Error('Connection timeout'))
          }
        }, 10000)
        
      } catch (error) {
        isConnecting.value = false
        connectionError.value = 'Failed to connect'
        console.error('MCP connection error:', error)
        reject(error)
      }
    })
  }
  
  const disconnect = () => {
    if (connection.value) {
      connection.value.close()
      connection.value = null
    }
    isConnected.value = false
    isConnecting.value = false
  }
  
  const handleMessage = (message: McpResponse) => {
    const pending = pendingRequests.get(message.id)
    if (pending) {
      pendingRequests.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message))
      } else {
        pending.resolve(message.result)
      }
    }
  }
  
  const initializeMcp = async (): Promise<void> => {
    try {
      // Send MCP initialization request
      await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        clientInfo: {
          name: 'gamemaster-client',
          version: '1.0.0'
        }
      })
      
      // List available tools after initialization
      await listTools()
    } catch (error) {
      console.error('MCP initialization failed:', error)
      throw error
    }
  }

  const sendRequest = async (method: string, params?: any): Promise<any> => {
    if (!isConnected.value) {
      throw new Error('MCP client not connected')
    }
    
    const id = generateRequestId()
    const request: McpRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }
    
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject })
      
      // Set timeout for request
      const timeout = setTimeout(() => {
        pendingRequests.delete(id)
        reject(new Error(`Request ${method} timed out`))
      }, 30000)
      
      // Override resolve to clear timeout
      const originalResolve = resolve
      const originalReject = reject
      pendingRequests.set(id, { 
        resolve: (value: any) => {
          clearTimeout(timeout)
          originalResolve(value)
        },
        reject: (error: any) => {
          clearTimeout(timeout)
          originalReject(error)
        }
      })
      
      try {
        connection.value?.send(JSON.stringify(request))
      } catch (error) {
        pendingRequests.delete(id)
        clearTimeout(timeout)
        reject(error)
      }
    })
  }
  
  const callTool = async (name: string, params: Record<string, any> = {}): Promise<McpToolResult> => {
    console.log(`Calling tool: ${name}`, params)
    
    try {
      const result = await sendRequest('tools/call', {
        name,
        arguments: params
      })
      
      return {
        content: [{ type: 'text', text: result }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error calling ${name}: ${error}` }],
        isError: true
      }
    }
  }
  
  const streamChat = async function* (message: string): AsyncGenerator<string> {
    console.log('Streaming chat message:', message)
    
    try {
      // For real MCP integration, we'd use tool calls to generate responses
      // For now, we'll implement a hybrid approach with fallback
      
      if (isConnected.value) {
        // Try to use MCP tools for enhanced responses
        try {
          const response = await callTool('generate_response', { message })
          if (response && !response.isError) {
            const text = response.content[0]?.text || 'No response generated.'
            const words = text.split(' ')
            
            for (const word of words) {
              yield word + ' '
              await new Promise(resolve => setTimeout(resolve, 50))
            }
            return
          }
        } catch (error) {
          console.error('MCP tool call failed, falling back to mock:', error)
        }
      }
      
      // Fallback to enhanced mock responses for development
      const response = await generateEnhancedMockResponse(message)
      const words = response.split(' ')
      
      for (const word of words) {
        yield word + ' '
        await new Promise(resolve => setTimeout(resolve, 75))
      }
      
    } catch (error) {
      console.error('Stream chat error:', error)
      yield 'Sorry, I encountered an error processing your message. Please try again.'
    }
  }
  
  const listTools = async (): Promise<GamemasterTool[]> => {
    try {
      const tools = await sendRequest('tools/list')
      availableTools.value = tools
      return tools
    } catch (error) {
      console.error('Failed to list tools:', error)
      return []
    }
  }
  
  // Mock response generator for development
  const generateMockResponse = (method: string, params?: any): any => {
    switch (method) {
      case 'tools/list':
        return [
          {
            name: 'get_campaign_info',
            description: 'Get information about the current campaign',
            inputSchema: { type: 'object', properties: {} }
          },
          {
            name: 'list_characters',
            description: 'List all characters in the campaign',
            inputSchema: { type: 'object', properties: {} }
          },
          {
            name: 'get_character',
            description: 'Get detailed information about a character',
            inputSchema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name']
            }
          }
        ]
      
      case 'tools/call':
        return `Tool ${params?.name} executed successfully with params: ${JSON.stringify(params?.arguments)}`
      
      default:
        return { success: true }
    }
  }
  
  const generateEnhancedMockResponse = async (message: string): Promise<string> => {
    const lowerMessage = message.toLowerCase()
    
    // Dice rolling responses
    if (lowerMessage.includes('roll') || lowerMessage.includes('d20') || /\bd\d+/i.test(message)) {
      const diceResponses = [
        "🎲 Rolling the dice for you... You rolled a **15**! That's a solid result for your action.",
        "🎲 The dice clatter across the table... **Natural 20!** Critical success! Describe how you accomplish this heroically.",
        "🎲 You roll a **8**. Not quite what you hoped for, but let's see how this plays out in the story.",
        "🎲 The dice show **12** + your modifier. That meets the DC! Your action succeeds."
      ]
      return diceResponses[Math.floor(Math.random() * diceResponses.length)]
    }
    
    // Combat/attack responses
    if (lowerMessage.includes('attack') || lowerMessage.includes('hit') || lowerMessage.includes('combat')) {
      const combatResponses = [
        "⚔️ **Combat initiated!** Roll for initiative. The goblin snarls and readies its weapon as you move to strike.",
        "⚔️ Your attack connects! Roll damage. The creature staggers back from the impact of your strike.",
        "⚔️ The enemy parries your attack! They counter-attack. Make a Dexterity saving throw.",
        "⚔️ You strike true! The critical hit deals maximum damage. Describe your epic attack!"
      ]
      return combatResponses[Math.floor(Math.random() * combatResponses.length)]
    }
    
    // Magic/spell responses  
    if (lowerMessage.includes('spell') || lowerMessage.includes('cast') || lowerMessage.includes('magic')) {
      const magicResponses = [
        "✨ **Spell casting!** The magical energies swirl around you as you weave the incantation. Make a spellcasting ability check.",
        "✨ Your spell takes effect! The **Fireball** explodes in a brilliant flash. Enemies in the area must make Dexterity saves.",
        "✨ The healing magic flows through your hands, restoring **2d4+2 hit points** to your target.",
        "✨ Your cantrip succeeds! The minor illusion appears exactly as you intended, fooling nearby creatures."
      ]
      return magicResponses[Math.floor(Math.random() * magicResponses.length)]
    }
    
    // Character/inventory requests
    if (lowerMessage.includes('character') || lowerMessage.includes('inventory') || lowerMessage.includes('sheet')) {
      const characterResponses = [
        "📋 **Character Sheet:** Your character looks ready for adventure! Current HP: 45/50. You're carrying a sword, shield, and 50 gold pieces.",
        "🎒 **Inventory Check:** You have: Longsword, Chain Mail, Shield, Health Potion x2, Thieves' Tools, and 75 gold pieces.",
        "📊 **Stats Update:** STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 13, CHA: 8. You're proficient in Athletics and Intimidation.",
        "🏆 **Level Up Available!** You've gained enough experience to reach level 4. Choose your ability score improvement or feat."
      ]
      return characterResponses[Math.floor(Math.random() * characterResponses.length)]
    }
    
    // Exploration responses
    if (lowerMessage.includes('look') || lowerMessage.includes('see') || lowerMessage.includes('examine')) {
      const explorationResponses = [
        "🔍 **Investigation:** You notice something glinting behind the tapestry on the far wall. Make a Perception check to investigate further.",
        "👁️ **Perception:** The room is dimly lit by flickering torches. You see ancient runes carved into the stone walls and hear faint dripping from somewhere deeper in the dungeon.",
        "🚪 **Exploration:** Three passages branch off from this chamber: north leads upward, east has a cold breeze, and west echoes with distant sounds.",
        "💎 **Discovery:** Your keen eyes spot a hidden compartment in the floor. Inside, you find a small gemstone worth 100 gold pieces!"
      ]
      return explorationResponses[Math.floor(Math.random() * explorationResponses.length)]
    }
    
    // Default responses
    const generalResponses = [
      "🎭 **Welcome to your D&D adventure!** I'm here to help guide your story. What would you like your character to do next?",
      "📖 **Story continues...** The path ahead is full of possibilities. How does your character react to the current situation?",
      "🌟 **Great roleplay!** Your character's personality really shines through. Let's see where this leads us next.",
      "🎲 **Adventure awaits!** Tell me what your character wants to attempt, and I'll help determine the outcome.",
      "⭐ **The story unfolds...** Your choices shape this world. What's your character's next move?"
    ]
    
    return generalResponses[Math.floor(Math.random() * generalResponses.length)]
  }
  
  const scheduleReconnect = () => {
    setTimeout(() => {
      if (!isConnected.value) {
        connect().catch(console.error)
      }
    }, config.reconnectDelay)
  }
  
  // Auto-connect on mount
  onMounted(() => {
    connect().catch(console.error)
  })
  
  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })
  
  return {
    connection: readonly(connection),
    isConnected: readonly(isConnected),
    isConnecting: readonly(isConnecting),
    availableTools: readonly(availableTools),
    connectionError: readonly(connectionError),
    connect,
    disconnect,
    callTool,
    streamChat,
    listTools
  }
}