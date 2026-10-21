export async function readSseEvents<T>(
  body: ReadableStream<Uint8Array>,
  eventName: string,
  onEvent: (payload: T) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      let event = ''
      let payload = ''
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        else if (line.startsWith('data: ')) payload += line.slice(6)
      }
      if (event !== eventName || !payload) continue
      try {
        onEvent(JSON.parse(payload) as T)
      } catch {
      }
    }
  }
}
