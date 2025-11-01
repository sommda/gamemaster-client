# MCP Sampling Support

This document describes how MCP sampling requests are handled in the gamemaster client.

## Overview

MCP (Model Context Protocol) allows tools to make "sampling requests" - requesting the client to call an LLM on behalf of the tool. This enables tools to leverage AI capabilities during their execution.

## Implementation

### 1. Sampling Capability Enabled

In `useMcpClient.ts`, the MCP client is initialized with the `sampling` capability:

```typescript
const c = new Client(
  {
    name: 'gamemaster-web',
    version: '1.0.0'
  },
  {
    capabilities: {
      sampling: {} // Enable sampling capability
    }
  }
)
```

### 2. Request Handler Setup

The client sets up a request handler for `sampling/createMessage` requests:

```typescript
c.setRequestHandler(CreateMessageRequestSchema, async (request) => {
  const params = request.params
  const result = await handleSamplingRequest({
    messages: params.messages || [],
    modelPreferences: params.modelPreferences,
    systemPrompt: params.systemPrompt,
    includeContext: params.includeContext,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    stopSequences: params.stopSequences,
    metadata: params.metadata
  })
  return result
})
```

### 3. Sampling Handler

The `useSampling.ts` composable handles the actual sampling request:

- Converts MCP sampling messages to the chat API format
- Selects the appropriate model based on preferences (defaults to Claude Sonnet 4.5)
- Calls the chat API via `/api/chat/session` and `/api/chat/stream`
- Returns the LLM response in MCP format

### 4. Response Format

The sampling handler returns a `SamplingResult` containing:

- `role`: 'assistant' or 'user'
- `content`: The LLM's response text
- `model`: The model that was used
- `stopReason`: Why generation stopped ('endTurn', 'stopSequence', 'maxTokens')

## How It Works

1. A tool executing on the MCP server calls `server.createMessage()` with a sampling request
2. The MCP protocol forwards this request to the client
3. The client's request handler receives the `sampling/createMessage` request
4. The handler calls the LLM through the existing chat API infrastructure
5. The LLM response is streamed back and formatted as an MCP sampling result
6. The result is returned to the MCP tool for further processing

## Example Flow

```
MCP Tool
  ↓ (calls server.createMessage())
MCP Server
  ↓ (sends sampling/createMessage request)
MCP Client
  ↓ (handleSamplingRequest)
Chat API (/api/chat/session, /api/chat/stream)
  ↓ (streams response)
LLM (Claude, GPT, etc.)
  ↓ (returns response)
MCP Client
  ↓ (formats as SamplingResult)
MCP Tool (receives LLM response)
```

## Configuration

- **Default Model**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Default Max Tokens**: 4096
- **Default Temperature**: 0.7
- **Provider Mode**: Uses `anthropic-server-mcp` to avoid circular dependencies with client-side tool calling

## Notes

- Sampling requests use the server MCP mode to prevent circular dependencies
- The implementation reuses the existing chat API infrastructure
- Tools can specify model preferences, but the client has final discretion over model selection
- The system prompt from the tool is used if provided, otherwise defaults to a generic prompt
