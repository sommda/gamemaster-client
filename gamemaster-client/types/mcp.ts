// MCP (Model Context Protocol) types for gamemaster-mcp server integration

export interface McpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: any
}

export interface McpResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: any
  error?: McpError
}

export interface McpError {
  code: number
  message: string
  data?: any
}

export interface McpToolCall {
  name: string
  arguments: Record<string, any>
}

export interface McpToolResult {
  content: Array<{
    type: 'text' | 'resource' | 'image'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
}

// Specific to gamemaster-mcp server tools
export interface GamemasterTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
  tags?: string[] // Tags for filtering tools by mode (e.g., ["mode:combat", "mode:any"])
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
}

export interface StreamingResponse {
  token: string
  isComplete: boolean
}