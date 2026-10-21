export function daemonOrigin(raw) {
  const url = new URL(raw)
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Use a local daemon URL, such as http://127.0.0.1:17600')
  }
  return url.origin
}

export function assertPageUrl(raw) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Only HTTP(S) tabs can be shared')
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
