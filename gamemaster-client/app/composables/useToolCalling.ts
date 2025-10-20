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
  tags?: string[]
}

export interface OpenAITool {
  name: string
  description: string
  type: 'function'
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
  tags?: string[]
}

export function useToolCalling() {
  const { getClient } = useMcpClient()

  // Discover available MCP tools
  async function getMcpTools() {
    try {
      console.info('Getting MCP tools')
      const client = await getClient()
      const toolList = await client.listTools()
      const tools = toolList.tools || []

      // Debug: Log raw MCP tools to see if tags are present
      console.log('🔍 Raw MCP tools from server:')
      tools.forEach((tool: any) => {
        console.log(`  - ${tool.name}:`, JSON.stringify(tool, null, 2))
      })

      return tools
    } catch (error) {
      console.error('Failed to fetch MCP tools:', error)
      return []
    }
  }

  // Convert MCP tool schema to Anthropic format
  function convertMcpToAnthropicTool(mcpTool: any): AnthropicTool {
    // Extract tags from _meta._fastmcp.tags if present
    const tags = mcpTool._meta?._fastmcp?.tags || mcpTool.tags
    console.log(`🔄 Converting ${mcpTool.name}: tags =`, tags)

    const converted = {
      name: mcpTool.name,
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      input_schema: {
        type: 'object' as const,
        properties: mcpTool.inputSchema?.properties || {},
        required: mcpTool.inputSchema?.required || []
      },
      tags
    }
    console.log(`✅ Converted ${mcpTool.name}: converted.tags =`, converted.tags)
    return converted
  }

  // Convert MCP tool schema to OpenAI responses API format
  function convertMcpToOpenAITool(mcpTool: any): OpenAITool {
    // Extract tags from _meta._fastmcp.tags if present
    const tags = mcpTool._meta?._fastmcp?.tags || mcpTool.tags

    return {
      name: mcpTool.name,
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      type: 'function',
      parameters: {
        type: 'object' as const,
        properties: mcpTool.inputSchema?.properties || {},
        required: mcpTool.inputSchema?.required || []
      },
      tags
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