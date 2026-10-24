'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { jsFallback } = require('../dist/native-loader.cjs')

describe('Pure JavaScript Fallback Engine (No Native Addon)', () => {
  test('reports isNative as false', () => {
    assert.equal(jsFallback.isNative, false)
  })

  test('retrieves process memory fallback stats', () => {
    const mem = jsFallback.getNativeMemory()
    assert.ok(mem.residentMb > 0)
    assert.ok(mem.physicalFootprintMb > 0)
    assert.equal(mem.compressedBytes, 0)
  })

  test('records metrics and computes accurate distribution percentiles in JS', () => {
    jsFallback.clearVitalEvents()
    for (let i = 1; i <= 100; i++) {
      jsFallback.recordVitalMetric('IRL', i, 'test:channel', 'good')
    }

    const events = jsFallback.getVitalEvents()
    assert.equal(events.length, 100)

    const stats = jsFallback.computeVitalDistribution('IRL')
    assert.equal(stats.count, 100)
    assert.equal(stats.min, 1)
    assert.equal(stats.max, 100)
    assert.equal(stats.p50, 51)
    assert.equal(stats.p90, 91)
    assert.equal(stats.p95, 96)
    assert.equal(stats.p99, 100)
  })

  test('JS watchdog starts, ticks, and stops gracefully', () => {
    const started = jsFallback.startWatchdog(50, 10)
    assert.equal(started, true)

    let status = jsFallback.getWatchdogStatus()
    assert.equal(status.isRunning, true)
    assert.equal(status.stallThresholdMs, 50)

    jsFallback.watchdogTick()
    const stopped = jsFallback.stopWatchdog()
    assert.equal(stopped, true)

    status = jsFallback.getWatchdogStatus()
    assert.equal(status.isRunning, false)
  })
})
