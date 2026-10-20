// MOSS-550C skin — client entry.
// Bundled by scripts/build.mjs; SKIN_CSS and LENS_SVG are injected there.

const name = 'dsh-skin-moss-550c'
// Declared services only: cordis Proxy throws on reading an undeclared service
// (e.g. ctx.remote) and that fails plugin activation. remote.account mirrors the
// official settings-account plugin's own declaration.
const inject = ['theme', 'remote', 'remote.account']

/* ------------------------------------------------------------------ */
/* live cost estimate                                                  */
/* ------------------------------------------------------------------ */
// ¥ per 1M output tokens. DSH exposes a live tok/s rate but no price, so the
// money figure is an ESTIMATE: tokens are integrated from the measured rate and
// priced here. Edit this constant to match your account.
const PRICE_OUTPUT_PER_MTOK = 8
// How long a frozen rate counts as "generation finished" (the pill keeps its
// last value after a turn ends, so silence has to be detected by value).
const IDLE_AFTER_MS = 3000
// Idle time after which a new burst is treated as a new turn (counter resets).
const NEW_TURN_AFTER_MS = 8000

/* ------------------------------------------------------------------ */
/* skin preference: does the MOSS pupil follow the pointer?            */
/* ------------------------------------------------------------------ */
// localStorage key, so the switch survives a restart.
const TRACK_KEY = 'moss-550c:track'
// Travel limit of the pupil, in lens viewBox units (the SVG is 500x500).
const TRACK_MAX_UNITS = 34
// Per-frame easing toward the pointer target; 0.14 ≈ 100 ms settle time.
const TRACK_EASE = 0.14

function reducedMotion() {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    return false
  }
}

function readTrackingPref() {
  try {
    const store = typeof window !== 'undefined' && window.localStorage
    if (store) {
      const v = store.getItem(TRACK_KEY)
      if (v === 'off') return false
      if (v === 'on') return true
    }
  } catch {}
  // No stored choice: follow the OS accessibility preference.
  return !reducedMotion()
}

function writeTrackingPref(on) {
  try {
    const store = typeof window !== 'undefined' && window.localStorage
    if (store) store.setItem(TRACK_KEY, on ? 'on' : 'off')
  } catch {}
}

// mountLens installs the real setter; the popover switch calls through it.
let lensSetTracking = null

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
function clientMeta() {
  const version =
    (typeof window !== 'undefined' && window.__DSH_BOOT__?.release?.version) ||
    '0.2.1-rc.2'
  return {
    version,
    locale: (typeof navigator !== 'undefined' && navigator.language) || 'zh-CN',
    timezoneOffsetSeconds: new Date().getTimezoneOffset() * -60,
  }
}

function fmtCny(value) {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n.toFixed(2) : '--.--'
}

function sumCny(wallets) {
  if (!Array.isArray(wallets)) return 0
  let total = 0
  for (const w of wallets) {
    if (!w || w.currency !== 'CNY') continue
    const n = Number.parseFloat(w.balance)
    if (Number.isFinite(n)) total += n
  }
  return total
}

