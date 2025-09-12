// composables/useChatStream.ts
export function useChatStream() {
  async function openChatStream(
    payload: any,
    onText: (t: string) => void,
    onError?: (err: any) => void,
    opts?: { debug?: boolean }
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

    es.onmessage = (ev) => {
      try {
        const obj = JSON.parse(ev.data)
        if (typeof obj.text === 'string') onText(obj.text)
        if (obj.done) es.close()
      } catch {}
    }

    // Receive structured server errors (with details)
    es.addEventListener('llm-error', (ev) => {
      try {
        const obj = JSON.parse((ev as MessageEvent).data)
        onError?.(obj)
      } catch (e) {
        onError?.({ code: 'bad_error_frame', raw: (ev as MessageEvent).data })
      }
      es.close()
    })

    // Transport-level errors (no body)
    es.onerror = () => onError?.({ code: 'transport', message: 'EventSource connection error (check Network tab and server logs)' })

    return () => es.close()
  }

  return { openChatStream }
}
