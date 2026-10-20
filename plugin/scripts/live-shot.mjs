// Screenshot a live DSH page through the Chrome DevTools Protocol.
//
// `--screenshot` with `--virtual-time-budget` never settles on this app (a
// WebSocket keeps the page busy), so drive a real headless browser instead:
// wait a fixed wall-clock time, then capture whatever is on screen.
//
// Usage: node scripts/live-shot.mjs <url> <out.png> [waitMs] [width] [height] [clickSelector]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const [, , url, out, waitArg, widthArg, heightArg, clickArg] = process.argv
if (!url || !out) {
  console.error('usage: node live-shot.mjs <url> <out.png> [waitMs] [width] [height]')
  process.exit(2)
}
const waitMs = Number(waitArg ?? 8000)
const width = Number(widthArg ?? 1600)
const height = Number(heightArg ?? 900)

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9333 + Math.floor(Math.random() * 200)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-cdp-'))

const edge = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    url,
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      // browser not listening yet
    }
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
  // Emulation gives an exact viewport regardless of the window chrome.
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })

  // Real time: let the client plugins boot, the skin mount, and animations run.
  await sleep(waitMs)

  // First-run notices cover the centre; dismiss them so the capture shows the
  // skin rather than a modal. Unicode escapes keep this safe from file-encoding
  // damage (a previous edit mojibake'd literal Chinese here).
  await send('Runtime.evaluate', {
    expression: `(() => {
      const wanted = ['\\u7ed3\\u675f', '\\u7ee7\\u7eed', '\\u77e5\\u9053\\u4e86', '\\u6211\\u77e5\\u9053\\u4e86', '\\u5f00\\u59cb\\u4f7f\\u7528', 'Continue', 'OK']
      let clicked = 0
      for (const btn of document.querySelectorAll('button, [role=button]')) {
        const text = (btn.textContent || '').trim()
        if (wanted.includes(text)) { btn.click(); clicked += 1 }
      }
      return clicked
    })()`,
    returnByValue: true,
  })
  await sleep(1200)

  // Optional: click a selector before capturing (e.g. open a popover).
  if (clickArg) {
    await send('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(clickArg)}); if (!el) return false; el.click(); return true })()`,
      returnByValue: true,
    })
    await sleep(900)
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`captured ${out} (${fs.statSync(out).size} bytes) after ${waitMs}ms`)

  // Surface page-side errors so a broken plugin is visible instead of silent.
  const state = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      skin: document.body.hasAttribute('data-dsh-skin-moss-550c'),
      lens: Boolean(document.getElementById('moss-lens-wrap')),
      darkPresenter: document.body.hasAttribute('data-ds-dark-theme'),
      bgBase: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
      sidebarFill: getComputedStyle(document.body).getPropertyValue('--dsw-specific-sidebar-fill').trim(),
      brand: getComputedStyle(document.body).getPropertyValue('--dsw-alias-brand-primary').trim(),
      sidebarEl: (() => { const el = document.querySelector('div[class*="sidebarCol"]'); return el ? getComputedStyle(el).backgroundColor : null })(),
      regions: document.querySelectorAll('[data-conversation-region]').length,
    })`,
    returnByValue: true,
  })
  console.log('page state:', state.result?.value ?? state)
  ws.close()
} catch (error) {
  console.error('FAILED:', error.message)
  exitCode = 1
} finally {
  edge.kill('SIGKILL')
  await sleep(500)
  fs.rmSync(userDataDir, { recursive: true, force: true })
}
process.exit(exitCode)
