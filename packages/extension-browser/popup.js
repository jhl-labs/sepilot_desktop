const get = (id) => document.getElementById(id)
const buttons = [...document.querySelectorAll('button')]
let busy = false
let disposed = false
let generation = 0
let timer
let actionError = ''
function render(state) {
  get('connect').hidden = state.connected
  get('controls').hidden = !state.connected
  get('status').textContent = actionError || state.status
}
async function refresh() {
  if (busy || disposed) return
  const startedAt = generation
  try {
    const state = await chrome.runtime.sendMessage({ type: 'status' })
    if (disposed || startedAt !== generation) return
    if (state.error) throw new Error(state.error)
    render(state)
  } catch (error) {
    if (!disposed && startedAt === generation)
      get('status').textContent =
        actionError ||
        `연결 상태를 확인할 수 없습니다. ${String(error?.message ?? error)} 자동으로 다시 확인합니다.`
  }
}
async function poll() {
  await refresh()
  if (!disposed) timer = setTimeout(() => void poll(), 1000)
}
window.addEventListener('pagehide', () => {
  disposed = true
  clearTimeout(timer)
})
async function send(message) {
  if (busy || disposed) return
  busy = true
  generation += 1
  buttons.forEach((button) => {
    button.disabled = true
  })
  try {
    const result = await chrome.runtime.sendMessage(message)
    if (result.error) throw new Error(result.error)
    const state = await chrome.runtime.sendMessage({ type: 'status' })
    if (state.error) throw new Error(state.error)
    if (disposed) return
    actionError = ''
    render(state)
    if (message.type === 'connect' && state.connected) get('token').value = ''
  } catch (error) {
    if (!disposed) {
      actionError = `연결 요청을 완료하지 못했습니다. ${String(error?.message ?? error)} 다시 시도하세요.`
      get('status').textContent = actionError
    }
  } finally {
    busy = false
    if (!disposed)
      buttons.forEach((button) => {
        button.disabled = false
      })
  }
}
get('connect').addEventListener('submit', (event) => {
  event.preventDefault()
  void send({
    type: 'connect',
    origin: get('origin').value,
    label: get('label').value,
    token: get('token').value,
  })
})
get('pause').addEventListener('click', () => void send({ type: 'pause' }))
get('stop').addEventListener('click', () => void send({ type: 'stop' }))
try {
  const saved = await chrome.storage.local.get(['origin', 'label'])
  if (saved.origin) get('origin').value = saved.origin
  if (saved.label) get('label').value = saved.label
} catch {
}
await poll()