/* ------------------------------------------------------------------ */
/* Region 4: MOSS lens — centered in the content column, slides with   */
/* the sidebar (open → right, closed → left).                          */
/* ------------------------------------------------------------------ */
function mountLens(disposers, isDead) {
  if (typeof document === 'undefined' || !document.createElement) return
  const wrap = document.createElement('div')
  wrap.id = 'moss-lens-wrap'
  wrap.innerHTML = LENS_SVG
  document.body.appendChild(wrap)
  disposers.push(() => { try { wrap.remove() } catch {} })

  /* ---- pupil tracking ----------------------------------------------------
     The chassis rings no longer rotate, so the only motion left is the iris:
     it leans toward the pointer anywhere in the window and eases back to the
     centre when the switch is off. The offset is written to a wrapper group
     (.m-iris-track) in viewBox units, which composes with the breathing scale
     that stays on .m-iris. */
  const track = typeof wrap.querySelector === 'function'
    ? wrap.querySelector('.m-iris-track')
    : null
  let tracking = readTrackingPref()
  let trackTargetX = 0
  let trackTargetY = 0
  let trackCurX = 0
  let trackCurY = 0
  let trackLoop = 0

  function paintTrack() {
    if (!track || !track.style) return
    track.style.transform =
      'translate3d(' + trackCurX.toFixed(2) + 'px,' + trackCurY.toFixed(2) + 'px,0)'
  }

  function scheduleTrack() {
    if (trackLoop || !track || typeof requestAnimationFrame !== 'function') return
    trackLoop = requestAnimationFrame(trackFrame)
  }

  function trackFrame() {
    trackLoop = 0
    const dx = trackTargetX - trackCurX
    const dy = trackTargetY - trackCurY
    if (Math.abs(dx) < 0.04 && Math.abs(dy) < 0.04) {
      trackCurX = trackTargetX
      trackCurY = trackTargetY
      paintTrack()
      return
    }
    trackCurX += dx * TRACK_EASE
    trackCurY += dy * TRACK_EASE
    paintTrack()
    scheduleTrack()
  }

  function onPointerMove(e) {
    if (!tracking || !track || typeof wrap.getBoundingClientRect !== 'function') return
    const rect = wrap.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 0
    const vh = (typeof window !== 'undefined' && window.innerHeight) || 0
    if (!vw || !vh) return
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    // Viewport halves as the denominator: the pupil reaches full deflection when
    // the pointer hits the edge of the window, wherever the lens happens to be.
    const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (vw / 2)))
    const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (vh / 2)))
    trackTargetX = nx * TRACK_MAX_UNITS
    trackTargetY = ny * TRACK_MAX_UNITS
    scheduleTrack()
  }

  function recentreTrack() {
    trackTargetX = 0
    trackTargetY = 0
    scheduleTrack()
  }

  // Exposed to the popover switch (see mountBalance).
  lensSetTracking = (on) => {
    tracking = !!on
    if (wrap.setAttribute) {
      try { wrap.setAttribute('data-track', tracking ? 'on' : 'off') } catch {}
    }
    if (!tracking) recentreTrack()
  }
  lensSetTracking(tracking)

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    disposers.push(() => window.removeEventListener('pointermove', onPointerMove))
    // Cursor left the window (or the window lost focus): park the pupil.
    window.addEventListener('blur', recentreTrack)
    disposers.push(() => window.removeEventListener('blur', recentreTrack))
    disposers.push(() => {
      if (typeof cancelAnimationFrame === 'function' && trackLoop) {
        cancelAnimationFrame(trackLoop)
        trackLoop = 0
      }
    })
  }

  // The 550W watermark is a separate fixed layer: it belongs in the empty band
  // *below* the composer, so its Y follows the composer's measured bottom edge
  // instead of the lens's own box (which the composer overlaps).
  const mark = document.createElement('div')
  mark.id = 'moss-mark'
  // No <b> for the red zero: the host styles bare inline elements and the glyph
  // came out at a fraction of the size. Inline metrics keep it in line whatever
  // the host CSS does.
  mark.innerHTML =
    '<div class="wm">55<span class="wm-zero" style="color:rgba(255,45,45,0.62);font-size:inherit;' +
    'font-weight:inherit;font-family:inherit;line-height:inherit;vertical-align:baseline">0</span>W</div>' +
    '<div class="wm-sub">Intelligent Quantum Computer 550W [MOSS]</div>'
  document.body.appendChild(mark)
  disposers.push(() => { try { mark.remove() } catch {} })

  const rootStyle =
    typeof document.documentElement !== 'undefined' && document.documentElement.style

  let ro = null
  let roAttached = false
  // last committed centre X; 0 means "never measured yet"
  let lastCx = 0
  if (typeof ResizeObserver === 'function') ro = new ResizeObserver(() => schedule())

  function findRegion() {
    if (!document.querySelector) return null
    return (
      document.querySelector('div[class*="centerCol"]') ||
      document.querySelector('[data-conversation-region]')
    )
  }

  function measure() {
    if (isDead()) return
    const region = findRegion()
    if (ro && !roAttached && region) {
      try { ro.observe(region); roAttached = true } catch {}
    }
    const vw = (typeof window !== 'undefined' && window.innerWidth) ||
      (document.documentElement && document.documentElement.clientWidth) || 1000
    const vh = (typeof window !== 'undefined' && window.innerHeight) ||
      (document.documentElement && document.documentElement.clientHeight) || 700
    let cx = vw / 2
    // Pulled up from 0.58: the lens sat over the composer; 0.46 keeps it in the
    // empty band above it.
    let cy = vh * 0.46
    if (region && typeof region.getBoundingClientRect === 'function') {
      const r = region.getBoundingClientRect()
      if (r.width > 80 && r.height > 80) {
        cx = r.left + r.width / 2
        cy = r.top + r.height * 0.44
      }
    }
    if (rootStyle) {
      // Deadband: the transcript scrollbar appearing/disappearing changes the
      // region width by a few pixels, and re-writing --moss-cx on every rAF made
      // the lens slide sideways in steps. Ignore sub-2px jitter.
      if (Math.abs(cx - lastCx) > 2) {
        rootStyle.setProperty('--moss-cx', cx + 'px')
        lastCx = cx
      } else if (lastCx === 0) {
        rootStyle.setProperty('--moss-cx', cx + 'px')
        lastCx = cx
      }
      rootStyle.setProperty('--moss-cy', cy + 'px')

      // Anchor the watermark under the composer, inside the empty band.
      // Two guards, both learned from a live report of "the 550W text is not
      // visible": (1) sit clear of the composer's own glow, and (2) never let
      // the anchor leave the viewport — a taller composer (or a dock picked up
      // as the seat) used to push it below the fold.
      let markY = cy + vh * 0.3
      const seat =
        document.querySelector('[data-composer-seat]') ||
        document.querySelector('[data-composer-dock]')
      if (seat && typeof seat.getBoundingClientRect === 'function') {
        const s = seat.getBoundingClientRect()
        if (s.height > 20 && s.bottom < vh * 0.94) markY = s.bottom + 26
      }
      // Keep the two-line block on screen (≈60px tall) with a little breathing room.
      markY = Math.max(cy + vh * 0.2, Math.min(markY, vh - 76))
      rootStyle.setProperty('--moss-mark-y', Math.round(markY) + 'px')
    }
  }

  measure()

  // The layout column may mount after the skin; retry a few times.
  if (typeof setTimeout === 'function') {
    for (const delay of [300, 800, 1500, 3000]) {
      setTimeout(() => { if (!isDead()) measure() }, delay)
    }
  }

  let raf = 0
  const schedule = () => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(measure)
    else measure()
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', schedule)
    disposers.push(() => window.removeEventListener('resize', schedule))
  }

  // Track the sidebar collapse attribute on the frame (attributes only).
  if (typeof MutationObserver === 'function' && document.body) {
    const mo = new MutationObserver(schedule)
    try {
      mo.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-sidebar-collapsed'],
      })
    } catch {}
    disposers.push(() => mo.disconnect())
  }

  if (ro) disposers.push(() => ro.disconnect())

  disposers.push(() => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
  })
}

