// composables/useClientToolCalling.ts - Client-side tool calling orchestration
import { useToolCalling } from './useToolCalling'
import type { ProviderMode } from './useChat'

export function useClientToolCalling() {
  const {
    getAnthropicToolDefinitions,
    getOpenAIToolDefinitions,
    executeMcpTools
  } = useToolCalling()

  // Check if a provider mode requires client-side tool calling
  function isClientMcpMode(providerMode: ProviderMode): boolean {
    return providerMode.endsWith('-client-mcp')
  }

  // Get tools for a specific provider mode
  async function getToolsForProvider(providerMode: ProviderMode) {
    if (!isClientMcpMode(providerMode)) {
      return []
    }

    const baseProvider = providerMode.split('-')[0]

    console.log('🔧 Getting tools for provider:', baseProvider)

    if (baseProvider === 'anthropic') {
      const tools = await getAnthropicToolDefinitions()
      console.log('🎯 Anthropic tools discovered:', tools.length)
      console.log('🔍 First 3 tools:', tools.slice(0, 3))
      return tools
    } else if (baseProvider === 'openai') {
      const tools = await getOpenAIToolDefinitions()
      console.log('🎯 OpenAI tools discovered:', tools.length)
      console.log('🔍 First 3 tools:', tools.slice(0, 3))
      return tools
    }

    return []
  }

  // Enhance payload with tools for client MCP modes
  async function enhancePayloadWithTools(payload: any, providerMode: ProviderMode) {
    if (!isClientMcpMode(providerMode)) {
      console.log('⚪ Not client MCP mode, returning payload unchanged')
      return payload // No changes for server MCP modes
    }

    console.log('🔧 Enhancing payload with tools for client MCP mode')
    const tools = await getToolsForProvider(providerMode)

    if (tools.length === 0) {
      console.log('❌ No tools available, returning payload unchanged')
      return payload // No tools available
    }

    console.log('✅ Enhanced payload with', tools.length, 'tools')
    const enhancedPayload = {
      ...payload,
      tools
    }

    // Log a sample of what we're sending
    console.log('📋 Enhanced payload summary:', {
      originalKeys: Object.keys(payload),
      enhancedKeys: Object.keys(enhancedPayload),
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
            console.error('Error parsing tool call JSON:', parseError)
          }
        }
      } else if (provider === 'openai') {
        // OpenAI format: tool calls are in structured response
        // For streaming, we'd need to parse the tool_calls field
        // TODO: Implement OpenAI streaming tool call parsing
      }
    } catch (error) {
      console.error('Error parsing tool calls:', error)
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
      console.error('Error executing tool calls:', error)
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
      console.log('Client MCP mode detected - tools will be handled client-side')
      console.log('Available tools:', enhancedPayload.tools?.length || 0)

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