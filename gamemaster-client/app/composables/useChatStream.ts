// composables/useChatStream.ts
export function useChatStream() {
  type Err = any
  type Opts = { debug?: boolean; onDone?: () => void }

  async function openChatStream(
    payload: any,
    onText: (t: string) => void,
    onError?: (err: Err) => void,
    opts?: Opts
  ) {
    // 1) create session
    const resp = await fetch('/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin'
    })
    if (!resp.ok) throw new Error(await resp.text())
    const { sid } = await resp.json()

    // 2) open EventSource
    const origin = window.location.origin
    const url = `${origin}/api/chat/stream?sid=${encodeURIComponent(sid)}${opts?.debug ? '&debug=1' : ''}`
    const es = new EventSource(url)

    const safeDone = () => {
      try { opts?.onDone?.() } finally { es.close() }
    }

    es.onmessage = (ev) => {
      try {
        const obj = JSON.parse(ev.data)
        if (typeof obj.text === 'string') onText(obj.text)
        if (obj.done) safeDone()
      } catch {
        // ignore non-JSON frames
      }
    }

    es.addEventListener('llm-error', (ev) => {
      try {
        const obj = JSON.parse((ev as MessageEvent).data)
        onError?.(obj)
      } catch (e) {
        onError?.({ code: 'bad_error_frame', raw: (ev as MessageEvent).data })
      } finally {
        safeDone()
      }
    })

    es.onerror = () => {
      onError?.({ code: 'transport', message: 'EventSource connection error' })
      safeDone()
    }

    // Return a close function that also signals done
    return () => safeDone()
  }

  return { openChatStream }
}

