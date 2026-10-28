import { assertCommand, assertPageUrl, daemonOrigin } from './protocol.js'

let active = null
let status = '연결되지 않음'
const snapshotExpression = `(() => {
  const controls = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')]
    .map(el => { const r = el.getBoundingClientRect(); return { el, r } })
    .filter(({r}) => r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0)
    .slice(0, 120).map(({el,r}) => ({ tag: el.tagName, role: el.getAttribute('role'),
      label: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('name') || '').slice(0,160),
      value: 'value' in el && el.type !== 'password' && el.type !== 'file' ? String(el.value).slice(0,2000) : undefined,
      checked: 'checked' in el ? el.checked : undefined,
      type: el.getAttribute('type'), x: Math.round(Math.max(0,r.left) + (Math.min(innerWidth,r.right)-Math.max(0,r.left))/2),
      y: Math.round(Math.max(0,r.top) + (Math.min(innerHeight,r.bottom)-Math.max(0,r.top))/2) }));
  const snapshot = {url: location.href.slice(0,8192), title: document.title.slice(0,500), viewport: {width:innerWidth,height:innerHeight},
    text: (document.body?.innerText || '').slice(0,30000), controls};
  let output = JSON.stringify(snapshot);
  while (output.length > 48000) {
    if (snapshot.controls.length) snapshot.controls.pop();
    else snapshot.text = snapshot.text.slice(0, Math.floor(snapshot.text.length / 2));
    output = JSON.stringify(snapshot);
  }
  return output;
})()`

