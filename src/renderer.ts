/**
 * Renderer-side instrumentation for Chromium / React / Webview viewports.
 * Automatically tracks TTFP (Time to First Pixels) and FDC (Frame Drop Count).
 */

export interface RendererVitalsOptions {
  ipcRenderer?: any
  trackScrollFrames?: boolean
  reportIntervalMs?: number
}

export function initRendererVitals(options: RendererVitalsOptions = {}) {
  const ipc = options.ipcRenderer || (typeof window !== 'undefined' ? (window as any).electron?.ipcRenderer || (window as any).ipcRenderer : null)

  function sendReport(vital: 'TTFP' | 'FDC', value: number, label?: string) {
    if (ipc && typeof ipc.invoke === 'function') {
      try {
        ipc.invoke('__app_vitals_report', { vital, value, label }).catch(() => {})
      } catch {}
    }
  }

  // 1. Time to First Pixels (TTFP)
  if (typeof window !== 'undefined' && typeof window.PerformanceObserver === 'function') {
    try {
      const observer = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries()
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint' || entry.name === 'first-paint') {
            sendReport('TTFP', entry.startTime, entry.name)
            observer.disconnect()
            break
          }
        }
      })
      observer.observe({ type: 'paint', buffered: true })
    } catch {
      // Fallback to load time
      window.addEventListener('DOMContentLoaded', () => {
        sendReport('TTFP', performance.now(), 'dom-ready')
      }, { once: true })
    }
  }

  // 2. Frame Drop Counter (FDC) during scroll & animations
  let tracking = true
  let lastFrameTime = performance.now()
  let droppedFrames = 0
  let totalFrames = 0

  function onFrame(now: number) {
    if (!tracking) return
    const delta = now - lastFrameTime
    totalFrames++
    // On 60fps display, a normal frame is 16.6ms. A delta > 25ms indicates a dropped frame.
    if (delta > 25) {
      const skipped = Math.floor(delta / 16.6) - 1
      if (skipped > 0) droppedFrames += skipped
    }
    lastFrameTime = now
    requestAnimationFrame(onFrame)
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(onFrame)
  }

  // Flush frame drop rate every reportIntervalMs (default: 3000ms)
  const flushInterval = setInterval(() => {
    if (totalFrames > 30) {
      const dropRatePercent = Number(((droppedFrames / (totalFrames + droppedFrames)) * 100).toFixed(2))
      sendReport('FDC', dropRatePercent, 'renderer:viewport')
      droppedFrames = 0
      totalFrames = 0
    }
  }, options.reportIntervalMs || 3000)

  if (typeof (flushInterval as any).unref === 'function') {
    ;(flushInterval as any).unref()
  }

  return {
    disconnect: () => {
      tracking = false
      clearInterval(flushInterval)
    },
  }
}
