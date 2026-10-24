'use strict'

const path = require('node:path')
const fs = require('node:fs')

const PACKAGE_NAME = 'electron-app-vitals'
const BINARY = `app-vitals.${process.platform}-${process.arch}.node`

/**
 * Directories that may hold the package's files. `__dirname` is wrong once a
 * bundler (esbuild, webpack, vite) inlines this file into an app's main
 * bundle, so the package root is also resolved from node_modules.
 */
function packageRoots() {
  const roots = [path.join(__dirname, '..')]
  try {
    roots.push(path.dirname(require.resolve(`${PACKAGE_NAME}/package.json`)))
  } catch {}
  return [...new Set(roots)]
}

function candidatePaths() {
  const out = []
  if (process.env.APP_VITALS_NATIVE_PATH) out.push(process.env.APP_VITALS_NATIVE_PATH)
  for (const root of packageRoots()) {
    // Electron serves packaged apps from app.asar; native code loads from app.asar.unpacked.
    const roots = root.includes(`app.asar${path.sep}`)
      ? [root.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`), root]
      : [root]
    for (const r of roots) {
      out.push(path.join(r, 'prebuilds', BINARY))
      out.push(path.join(r, 'app-vitals.node')) // local `npm run build:native`
    }
  }
  return out
}

let nativeAddon = null
let nativePath = null
let loadError = null
const tried = []

if (process.env.APP_VITALS_DISABLE_NATIVE !== '1') {
  for (const p of candidatePaths()) {
    if (!fs.existsSync(p)) continue
    tried.push(p)
    try {
      nativeAddon = require(p)
      nativePath = p
      loadError = null
      break
    } catch (err) {
      loadError = `${p}: ${err && err.message ? err.message : String(err)}`
    }
  }
  if (!nativeAddon && !loadError) {
    loadError = `no native binary ${BINARY} found (looked in ${packageRoots().join(', ')})`
  }
} else {
  loadError = 'disabled by APP_VITALS_DISABLE_NATIVE=1'
}

// Pure JS Fallback when native Rust addon is not compiled
class JsFallbackBuffer {
  constructor(capacity = 2048) {
    this.capacity = capacity
    this.events = []
  }
  push(event) {
    if (this.events.length >= this.capacity) this.events.shift()
    this.events.push(event)
  }
  snapshot() {
    return this.events.slice()
  }
  clear() {
    this.events = []
  }
}

const fallbackBuffer = new JsFallbackBuffer()
let fallbackWatchdogRunning = false
let fallbackLastTick = 0
let fallbackTotalStalls = 0
let fallbackWorstStallMs = 0
let fallbackStallThreshold = 50
let fallbackIntervalId = null

const jsFallback = {
  isNative: false,
  getNativeMemory: () => {
    const mem = process.memoryUsage ? process.memoryUsage() : {}
    return {
      residentBytes: mem.rss || 0,
      residentMb: Number(((mem.rss || 0) / (1024 * 1024)).toFixed(2)),
      virtualBytes: mem.rss || 0,
      virtualMb: Number(((mem.rss || 0) / (1024 * 1024)).toFixed(2)),
      physicalFootprintBytes: mem.rss || 0,
      physicalFootprintMb: Number(((mem.rss || 0) / (1024 * 1024)).toFixed(2)),
      compressedBytes: 0,
      compressedMb: 0,
    }
  },
  startWatchdog: (thresholdMs = 50, checkIntervalMs = 10) => {
    fallbackStallThreshold = thresholdMs
    fallbackWatchdogRunning = true
    fallbackLastTick = Date.now()
    if (fallbackIntervalId) clearInterval(fallbackIntervalId)
    fallbackIntervalId = setInterval(() => {
      const now = Date.now()
      const lag = now - fallbackLastTick
      if (lag >= fallbackStallThreshold) {
        fallbackTotalStalls++
        if (lag > fallbackWorstStallMs) fallbackWorstStallMs = lag
      }
      fallbackLastTick = now
    }, checkIntervalMs)
    return true
  },
  watchdogTick: () => {
    fallbackLastTick = Date.now()
  },
  getWatchdogStatus: () => ({
    isRunning: fallbackWatchdogRunning,
    stallThresholdMs: fallbackStallThreshold,
    totalStalls: fallbackTotalStalls,
    worstStallMs: fallbackWorstStallMs,
    isCurrentlyStalled: false,
  }),
  stopWatchdog: () => {
    fallbackWatchdogRunning = false
    if (fallbackIntervalId) clearInterval(fallbackIntervalId)
    fallbackIntervalId = null
    return true
  },
  recordVitalMetric: (vital, value, label = null, rating = 'good') => {
    fallbackBuffer.push({
      timestampMs: performance.now(),
      vital,
      value,
      label,
      rating,
    })
  },
  getVitalEvents: () => fallbackBuffer.snapshot(),
  clearVitalEvents: () => fallbackBuffer.clear(),
  computeVitalDistribution: (vital) => {
    const values = fallbackBuffer
      .snapshot()
      .filter((e) => e.vital === vital)
      .map((e) => e.value)
      .sort((a, b) => a - b)
    if (values.length === 0) {
      return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0 }
    }
    const count = values.length
    const min = values[0]
    const max = values[values.length - 1]
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const p50 = values[Math.floor(values.length * 0.5)]
    const p90 = values[Math.min(values.length - 1, Math.floor(values.length * 0.9))]
    const p95 = values[Math.min(values.length - 1, Math.floor(values.length * 0.95))]
    const p99 = values[Math.min(values.length - 1, Math.floor(values.length * 0.99))]
    return { count, min, max, mean, p50, p90, p95, p99 }
  },
}

module.exports = {
  addon: nativeAddon ? { ...nativeAddon, isNative: true } : jsFallback,
  jsFallback,
  /** Where the native engine loaded from, or why it did not. */
  nativeInfo: { binary: BINARY, path: nativePath, error: nativeAddon ? null : loadError, tried },
}
