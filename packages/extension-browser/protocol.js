export function daemonOrigin(raw) {
  const message = '로컬 daemon 주소를 http://127.0.0.1:17600 형식으로 입력하세요'
  let url
  try {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error(message)
    url = new URL(raw.trim())
  } catch {
    throw new Error(message)
  }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(message)
  }
  return url.origin
}

export function assertPageUrl(raw) {
  const message = '공유할 웹페이지가 아직 로드되지 않았거나 지원하지 않는 페이지입니다. HTTP(S) 웹페이지를 완전히 연 뒤 해당 탭에서 확장 아이콘을 눌러 연결하세요'
  let url
  try {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error(message)
    url = new URL(raw)
  } catch {
    throw new Error(message)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error(message)
  return url.href
}

export function assertCommand(command, currentUrl, mode) {
  if (mode !== 'agent') throw new Error('You have control; agent actions are paused')
  if (
    !command ||
    typeof command.id !== 'string' ||
    !Number.isFinite(command.expiresAt) ||
    command.expiresAt <= Date.now()
  )
    throw new Error('Expired browser action')
  const action = command.action
  assertPageUrl(currentUrl)
  if (!['snapshot', 'navigate', 'click', 'type', 'scroll', 'key'].includes(action?.action))
    throw new Error('Unsupported browser action')
  if (action.action === 'navigate') assertPageUrl(action.url)
  if (!['navigate', 'snapshot'].includes(action.action) && action.expectedUrl !== currentUrl)
    throw new Error('Page changed; inspect again before acting')
  if (
    action.action === 'click' &&
    ![action.x, action.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 20000)
  )
    throw new Error('Invalid click coordinates')
  if (action.action === 'type' && (typeof action.text !== 'string' || action.text.length > 10000))
    throw new Error('Invalid text')
  if (
    action.action === 'scroll' &&
    (!Number.isFinite(action.deltaY) || Math.abs(action.deltaY) > 10000)
  )
    throw new Error('Invalid scroll distance')
  if (
    action.action === 'key' &&
    !['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowDown', 'ArrowUp'].includes(action.key)
  )
    throw new Error('Unsupported key')
  return action
}
