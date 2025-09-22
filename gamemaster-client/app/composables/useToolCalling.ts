// composables/useToolCalling.ts
import { useMcpClient } from './useMcpClient'

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  tool_call_id: string
  content: string
}

export interface AnthropicTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, any>
      required?: string[]
    }
  }
}

export function useToolCalling() {
  const { getClient } = useMcpClient()

  // Discover available MCP tools
  async function getMcpTools() {
    try {
      console.info('Getting MCP tools')
      const client = await getClient()
      const toolList = await client.listTools()
      return toolList.tools || []
    } catch (error) {
      console.error('Failed to fetch MCP tools:', error)
      return []
    }
  }

  // Convert MCP tool schema to Anthropic format
  function convertMcpToAnthropicTool(mcpTool: any): AnthropicTool {
    return {
      name: mcpTool.name,
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      input_schema: {
        type: 'object',
        properties: mcpTool.inputSchema?.properties || {},
        required: mcpTool.inputSchema?.required || []
      }
    }
  }

  // Convert MCP tool schema to OpenAI format
  function convertMcpToOpenAITool(mcpTool: any): OpenAITool {
    return {
      type: 'function',
      function: {
        name: mcpTool.name,
        description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
        parameters: {
          type: 'object',
          properties: mcpTool.inputSchema?.properties || {},
          required: mcpTool.inputSchema?.required || []
        }
      }
    }
  }

  // Get tool definitions for Anthropic
  async function getAnthropicToolDefinitions(): Promise<AnthropicTool[]> {
    const mcpTools = await getMcpTools()
    return mcpTools.map(convertMcpToAnthropicTool)
  }

  // Get tool definitions for OpenAI
  async function getOpenAIToolDefinitions(): Promise<OpenAITool[]> {
    const mcpTools = await getMcpTools()
    return mcpTools.map(convertMcpToOpenAITool)
  }

  // Execute tool calls against MCP server
  async function executeMcpTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const client = await getClient()
    const results: ToolResult[] = []

    for (const toolCall of toolCalls) {
      try {
        let args: Record<string, any>
        try {
          args = JSON.parse(toolCall.function.arguments)
        } catch (parseError) {
          results.push({
            tool_call_id: toolCall.id,
            content: `Error parsing tool arguments: ${parseError instanceof Error ? parseError.message : String(parseError)}`
          })
          continue
        }

        const result = await client.callTool({
          name: toolCall.function.name,
          arguments: args
        })

        // Convert MCP result to string format
        let content: string
        if (typeof result === 'string') {
          content = result
        } else if (result && typeof result === 'object') {
          // Handle MCP SDK result format
          const resultContent = (result as any)?.content ?? result
          if (Array.isArray(resultContent) && resultContent[0]?.text) {
            content = resultContent[0].text
          } else if (typeof resultContent?.text === 'string') {
            content = resultContent.text
          } else {
            content = JSON.stringify(result, null, 2)
          }
        } else {
          content = String(result)
        }

        results.push({
          tool_call_id: toolCall.id,
          content
        })
      } catch (error) {
        results.push({
          tool_call_id: toolCall.id,
          content: `Error executing tool ${toolCall.function.name}: ${error instanceof Error ? error.message : String(error)}`
        })
      }
    }

    return results
  }

  return {
    getMcpTools,
    getAnthropicToolDefinitions,
    getOpenAIToolDefinitions,
    executeMcpTools,
    convertMcpToAnthropicTool,
    convertMcpToOpenAITool
  }
}