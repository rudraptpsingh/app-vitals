'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { addon } = require('../dist/native-loader.cjs')

describe('Native Rust Engine (app-vitals-native)', () => {
  test('retrieves native OS memory footprint and RSS', () => {
    const mem = addon.getNativeMemory()
    assert.ok(mem.residentBytes > 0, 'residentBytes should be > 0')
    assert.ok(mem.residentMb > 0, 'residentMb should be > 0')
    assert.ok(mem.virtualBytes > 0, 'virtualBytes should be > 0')
    assert.ok(typeof mem.physicalFootprintMb === 'number')
  })

  test('records metrics in native circular ring buffer and computes distribution', () => {
    addon.clearVitalEvents()
    addon.recordVitalMetric('IRL', 10.0, 'test:channel', 'good')
    addon.recordVitalMetric('IRL', 20.0, 'test:channel', 'good')
    addon.recordVitalMetric('IRL', 60.0, 'test:slow', 'poor')

    const events = addon.getVitalEvents()
    assert.ok(events.length >= 3)
    const lastThree = events.slice(-3)
    assert.equal(lastThree[0].vital, 'IRL')
    assert.equal(lastThree[0].value, 10.0)

    const stats = addon.computeVitalDistribution('IRL')
    assert.ok(stats.count >= 3)
    assert.equal(stats.min, 10.0)
    assert.equal(stats.max, 60.0)
    assert.equal(stats.p50, 20.0)
    assert.ok(stats.p95 >= 20.0)
  })

  test('detects main-process event loop freeze via independent native thread watchdog', async () => {
    addon.startWatchdog(40, 10)

    const timer = setInterval(() => {
      addon.watchdogTick()
    }, 10)

    // Wait 20ms to stabilize
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Freeze Node main thread for 100ms
    const freezeStart = Date.now()
    while (Date.now() - freezeStart < 100) {}

    // Wait 40ms for watchdog background thread to cycle
    await new Promise((resolve) => setTimeout(resolve, 40))

    clearInterval(timer)
    const runningStatus = addon.getWatchdogStatus()
    assert.equal(runningStatus.isRunning, true)
    assert.ok(runningStatus.totalStalls >= 1, `Expected at least 1 stall, got ${runningStatus.totalStalls}`)
    assert.ok(runningStatus.worstStallMs >= 80, `Worst stall was ${runningStatus.worstStallMs}ms, expected >= 80ms`)

    addon.stopWatchdog()
    const stoppedStatus = addon.getWatchdogStatus()
    assert.equal(stoppedStatus.isRunning, false)
  })
})