async function request(connection, path, body) {
  const response = await fetch(`${connection.origin}/api/v1/browser/extension/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${connection.token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok)
    throw new Error(`연결 오류 (${response.status}). Desktop에서 연결을 확인하세요.`)
  return response.json()
}

async function cdp(connection, method, params = {}) {
  if (active !== connection) throw new Error('Browser disconnected')
  return chrome.debugger.sendCommand({ tabId: connection.tabId }, method, params)
}

async function pageUrl(tab) {
  let url = tab.url
  if (!url) {
    const result = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.getFrameTree')
    url = result.frameTree?.frame?.url
  }
  return assertPageUrl(url)
}

async function stop(message = '연결 해제됨') {
  const connection = active
  active = null
  status = message
  await chrome.action.setBadgeText({ text: '' })
  if (!connection) return
  clearTimeout(connection.timer)
  await chrome.debugger.detach({ tabId: connection.tabId }).catch(() => {})
  await request(connection, 'disconnect', { id: connection.id }).catch(() => {})
}

async function frame(connection) {
  const tab = await chrome.tabs.get(connection.tabId)
  const url = await pageUrl({ ...tab, id: connection.tabId })
  const shot = await cdp(connection, 'Page.captureScreenshot', {
    format: 'jpeg',
    quality: 45,
    captureBeyondViewport: false,
  })
  const image = `data:image/jpeg;base64,${shot.data}`
  if (image.length > 2_000_000)
    throw new Error('브라우저 창이 너무 큽니다. 창 크기를 줄이고 다시 연결하세요.')
  return { url, title: (tab.title || '').slice(0, 500), image, capturedAt: Date.now() }
}

async function execute(connection, command, version) {
  const tab = await chrome.tabs.get(connection.tabId)
  const action = assertCommand(command, await pageUrl({ ...tab, id: connection.tabId }), connection.mode)
  const send = async (method, params = {}) => {
    if (active !== connection || connection.mode !== 'agent' || connection.version !== version)
      throw new Error('Control changed; action interrupted')
    if (command.expiresAt <= Date.now()) throw new Error('Expired browser action; inspect again before acting')
    return cdp(connection, method, params)
  }
  switch (action.action) {
    case 'snapshot': {
      const result = await send('Runtime.evaluate', {
        expression: snapshotExpression,
        returnByValue: true,
      })
      if (result.exceptionDetails) throw new Error('Page snapshot failed')
      return String(result.result.value ?? '')
    }
    case 'navigate': {
      const result = await send('Page.navigate', { url: action.url })
      if (result.errorText) throw new Error(result.errorText)
      return 'Navigation requested. Inspect the page after loading.'
    }
    case 'click':
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: action.x,
        y: action.y,
        button: 'left',
        clickCount: 1,
      })
      await cdp(connection, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: action.x,
        y: action.y,
        button: 'left',
        clickCount: 1,
      }).catch(() => {})
      break
    case 'type':
      await send('Input.insertText', { text: action.text })
      break
    case 'scroll':
      await send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: 1,
        y: 1,
        deltaX: 0,
        deltaY: action.deltaY,
      })
      break
    case 'key': {
      const codes = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, ArrowDown: 40, ArrowUp: 38 }
      const params = {
        key: action.key,
        code: action.key,
        windowsVirtualKeyCode: codes[action.key],
        ...(action.key === 'Enter' ? { text: '\r' } : {}),
      }
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params })
      await cdp(connection, 'Input.dispatchKeyEvent', { type: 'keyUp', ...params }).catch(() => {})
      break
    }
  }
  return `${action.action} dispatched. Inspect the current page before proceeding.`
}

async function poll(connection) {
  if (active !== connection) return
  try {
    const image = await frame(connection)
    const pauseVersion = connection.pauseVersion
    const result = connection.result
    const response = await request(connection, 'exchange', {
      id: connection.id,
      frame: image,
      ...(result ? { result } : {}),
      ...(connection.paused ? { paused: true } : {}),
    })
    if (active !== connection) return
    if (connection.result === result) connection.result = null
    const pausedDuringExchange = pauseVersion !== connection.pauseVersion
    connection.paused = pausedDuringExchange
    connection.mode = pausedDuringExchange ? 'human' : response.mode
    connection.version = response.controlVersion
    status =
      connection.mode === 'agent'
        ? '에이전트 제어 중 · Desktop에서 과정을 볼 수 있습니다'
        : '직접 조작 중 · Desktop에서 에이전트 제어를 켜세요'
    await chrome.action.setBadgeText({ text: connection.mode === 'agent' ? 'AI' : 'YOU' })
    if (response.command && !connection.busy && connection.mode === 'agent') {
      connection.busy = true
      const version = connection.version
      void execute(connection, response.command, version)
        .then(
          (output) => {
            connection.result = { id: response.command.id, output: output.slice(0, 50000) }
          },
          (error) => {
            connection.result = {
              id: response.command.id,
              error: String(error.message || error).slice(0, 1000),
            }
          },
        )
        .finally(() => {
          connection.busy = false
        })
    }
    connection.timer = setTimeout(() => void poll(connection), 800)
  } catch (error) {
    if (active === connection) await stop(String(error.message || error))
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html'))
    return false
  void (async () => {
    if (message.type === 'status') return { status, connected: Boolean(active) }
    if (message.type === 'stop') {
      await stop()
      return { status }
    }
    if (message.type === 'pause') {
      if (active) {
        active.mode = 'human'
        active.version += 1
        active.paused = true
        active.pauseVersion += 1
      }
      status = '직접 조작 중'
      return { status }
    }
    if (message.type !== 'connect') throw new Error('Unsupported request')
    if (active) throw new Error('먼저 기존 연결을 해제하세요')
    const origin = daemonOrigin(message.origin)
    if (typeof message.token !== 'string' || !message.token.startsWith('sep_ext_'))
      throw new Error('Desktop에서 만든 브라우저 전용 연결 토큰을 입력하세요')
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!Number.isInteger(tab?.id) || tab.id < 0)
      throw new Error('공유할 탭을 찾을 수 없습니다. 웹페이지 탭에서 확장 아이콘을 다시 눌러 연결하세요')
    if (tab.url) assertPageUrl(tab.url)
    const connection = {
      origin,
      token: message.token,
      tabId: tab.id,
      mode: 'human',
      version: 0,
      busy: false,
      paused: false,
      pauseVersion: 0,
      result: null,
    }
    try {
      await chrome.debugger.attach({ tabId: tab.id }, '1.3')
    } catch (attachError) {
      try { await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.getFrameTree') }
      catch { throw attachError }
    }
    try {
      await pageUrl(tab)
      const connected = await request(connection, 'connect', { label: message.label || 'Browser' })
      connection.id = connected.id
      active = connection
      await chrome.storage.local.set({ origin, label: message.label })
      void poll(connection)
      status = '연결됨 · Desktop에서 대화에 연결하세요'
      return { status, connected: true }
    } catch (error) {
      await chrome.debugger.detach({ tabId: tab.id }).catch(() => {})
      throw error
    }
  })().then(respond, (error) => respond({ error: String(error.message || error) }))
  return true
})
chrome.debugger.onDetach.addListener((source) => {
  if (active?.tabId === source.tabId) void stop('브라우저 디버깅이 종료되어 연결을 해제했습니다')
})
chrome.tabs.onRemoved.addListener((tabId) => {
  if (active?.tabId === tabId) void stop('공유한 탭이 닫혔습니다')
})
