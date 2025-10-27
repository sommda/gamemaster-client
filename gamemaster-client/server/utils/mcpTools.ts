// server/utils/mcpTools.ts - Server-side MCP tool utilities
import { getRequestURL } from 'h3'
import { debug } from './debug'

// Tool cache to avoid repeated calls
const toolCache = new Map<string, any[]>()
const cacheExpiry = new Map<string, number>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
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
  name: string
  description: string
  type: 'function'
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

// Get MCP tools by using the existing session from the client
async function getMcpTools(event?: any): Promise<any[]> {
  const cacheKey = 'mcp-tools'
  const now = Date.now()

  // Check cache first
  const cached = toolCache.get(cacheKey)
  const expiry = cacheExpiry.get(cacheKey)

  if (cached && expiry && now < expiry) {
    debug.log('Returning cached MCP tools:', cached.length)
    return cached
  }

  debug.log('Fetching MCP tools from server...')

  try {
    // Use the same MCP proxy that handles sessions
    const baseUrl = event ? `${getRequestURL(event).protocol}//${getRequestURL(event).host}` : 'http://localhost:3000'

    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'tools-list',
        method: 'tools/list',
        params: {}
      })
    })

    if (!response.ok) {
      debug.warn('Failed to fetch MCP tools via proxy:', response.status, response.statusText)
      return cached || [] // Return cached version if available
    }

    const result = await response.json()
    const tools = result?.result?.tools || []

    // Cache the result
    toolCache.set(cacheKey, tools)
    cacheExpiry.set(cacheKey, now + CACHE_TTL)

    debug.log('Fetched and cached MCP tools:', tools.length)
    return tools
  } catch (error) {
    debug.warn('Error fetching MCP tools via proxy:', error)
    return cached || [] // Return cached version if available
  }
}

// Convert MCP tool to Anthropic format
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

// Convert MCP tool to OpenAI responses API format
function convertMcpToOpenAITool(mcpTool: any): OpenAITool {
  return {
    name: mcpTool.name,
    description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
    type: 'function',
    parameters: {
      type: 'object',
      properties: mcpTool.inputSchema?.properties || {},
      required: mcpTool.inputSchema?.required || []
    }
  }
}

// Get tool definitions for Anthropic
export async function getAnthropicToolDefinitions(event?: any): Promise<AnthropicTool[]> {
  const cacheKey = 'anthropic-tools'
  const now = Date.now()

  // Check cache first
  const cached = toolCache.get(cacheKey)
  const expiry = cacheExpiry.get(cacheKey)

  if (cached && expiry && now < expiry) {
    debug.log('Returning cached Anthropic tools:', cached.length)
    return cached as AnthropicTool[]
  }

  debug.log('Converting MCP tools to Anthropic format...')
  const mcpTools = await getMcpTools(event)
  const anthropicTools = mcpTools.map(convertMcpToAnthropicTool)

  // Cache the result
  toolCache.set(cacheKey, anthropicTools)
  cacheExpiry.set(cacheKey, now + CACHE_TTL)

  debug.log('Cached Anthropic tools:', anthropicTools.length)
  return anthropicTools
}

// Get tool definitions for OpenAI
export async function getOpenAIToolDefinitions(event?: any): Promise<OpenAITool[]> {
  const cacheKey = 'openai-tools'
  const now = Date.now()

  // Check cache first
  const cached = toolCache.get(cacheKey)
  const expiry = cacheExpiry.get(cacheKey)

  if (cached && expiry && now < expiry) {
    debug.log('Returning cached OpenAI tools:', cached.length)
    return cached as OpenAITool[]
  }

  debug.log('Converting MCP tools to OpenAI format...')
  const mcpTools = await getMcpTools(event)
  const openaiTools = mcpTools.map(convertMcpToOpenAITool)

  // Cache the result
  toolCache.set(cacheKey, openaiTools)
  cacheExpiry.set(cacheKey, now + CACHE_TTL)

  debug.log('Cached OpenAI tools:', openaiTools.length)
  return openaiTools
}

// Clear tool cache (useful for development or when MCP server changes)
export function clearToolCache(): void {
  debug.log('Clearing tool cache')
  toolCache.clear()
  cacheExpiry.clear()
}

// Execute tool calls against MCP server
export async function executeMcpTools(toolCalls: ToolCall[], event?: any): Promise<ToolResult[]> {
  const results: ToolResult[] = []
  const baseUrl = event ? `${getRequestURL(event).protocol}//${getRequestURL(event).host}` : 'http://localhost:3000'

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

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `tool-${toolCall.id}`,
          method: 'tools/call',
          params: {
            name: toolCall.function.name,
            arguments: args
          }
        })
      })

      if (!response.ok) {
        results.push({
          tool_call_id: toolCall.id,
          content: `HTTP error ${response.status}: ${response.statusText}`
        })
        continue
      }

      const result = await response.json()

      if (result.error) {
        results.push({
          tool_call_id: toolCall.id,
          content: `MCP error: ${result.error.message}`
        })
        continue
      }

      // Convert MCP result to string format
      let content: string
      const mcpResult = result.result
      if (typeof mcpResult === 'string') {
        content = mcpResult
      } else if (mcpResult && typeof mcpResult === 'object') {
        // Handle MCP SDK result format
        const resultContent = mcpResult?.content ?? mcpResult
        if (Array.isArray(resultContent) && resultContent[0]?.text) {
          content = resultContent[0].text
        } else if (typeof resultContent?.text === 'string') {
          content = resultContent.text
        } else {
          content = JSON.stringify(mcpResult, null, 2)
        }
      } else {
        content = String(mcpResult)
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