/* ------------------------------------------------------------------ */
/* Region 3: Wandering-Earth planet-engine balance widget.             */
/* Reads account/balance from ctx.remote.account (same source as the   */
/* settings panel); polls on an interval and on window focus.          */
/* ------------------------------------------------------------------ */
/* Engine glyph, drawn with currentColor so the chip can tint it: amber while the
   pointer tracking is on, the stock teal while it is off. It doubles as the
   tracking switch (click / Enter / Space). */
const ENGINE_SVG = `
  <svg class="mb-engine" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="20" cy="13" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M11 13h18" stroke="currentColor" stroke-opacity="0.5" stroke-width="1"/>
    <path d="M20 4a9 9 0 0 1 0 18M20 4a9 9 0 0 0 0 18" stroke="currentColor" stroke-opacity="0.35" fill="none"/>
    <path d="M13 23h14l-2.5 6h-9z" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <path d="M16.5 29.5q3.5 4.5 3.5 9.5q0-5 3.5-9.5z" fill="currentColor" fill-opacity="0.9"/>
    <path d="M18.7 29.5q1.3 3 1.3 6q0-3 1.3-6z" fill="#0c1218" fill-opacity="0.9"/>
  </svg>`

function mountBalance(ctx, disposers, isDead) {
  if (typeof document === 'undefined' || !document.createElement) return
  // Declared in inject above, so ctx.remote.account is a safe read here.
  const account = ctx.remote && ctx.remote.account
  const box = document.createElement('div')
  box.id = 'moss-balance'
  box.innerHTML = `
    <div class="mb-chip" role="button" tabindex="0" aria-label="账户余额">
      <span class="mb-burn" aria-hidden="true"><i></i></span>
      <span class="mb-engine-btn" role="switch" aria-checked="true" tabindex="0"
            aria-label="MOSS 追踪开关" title="MOSS 追踪开关">${ENGINE_SVG}</span>
      <div class="mb-meta">
        <span class="mb-caption">PLANET ENGINE · 余额</span>
        <span class="mb-total"><span class="unit">¥</span><span class="mb-num">--.--</span></span>
        <span class="mb-state mb-state-txt">CONNECTING</span>
      </div>
    </div>
    <div class="mb-panel">
      <div class="mb-panel-head"><span class="led"></span><span>ACCOUNT / BALANCE</span></div>
      <div class="mb-rows">
        <div class="mb-row"><span class="k">充值余额</span><span class="v strong mb-recharge">--</span></div>
        <div class="mb-row"><span class="k">赠金余额</span><span class="v mb-bonus">--</span></div>
        <div class="mb-row"><span class="k">输出单价</span><span class="v mb-price">--</span></div>
        <div class="mb-row"><span class="k">消耗</span><span class="v">按实时 tok/s 估算</span></div>
      </div>
      <div class="mb-setting">
        <span class="k">MOSS 追踪</span>
        <span class="mb-hint">开关：下方小人图标</span>
      </div>
      <div class="mb-actions">
        <button type="button" class="mb-btn mb-usage">查看用量</button>
        <button type="button" class="mb-btn primary mb-topup">去充值</button>
      </div>
    </div>`
  document.body.appendChild(box)
  disposers.push(() => { try { box.remove() } catch {} })

  const numEl = box.querySelector('.mb-num')
  const stateEl = box.querySelector('.mb-state-txt')
  const rechargeEl = box.querySelector('.mb-recharge')
  const bonusEl = box.querySelector('.mb-bonus')
  const priceEl = box.querySelector('.mb-price')
  const chip = box.querySelector('.mb-chip')
  const usageBtn = box.querySelector('.mb-usage')
  const topupBtn = box.querySelector('.mb-topup')

  // Surface the assumed unit price so the money figure is auditable.
  if (priceEl) priceEl.textContent = '¥' + PRICE_OUTPUT_PER_MTOK + ' / M tok'

  let links = { usageUrl: '', topUpUrl: '' }
  // Account status, kept separate from what the chip prints: the chip only shows
  // the consumption figure when the account is usable, and an error label
  // otherwise.
  let accountStatus = 'connecting'

  function render(total, recharge, bonus, status) {
    if (isDead()) return
    if (numEl) numEl.textContent = status === 'ready' ? fmtCny(total) : '--.--'
    if (rechargeEl) rechargeEl.textContent = status === 'ready' ? '¥' + fmtCny(recharge) : '--'
    if (bonusEl) bonusEl.textContent = status === 'ready' ? '¥' + fmtCny(bonus) : '--'
    accountStatus = status
    // The consumption line is the only text line under the balance; render()
    // hands the status over and lets paintCost decide what to print.
    paintCost()
  }

  async function refresh() {
    if (isDead() || !account) return
    try {
      // RPC methods return { ok, value } envelopes; unwrap before reading.
      const rawState = await account.getState()
      const state = rawState && rawState.ok && rawState.value ? rawState.value : rawState
      if (state && state.links) links = state.links
      const signedIn = state && state.status === 'credential-stored'
      if (!signedIn) {
        render(0, 0, 0, 'signed-out')
        return
      }
      const result = await account.getBalance(clientMeta())
      const value = result && result.ok ? result.value : result
      if (value && value.status === 'ready') {
        const recharge = sumCny(value.value)
        const bonus = sumCny(value.bonusWallets)
        render(recharge, recharge, bonus, 'ready')
      } else {
        render(0, 0, 0, 'error')
      }
    } catch {
      if (!isDead()) render(0, 0, 0, 'error')
    }
  }

  // Hover drives the popover: mouse in opens, mouse out closes. The panel is a
  // descendant of #moss-balance, so moving the pointer from the chip into the
  // panel stays inside the element and does not flicker.
  const setOpen = (open) => {
    if (!box.classList) return
    if (open) box.classList.add('open')
    else box.classList.remove('open')
  }
  const toggle = () => setOpen(!(box.classList && box.classList.contains('open')))
  box.addEventListener('mouseenter', () => setOpen(true))
  box.addEventListener('mouseleave', () => setOpen(false))
  // Keyboard / touch still get a way in: focus opens, click toggles.
  box.addEventListener('focusin', () => setOpen(true))
  box.addEventListener('focusout', () => setOpen(false))
  if (chip) {
    chip.addEventListener('click', toggle)
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
    })
  }
  if (usageBtn) usageBtn.addEventListener('click', () => {
    if (links.usageUrl && typeof window !== 'undefined') window.open(links.usageUrl, '_blank')
  })
  if (topupBtn) topupBtn.addEventListener('click', () => {
    if (links.topUpUrl && typeof window !== 'undefined') window.open(links.topUpUrl, '_blank')
  })

  /* ---- skin setting: the chip's engine glyph IS the tracking switch -------
     Amber while the pupil follows the pointer, stock teal while it is parked.
     Clicking it must not bubble into the chip's own popover toggle. */
  const trackToggle = box.querySelector('.mb-engine-btn')
  const setTracked = (on) => {
    if (box.setAttribute) box.setAttribute('data-track', on ? 'on' : 'off')
    if (trackToggle && trackToggle.setAttribute) {
      trackToggle.setAttribute('aria-checked', on ? 'true' : 'false')
    }
    writeTrackingPref(on)
    if (lensSetTracking) lensSetTracking(on)
  }
  if (trackToggle) {
    setTracked(readTrackingPref())
    const flip = (e) => {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
      if (e && typeof e.preventDefault === 'function') e.preventDefault()
      setTracked(box.getAttribute('data-track') !== 'on')
    }
    trackToggle.addEventListener('click', flip)
    trackToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') flip(e)
    })
  }

  refresh()
  let timer = 0
  if (typeof setInterval === 'function') {
    timer = setInterval(refresh, 60_000)
    disposers.push(() => clearInterval(timer))
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('focus', refresh)
    disposers.push(() => window.removeEventListener('focus', refresh))
  }

  /* ---- live usage readout ------------------------------------------------
     The chat package exposes two real values while a turn streams, both as
     `[data-composer-stat]` pills:
       activity → "146 tok/s"      (decode rate)
       usage    → "缓存命中 99.6%"  (cache-hit ratio)
     Neither is a token total, so the output figure is integrated from the
     measured rate (estimate). The cache-hit ratio is shown as the real
     percentage instead of being dressed up as a second number. */
  const burnBar = box.querySelector('.mb-burn i')

  const statTexts = () => {
    if (typeof document.querySelectorAll !== 'function') return []
    return [...document.querySelectorAll('[data-composer-stat]')].map((el) => ({
      stat: el.getAttribute('data-composer-stat') || '',
      text: el.textContent || '',
    }))
  }

  function readTokensPerSecond() {
    const read = (text) => {
      const m = /([\d.,]+)\s*tok\/s/i.exec(text || '')
      if (!m) return null
      const v = Number.parseFloat(m[1].replace(/,/g, ''))
      return Number.isFinite(v) ? v : null
    }
    for (const { stat, text } of statTexts()) {
      if (stat === 'activity') { const v = read(text); if (v !== null) return v }
    }
    for (const { text } of statTexts()) { const v = read(text); if (v !== null) return v }
    return null
  }

  function readCacheHit() {
    for (const { text } of statTexts()) {
      const m = /([\d.]+)\s*%/.exec(text || '')
      if (m) {
        const v = Number.parseFloat(m[1])
        if (Number.isFinite(v)) return v
      }
    }
    return null
  }

  let tokens = 0
  let lastTick = 0
  let lastRate = null
  let rateChangedAt = 0
  let lastActiveAt = 0
  let lastHit = null

  function paintCost() {
    if (isDead()) return
    const now = Date.now()
    const tps = readTokensPerSecond()
    const hit = readCacheHit()
    if (hit !== null) lastHit = hit

    // The rate pill keeps its final value after a turn ends, so "active" means
    // the value is still moving — a frozen number is a finished turn.
    if (tps !== null && tps !== lastRate) {
      lastRate = tps
      rateChangedAt = now
    }
    const streaming = tps !== null && tps > 0 && now - rateChangedAt < IDLE_AFTER_MS

    if (streaming) {
      if (now - lastActiveAt > NEW_TURN_AFTER_MS) tokens = 0 // new burst → new turn
      if (lastTick) tokens += tps * Math.min(2, (now - lastTick) / 1000)
      lastTick = now
      lastActiveAt = now
    } else {
      lastTick = 0
    }

    /* Three lines: caption / balance / state. While a turn streams the state
       line swaps in place to the running cost, so the chip never changes size
       (the earlier multi-row block grew the box and looked like jumping). */
    const live = streaming || (tokens > 0 && now - lastActiveAt < 3000)
    const cost = (tokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK
    const hitText = lastHit === null ? '' : ' · ' + lastHit.toFixed(lastHit < 10 ? 1 : 0) + '%'
    if (stateEl) {
      if (live) stateEl.textContent = '-\u00a5' + cost.toFixed(4) + hitText
      else {
        stateEl.textContent =
          accountStatus === 'ready' ? 'ONLINE · LIVE' :
          accountStatus === 'signed-out' ? 'SIGNED OUT' :
          accountStatus === 'error' ? 'UNAVAILABLE' : 'CONNECTING'
      }
    }
    if (box.setAttribute) {
      if (live) box.setAttribute('data-cost', 'on')
      else if (box.removeAttribute) box.removeAttribute('data-cost')
    }
    if (streaming && box.setAttribute) box.setAttribute('data-burn', 'live')
    else if (box.removeAttribute) box.removeAttribute('data-burn')

    if (burnBar && burnBar.style) {
      if (streaming) {
        const pct = Math.min(100, Math.max(5, Math.round(Math.log10(1 + tps) * 30)))
        burnBar.style.width = pct + '%'
      } else {
        burnBar.style.width = '0%'
      }
    }
  }

  paintCost()
  if (typeof setInterval === 'function') {
    const burnTimer = setInterval(paintCost, 500)
    disposers.push(() => clearInterval(burnTimer))
  }
}

