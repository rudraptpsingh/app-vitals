'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { exportToChromeTrace } = require('../dist/index.js')

describe('Chrome Trace & Perfetto Exporter', () => {
  test('converts vitals events into Chrome Trace Event format', () => {
    const sampleEvents = [
      { timestampMs: 10.5, vital: 'EST', value: 75.0, label: null, rating: 'poor' },
      { timestampMs: 120.0, vital: 'IRL', value: 14.2, label: 'cull:ratePhoto', rating: 'good' },
      { timestampMs: 250.0, vital: 'TTFP', value: 320.0, label: 'first-paint', rating: 'good' },
    ]

    const trace = exportToChromeTrace(sampleEvents, { appName: 'ShotSelect', pid: 1234 })
    assert.ok(Array.isArray(trace.traceEvents))
    assert.equal(trace.traceEvents.length, 3)

    // Check stall event
    const stall = trace.traceEvents[0]
    assert.equal(stall.cat, 'stall')
    assert.equal(stall.ph, 'X')
    assert.equal(stall.dur, 75000) // 75ms in microseconds
    assert.equal(stall.pid, 1234)

    // Check IPC event
    const ipc = trace.traceEvents[1]
    assert.equal(ipc.name, 'cull:ratePhoto')
    assert.equal(ipc.cat, 'ipc')
    assert.equal(ipc.dur, 14200)

    assert.equal(trace.metadata.appName, 'ShotSelect')
  })
})
