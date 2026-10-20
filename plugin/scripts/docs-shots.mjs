// Regenerate the docs screenshots from scripts/harness.html.
//
// Why a harness instead of a screenshot of the running app: a real capture puts
// the account name, the avatar, the session titles and the balance into a file
// that gets published. The harness renders the same bundle (same CSS, same SVG)
// with stub account data, so the images carry the design and nothing personal.
//
// Usage: node scripts/docs-shots.mjs [docsDir]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const root = path.join(here, '..')
const outDir = process.argv[2] || path.join(root, '..', 'docs')
const harnessPath = path.join(here, 'harness.html')
fs.mkdirSync(outDir, { recursive: true })

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9900 + Math.floor(Math.random() * 90)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-docs-'))
const PAGE_URL = 'file:///' + harnessPath.replace(/\\/g, '/')
const WIDTH = 1600
const HEIGHT = 900

if (!fs.existsSync(EDGE)) {
  console.error(`Edge not found at ${EDGE}; pass another Chromium binary in the EDGE constant`)
  process.exit(2)
}

const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--allow-file-access-from-files',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  PAGE_URL,
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await sleep(250)
  }
  throw new Error('no debuggable page target appeared')
}

function cdp(ws) {
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
}

const evalJs = async (send, expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval failed')
  return r.result?.value
}

let exitCode = 0
try {
  const target = await findTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('ws error')), { once: true })
  })
  const send = cdp(ws)
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
  })
  for (let i = 0; i < 40; i += 1) {
    if (await evalJs(send, 'Boolean(window.__harnessReady && document.getElementById("moss-balance"))')) break
    await sleep(150)
  }
  const mounted = await evalJs(send, `JSON.stringify({
    lens: Boolean(document.getElementById('moss-lens-wrap')),
    chip: Boolean(document.getElementById('moss-balance')),
    track: Boolean(document.querySelector('.m-iris-track')),
  })`)
  console.log('mounted:', mounted)
  await evalJs(send, `(() => { const n = document.getElementById('moss-harness-note'); if (n) n.remove(); return true })()`)

  const rectOf = (sel) => evalJs(send, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)

  const shoot = async (clip, scale, file) => {
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      ...(clip ? { clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale } } : {}),
    })
    fs.writeFileSync(path.join(outDir, file), Buffer.from(shot.data, 'base64'))
    console.log(`${file}  ${Math.round(fs.statSync(path.join(outDir, file)).size / 1024)} KB`)
  }

  // 1. Overview: pointer parked right of centre so the pupil is visibly leaning.
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: WIDTH - 40, y: HEIGHT * 0.36, button: 'none',
  })
  await sleep(900)
  await shoot(null, 1, 'preview-lens.png')

  // 2. Chip while a turn streams. The pills fed here are the same
  //    [data-composer-stat] nodes the chat package renders; only the numbers
  //    are demo values.
  const chip = await rectOf('#moss-balance .mb-chip')
  await evalJs(send, `(() => {
    const mk = (stat) => {
      const el = document.createElement('span')
      el.setAttribute('data-composer-stat', stat)
      el.style.cssText = 'display:none'
      document.body.appendChild(el)
      return el
    }
    window.__tps = mk('activity')
    window.__hit = mk('usage')
    window.__hit.textContent = '缂撳瓨鍛戒腑 93%'
    window.__feed = setInterval(() => {
      window.__tps.textContent = (58 + Math.round(Math.random() * 18)) + ' tok/s'
    }, 700)
    return true
  })()`)
  await sleep(4300)
  console.log('cost state:', await evalJs(send, `document.querySelector('.mb-state-txt')?.textContent`))
  await shoot({ x: chip.x - 8, y: chip.y - 8, width: chip.width + 16, height: chip.height + 16 }, 3, 'preview-cost-zoom.png')

  // 3. Popover with the tracking switch, chip back on its idle line.
  await evalJs(send, `clearInterval(window.__feed), window.__tps.remove(), window.__hit.remove(), true`)
  await sleep(4200)
  const panelRect = await evalJs(send, `(() => {
    const box = document.getElementById('moss-balance')
    box.classList.add('open')
    const panel = box.querySelector('.mb-panel')
    const chip = box.querySelector('.mb-chip')
    const a = panel.getBoundingClientRect()
    const b = chip.getBoundingClientRect()
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }
  })()`)
  await sleep(700)
  await shoot({
    x: panelRect.x - 10,
    y: panelRect.y - 10,
    width: panelRect.right - panelRect.x + 20,
    height: panelRect.bottom - panelRect.y + 20,
  }, 2.4, 'preview-settings.png')

  console.log('chip state line:', await evalJs(send, `document.querySelector('.mb-state-txt')?.textContent`))
  ws.close()
} catch (error) {
  console.error('FAILED:', error.message)
  exitCode = 1
} finally {
  edge.kill('SIGKILL')
  await sleep(400)
  fs.rmSync(userDataDir, { recursive: true, force: true })
}
process.exit(exitCode)
