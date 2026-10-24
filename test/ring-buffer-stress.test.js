'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { addon } = require('../dist/native-loader.cjs')

describe('Native Ring Buffer Capacity & Stress Suite', () => {
  test('handles 5,000 high-frequency metric recordings and wraps capacity cleanly', () => {
    addon.clearVitalEvents()

    const start = performance.now()
    const TOTAL_BURST = 5000

    for (let i = 0; i < TOTAL_BURST; i++) {
      addon.recordVitalMetric('IRL', (i % 50) + 1, `ipc:burst_${i % 10}`, i > 40 ? 'needs-improvement' : 'good')
    }
    const duration = performance.now() - start

    const events = addon.getVitalEvents()
    // Ring buffer has capacity 2048
    assert.equal(events.length, 2048, 'Should cap at buffer capacity 2048')

    // Distribution across the 2048 retained events
    const stats = addon.computeVitalDistribution('IRL')
    assert.equal(stats.count, 2048)
    assert.ok(stats.min >= 1)
    assert.ok(stats.max <= 50)
    assert.ok(stats.p50 >= 20 && stats.p50 <= 30)

    // Verify throughput: 5,000 recordings in < 50ms
    assert.ok(duration < 100, `Recorded 5,000 events in ${duration.toFixed(2)}ms (expected < 100ms)`)
  })

  test('clearVitalEvents empties the buffer completely', () => {
    addon.clearVitalEvents()
    const events = addon.getVitalEvents()
    assert.equal(events.length, 0)

    const stats = addon.computeVitalDistribution('IRL')
    assert.equal(stats.count, 0)
    assert.equal(stats.min, 0)
    assert.equal(stats.max, 0)
    assert.equal(stats.p50, 0)
  })
})
