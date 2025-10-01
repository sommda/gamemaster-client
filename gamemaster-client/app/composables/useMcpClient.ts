// composables/useMcpClient.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

type RecordInteractionArgs = {
  player_entry: string
  game_response: string
  campaign_name?: string | null
  session_number?: number | null
}

let client: Client | null = null
let connecting: Promise<Client> | null = null

async function connectClient(): Promise<Client> {
  // Reuse the same instance/tab-wide
  if (client) return client
  if (connecting) return connecting

  connecting = (async () => {
    // Point the client at your Nuxt proxy route (same-origin)
    const base = new URL('/mcp', window.location.origin)
    const transport = new StreamableHTTPClientTransport(base)

    const c = new Client({
      name: 'gamemaster-web',
      version: '1.0.0'
    })

    await c.connect(transport) // ✅ SDK will initialize the session for you
    client = c
    connecting = null
    return c
  })()

  return connecting
}

// Optional: handle one-time reconnect if session expires mid-flight
async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await connectClient()
  try {
    return await fn(c)
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (/session/i.test(msg) || /expired|not\s*found/i.test(msg)) {
      // tear down and reconnect once
      try { await (client as any)?.disconnect?.() } catch {}
      client = null
      const c2 = await connectClient()
      return await fn(c2)
    }
    throw e
  }
}

export function useMcpClient() {
  async function recordInteraction(args: RecordInteractionArgs): Promise<void> {
    await withClient(async (c) => {
      await c.callTool({
        name: 'record_interaction',
        arguments: {
          player_entry: args.player_entry,
          game_response: args.game_response,
          campaign_name: args.campaign_name ?? null,
          session_number: args.session_number ?? null
        }
      })
    })
  }

  async function fetchCurrentTranscript(): Promise<string> {
    return withClient(async (c) => {
      const r = await c.readResource({ uri: 'resource://current_transcript' })
      // SDK returns a ResourceContents envelope; normalize common shapes
      const contents = (r as any)?.contents ?? (r as any)?.content ?? r
      if (Array.isArray(contents) && contents[0]?.text) return contents[0].text as string
      if (typeof contents?.text === 'string') return contents.text
      if (typeof r === 'string') return r as string
      return JSON.stringify(r)
    })
  }

  type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

  async function fetchTranscriptAsMessages(): Promise<Msg[]> {
    return withClient(async (c) => {
      const r = await c.readResource({ uri: 'resource://current_transcript' })
      // SDK returns a ResourceContents envelope; normalize common shapes
      const contents = (r as any)?.contents ?? (r as any)?.content ?? r

      let transcriptData: any = null

      if (Array.isArray(contents) && contents[0]?.text) {
        transcriptData = JSON.parse(contents[0].text)
      } else if (typeof contents?.text === 'string') {
        transcriptData = JSON.parse(contents.text)
      } else if (typeof contents === 'object') {
        transcriptData = contents
      } else if (typeof r === 'object') {
        transcriptData = r
      }

      // Handle both formats: entries array or direct entries
      const entries = transcriptData?.entries || transcriptData || []

      if (!Array.isArray(entries)) {
        return []
      }

      const messages: Msg[] = []

      // Convert transcript entries to message format
      for (const entry of entries) {
        if (entry.player_entry) {
          messages.push({
            role: 'user',
            content: entry.player_entry
          })
        }

        if (entry.game_response) {
          messages.push({
            role: 'assistant',
            content: entry.game_response
          })
        }
      }

      return messages
    })
  }

  // (Optional) expose the raw client if you need listTools, listResources, etc.
  async function getClient(): Promise<Client> {
    return connectClient()
  }

  async function fetchCurrentCampaign(): Promise<any> {
    return withClient(async (c) => {
      const r = await c.readResource({ uri: 'resource://current_campaign' })
      // SDK returns a ResourceContents envelope; normalize common shapes
      const contents = (r as any)?.contents ?? (r as any)?.content ?? r

      // The current campaign resource returns just the campaign name as a string
      let campaignName: string | null = null

      if (Array.isArray(contents) && contents[0]?.text) {
        campaignName = String(contents[0].text).replace(/^"|"$/g, '') // Remove surrounding quotes
      } else if (typeof contents?.text === 'string') {
        campaignName = contents.text.replace(/^"|"$/g, '') // Remove surrounding quotes
      } else if (typeof contents === 'string') {
        campaignName = contents.replace(/^"|"$/g, '') // Remove surrounding quotes
      } else if (typeof r === 'string') {
        campaignName = r.replace(/^"|"$/g, '') // Remove surrounding quotes
      }

      return campaignName || null
    })
  }

  async function fetchCurrentGameState(): Promise<any> {
    return withClient(async (c) => {
      const r = await c.readResource({ uri: 'resource://current_campaign/game_state' })
      // SDK returns a ResourceContents envelope; normalize common shapes
      const contents = (r as any)?.contents ?? (r as any)?.content ?? r

      let gameStateData: any = null

      if (Array.isArray(contents) && contents[0]?.text) {
        gameStateData = JSON.parse(contents[0].text)
      } else if (typeof contents?.text === 'string') {
        gameStateData = JSON.parse(contents.text)
      } else if (typeof contents === 'object') {
        gameStateData = contents
      } else if (typeof r === 'object') {
        gameStateData = r
      }

      return gameStateData || {}
    })
  }

  async function fetchCurrentPrompt(): Promise<string> {
    return withClient(async (c) => {
      const result = await c.getPrompt({ name: 'current_prompt', arguments: {} })

      // Extract the prompt content from the result
      if (result && result.messages && result.messages.length > 0) {
        // Get the first message regardless of role
        const firstMessage = result.messages[0]

        if (firstMessage && firstMessage.content) {
          // Handle the specific format: content.text for MCP prompts
          if (firstMessage.content.type === 'text' && firstMessage.content.text) {
            return firstMessage.content.text
          }
          // Fallback: handle if content is a string
          else if (typeof firstMessage.content === 'string') {
            return firstMessage.content
          }
          // Fallback: handle array format
          else if (Array.isArray(firstMessage.content)) {
            const textContent = firstMessage.content.find((content: any) => content.type === 'text')
            return textContent?.text || ''
          }
        }
      }

      return 'You are a helpful assistant.' // fallback
    })
  }

  return { getClient, recordInteraction, fetchCurrentTranscript, fetchTranscriptAsMessages, fetchCurrentCampaign, fetchCurrentGameState, fetchCurrentPrompt }
}
