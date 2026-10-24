'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const {
  initAppVitals,
  createVitalsMcpTools,
  rateVital,
  DEFAULT_THRESHOLDS,
} = require('../dist/index.js')

describe('App Vitals Multi-Process Coordinator', () => {
  const mockHandlers = new Map()
  const mockIpcMain = {
    handle: (channel, fn) => {
      mockHandlers.set(channel, fn)
    },
  }

  const mockApp = {
    getName: () => 'ShotSelect',
    on: () => {},
  }

  test('rateVital evaluates threshold ratings correctly', () => {
    assert.equal(rateVital('EST', 10), 'good')
    assert.equal(rateVital('EST', 35), 'needs-improvement')
    assert.equal(rateVital('EST', 100), 'poor')

    assert.equal(rateVital('IRL', 5), 'good')
    assert.equal(rateVital('IRL', 80), 'poor')
  })

  test('initAppVitals wraps IPC handlers and records IRL latency', async () => {
    const vitals = initAppVitals({
      app: mockApp,
      ipcMain: mockIpcMain,
      stallThresholdMs: 50,
      checkIntervalMs: 10,
    })

    // Register a mock handler
    mockIpcMain.handle('catalog:getPhotos', async (_event, count) => {
      // Simulate quick 5ms work
      const start = Date.now()
      while (Date.now() - start < 5) {}
      return { count }
    })

    // Invoke wrapped handler
    const handler = mockHandlers.get('catalog:getPhotos')
    assert.ok(handler)
    const result = await handler({}, 150)
    assert.equal(result.count, 150)

    const summary = vitals.getSummary()
    assert.ok(summary.vitals.IRL.totalCalls >= 1)
    assert.ok(summary.vitals.IRL.p50Ms >= 4)

    vitals.stop()
  })

  test('ingests renderer reports for TTFP and FDC', async () => {
    const vitals = initAppVitals({
      app: mockApp,
      ipcMain: mockIpcMain,
    })

    const reportHandler = mockHandlers.get('__app_vitals_report')
    assert.ok(reportHandler)

    // Simulate renderer sending TTFP
    await reportHandler({}, { vital: 'TTFP', value: 350, label: 'first-contentful-paint' })
    // Simulate renderer sending FDC
    await reportHandler({}, { vital: 'FDC', value: 0.5, label: 'viewport:scroll' })

    const summary = vitals.getSummary()
    assert.equal(summary.vitals.TTFP.valueMs, 350)
    assert.equal(summary.vitals.TTFP.rating, 'good')
    assert.equal(summary.vitals.FDC.dropRatePercent, 0.5)
    assert.equal(summary.vitals.FDC.rating, 'good')

    vitals.stop()
  })

  test('evaluates declarative performance budgets and reports violations', () => {
    const vitals = initAppVitals({
      app: mockApp,
      ipcMain: mockIpcMain,
    })

    // Assert passing budget
    const pass = vitals.assertBudgets({
      maxEstMs: 500,
      maxIrlMs: 200,
      maxTtfpMs: 1000,
    })
    assert.equal(pass.passed, true)
    assert.equal(pass.violations.length, 0)

    // Assert failing budget
    const fail = vitals.assertBudgets({
      maxTtfpMs: 200, // actual is 350ms -> fail
    })
    assert.equal(fail.passed, false)
    assert.ok(fail.violations.some((v) => v.includes('[TTFP]')))

    vitals.stop()
  })

  test('createVitalsMcpTools returns MCP query and budget tools', async () => {
    const vitals = initAppVitals({
      app: mockApp,
      ipcMain: mockIpcMain,
    })

    const tools = createVitalsMcpTools(vitals)
    assert.equal(tools.length, 2)
    assert.equal(tools[0].name, 'app:get_core_vitals')
    assert.equal(tools[1].name, 'app:assert_core_vitals_budgets')

    const queryRes = await tools[0].handler()
    assert.ok(queryRes.vitals.EST)
    assert.ok(queryRes.vitals.IRL)

    const budgetRes = await tools[1].handler({ maxIrlMs: 500 })
    assert.equal(budgetRes.passed, true)

    vitals.stop()
  })
})
