// composables/useMcpClient.ts
import { ref } from 'vue'
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

  // (Optional) expose the raw client if you need listTools, listResources, etc.
  async function getClient(): Promise<Client> {
    return connectClient()
  }

  return { getClient, recordInteraction, fetchCurrentTranscript }
}
