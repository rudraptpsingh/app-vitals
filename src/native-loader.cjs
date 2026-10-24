'use strict'

const path = require('node:path')
const fs = require('node:fs')

let nativeAddon = null

const candidatePaths = [
  path.join(__dirname, '..', 'app-vitals.node'),
  path.join(__dirname, '..', 'target', 'release', 'libapp_vitals_native.dylib'),
  path.join(__dirname, '..', 'target', 'release', 'libapp_vitals_native.so'),
  path.join(__dirname, '..', 'target', 'release', 'app_vitals_native.dll'),
]

for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    try {
      nativeAddon = require(p)
      break
    } catch {}
  }
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
    const count = values.len
    const min = values[0]
    const max = values[values.length - 1]
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const p50 = values[Math.floor(values.length * 0.5)]
    const p90 = values[Math.min(values.length - 1, Math.floor(values.length * 0.9))]
    const p95 = values[Math.min(values.length - 1, Math.floor(values.length * 0.95))]
    const p99 = values[Math.min(values.length - 1, Math.floor(values.length * 0.99))]
    return { count: values.length, min, max, mean, p50, p90, p95, p99 }
  },
}

module.exports = {
  addon: nativeAddon ? { ...nativeAddon, isNative: true } : jsFallback,
}