/* ------------------------------------------------------------------ */
function apply(ctx) {
  const style = document.createElement('style')
  style.setAttribute('data-plugin', name)
  style.textContent = SKIN_CSS
  document.head.appendChild(style)
  document.body.setAttribute('data-dsh-skin-moss-550c', '')

  let disposed = false
  const disposers = []
  ctx.effect(
    () => () => {
      disposed = true
      disposers.forEach((d) => { try { d() } catch {} })
    },
    'moss-550c: teardown'
  )

  // Force the built-in dark scheme directly: calling theme.setTheme('dark')
  // throws for an unregistered theme id (unknown ids throw) and is swallowed,
  // leaving light text aliases on our near-black background → invisible UI.
  // The official dark palette activates via body[data-ds-dark-theme]; set the
  // attribute on both body and <html> to cover either mount location.
  const darkTargets = [document.body, document.documentElement]
  for (const el of darkTargets) {
    if (el) { try { el.setAttribute('data-ds-dark-theme', '') } catch {} }
  }
  disposers.push(() => {
    for (const el of darkTargets) {
      try { el && el.removeAttribute('data-ds-dark-theme') } catch {}
    }
  })

  mountLens(disposers, () => disposed)
  mountBalance(ctx, disposers, () => disposed)
}

exports.name = name
exports.inject = inject
exports.apply = apply
