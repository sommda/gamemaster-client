// server/api/chat/session.post.ts
import { defineEventHandler, readBody, setResponseStatus } from 'h3'

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }
type ChatBody = {
  provider: 'openai' | 'anthropic'
  model: string
  messages: Msg[]
  system?: string
  maxTokens?: number
  temperature?: number
}

// simple in-memory store (dev-friendly). swap for Redis if needed.
const store: Map<string, ChatBody> = (globalThis as any).__CHAT_STORE__ ?? new Map()
;(globalThis as any).__CHAT_STORE__ = store

export default defineEventHandler(async (event) => {
  const body = await readBody<ChatBody>(event)
  if (!body?.provider || !body?.model || !Array.isArray(body?.messages)) {
    setResponseStatus(event, 400); return { error: 'provider, model, messages required' }
  }
  const sid = crypto.randomUUID()
  store.set(sid, body)
  // expire after 2 minutes
  setTimeout(() => store.delete(sid), 120_000)
  return { sid }
})
