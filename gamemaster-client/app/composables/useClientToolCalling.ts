// composables/useClientToolCalling.ts - Client-side tool calling orchestration
import { useToolCalling } from './useToolCalling'
import { useMcpClient } from './useMcpClient'
import type { ProviderMode } from './useChat'
import { debug } from '../utils/debug'

export function useClientToolCalling() {
  const {
    getAnthropicToolDefinitions,
    getOpenAIToolDefinitions,
    executeMcpTools
  } = useToolCalling()
  const { fetchCurrentGameState } = useMcpClient()

  // Check if a provider mode requires client-side tool calling
  function isClientMcpMode(providerMode: ProviderMode): boolean {
    return providerMode.endsWith('-client-mcp')
  }

  // Get current active modes from game state
  async function getCurrentModes(): Promise<string[]> {
    try {
      const gameState = await fetchCurrentGameState()
      return gameState?.modes || []
    } catch (error) {
      // Keep as console.warn - this is a critical warning we always want visible
      console.warn('Failed to fetch game modes, defaulting to empty:', error)
      return []
    }
  }

  // Filter tools based on active modes
  // Tools are included if they have:
  // - A tag matching "mode:any"
  // - A tag matching "mode:X" where X is in the activeModes list
  // - No mode tags at all (backwards compatible - includes all untagged tools)
  function filterToolsByModes(tools: any[], activeModes: string[]): any[] {
    // Log all tool tags for debugging
    debug.log('🏷️ Tool tags debugging:')
    tools.forEach((tool: any) => {
      debug.log(`  - ${tool.name}: tags =`, tool.tags || 'undefined')
    })
    debug.log('🎯 Active modes for filtering:', activeModes)

    if (activeModes.length === 0) {
      // No active modes - include all tools
      return tools
    }

    return tools.filter(tool => {
      const tags = tool.tags || []

      // If no tags, exclude the tool
      if (tags.length === 0) {
        return false
      }

      // Check if tool has mode:any tag
      if (tags.includes('mode:any')) {
        return true
      }

      // Check if tool has any mode:X tag where X is in activeModes
      for (const mode of activeModes) {
        if (tags.includes(`mode:${mode}`)) {
          return true
        }
      }

      // Tool doesn't match any active modes
      return false
    })
  }

  // Get tools for a specific provider mode
  async function getToolsForProvider(providerMode: ProviderMode) {
    if (!isClientMcpMode(providerMode)) {
      return []
    }

    const baseProvider = providerMode.split('-')[0]

    debug.log('🔧 Getting tools for provider:', baseProvider)

    if (baseProvider === 'anthropic') {
      const tools = await getAnthropicToolDefinitions()
      debug.log('🎯 Anthropic tools discovered:', tools.length)
      debug.log('🔍 First 3 tools:', tools.slice(0, 3))
      return tools
    } else if (baseProvider === 'openai') {
      const tools = await getOpenAIToolDefinitions()
      debug.log('🎯 OpenAI tools discovered:', tools.length)
      debug.log('🔍 First 3 tools:', tools.slice(0, 3))
      return tools
    }

    return []
  }

  // Enhance payload with tools for client MCP modes
  async function enhancePayloadWithTools(payload: any, providerMode: ProviderMode) {
    if (!isClientMcpMode(providerMode)) {
      debug.log('⚪ Not client MCP mode, returning payload unchanged')
      return payload // No changes for server MCP modes
    }

    debug.log('🔧 Enhancing payload with tools for client MCP mode')

    // Get all available tools
    const allTools = await getToolsForProvider(providerMode)

    if (allTools.length === 0) {
      debug.log('❌ No tools available, returning payload unchanged')
      return payload // No tools available
    }

    // Get current active modes and filter tools
    const activeModes = await getCurrentModes()
    debug.log('🎮 Active game modes:', activeModes)

    const filteredTools = filterToolsByModes(allTools, activeModes)
    debug.log(`🔍 Filtered tools: ${filteredTools.length}/${allTools.length} tools match active modes`)

    if (filteredTools.length === 0) {
      // Keep as console.error - this is a critical error we always want visible
      console.error('⚠️ WARNING: No tools match active modes! This should never happen. Check tool tags and mode configuration.')
      console.error('Active modes:', activeModes)
      console.error('Available tools:', allTools.map((t: any) => ({ name: t.name, tags: t.tags })))
      // Return payload without tools - this is an error condition
      return payload
    }

    debug.log('✅ Enhanced payload with', filteredTools.length, 'filtered tools')

    // Strip tags before sending to LLM (they don't accept custom fields)
    const toolsWithoutTags = filteredTools.map((tool: any) => {
      const { tags, ...toolWithoutTags } = tool
      return toolWithoutTags
    })

    const enhancedPayload = {
      ...payload,
      tools: toolsWithoutTags
    }

    // Log a sample of what we're sending
    debug.log('📋 Enhanced payload summary:', {
      originalKeys: Object.keys(payload),
      enhancedKeys: Object.keys(enhancedPayload),
      activeModes,
      totalTools: allTools.length,
      filteredTools: filteredTools.length,
      toolsSample: enhancedPayload.tools?.slice(0, 2)
    })

    return enhancedPayload
  }

  // Parse tool calls from LLM response
  function parseToolCalls(content: string, provider: string): any[] {
    const toolCalls: any[] = []

    try {
      if (provider === 'anthropic') {
        // Anthropic format: <function_calls>...</function_calls>
        const toolCallMatch = content.match(/<function_calls>(.*?)<\/function_calls>/s)
        if (toolCallMatch) {
          try {
            // Parse the JSON inside function_calls
            const toolCallsData = JSON.parse(toolCallMatch[1].trim())

            // Convert to the expected format
            if (Array.isArray(toolCallsData)) {
              toolCallsData.forEach((call, index) => {
                toolCalls.push({
                  id: `call_${Date.now()}_${index}`,
                  type: 'function',
                  function: {
                    name: call.name,
                    arguments: JSON.stringify(call.parameters || {})
                  }
                })
              })
            } else if (toolCallsData.name) {
              // Single tool call
              toolCalls.push({
                id: `call_${Date.now()}_0`,
                type: 'function',
                function: {
                  name: toolCallsData.name,
                  arguments: JSON.stringify(toolCallsData.parameters || {})
                }
              })
            }
          } catch (parseError) {
            debug.error('Error parsing tool call JSON:', parseError)
          }
        }
      } else if (provider === 'openai') {
        // OpenAI format: tool calls are in structured response
        // For streaming, we'd need to parse the tool_calls field
        // TODO: Implement OpenAI streaming tool call parsing
      }
    } catch (error) {
      debug.error('Error parsing tool calls:', error)
    }

    return toolCalls
  }

  // Execute tool calls and format results
  async function executeToolCalls(toolCalls: any[], provider: string) {
    if (toolCalls.length === 0) return []

    try {
      const results = await executeMcpTools(toolCalls)
      return results
    } catch (error) {
      debug.error('Error executing tool calls:', error)
      return []
    }
  }

  // Create a new chat stream with tool calling support
  async function createToolAwareChatStream(
    payload: any,
    providerMode: ProviderMode,
    onText: (text: string) => void,
    onError?: (error: any) => void,
    options?: { debug?: boolean; onDone?: () => void }
  ) {
    // For client MCP modes, we need to handle tool calling
    if (isClientMcpMode(providerMode)) {
      // Enhance payload with tools
      const enhancedPayload = await enhancePayloadWithTools(payload, providerMode)

      // TODO: Implement streaming with tool call detection and handling
      // For now, log that we're in client tool calling mode
      debug.log('Client MCP mode detected - tools will be handled client-side')
      debug.log('Available tools:', enhancedPayload.tools?.length || 0)

      // For now, fall back to the original payload without tools
      // The proper implementation would:
      // 1. Send enhancedPayload to LLM
      // 2. Monitor stream for tool calls
      // 3. Execute tools client-side when detected
      // 4. Continue conversation with tool results

      return enhancedPayload
    }

    // For server MCP modes, return payload as-is
    return payload
  }

  return {
    isClientMcpMode,
    getToolsForProvider,
    enhancePayloadWithTools,
    parseToolCalls,
    executeToolCalls,
    createToolAwareChatStream
  }
}