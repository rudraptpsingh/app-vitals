'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { evaluateVitalsBudgets } = require('../dist/budgets.js')

describe('Declarative SLA Budget Evaluation Suite', () => {
  const healthySummary = {
    vitals: {
      EST: { value: 12, rating: 'good', worstMs: 12, totalStalls: 0 },
      IRL: { p50Ms: 2.1, p95Ms: 8.5, p99Ms: 12.0, rating: 'good', totalCalls: 400 },
      TTFP: { valueMs: 250, rating: 'good' },
      MBR: { ratio: 1.4, physicalFootprintMb: 85, v8HeapMb: 60, rating: 'good' },
      FDC: { dropRatePercent: 0.5, rating: 'good' },
    },
    overallScore: 'good',
    isNativeEngine: true,
    totalRecordedEvents: 400,
  }

  test('passes when all metrics are within defined budgets', () => {
    const result = evaluateVitalsBudgets(healthySummary, {
      maxEstMs: 50,
      maxIrlMs: 25,
      maxTtfpMs: 800,
      maxMbrRatio: 2.0,
      maxFdcPercent: 2.0,
    })

    assert.equal(result.passed, true)
    assert.equal(result.violations.length, 0)
    assert.deepEqual(result.summary, healthySummary)
  })

  test('passes on boundary equality (value == budget)', () => {
    const result = evaluateVitalsBudgets(healthySummary, {
      maxEstMs: 12, // exact worstMs
      maxIrlMs: 8.5, // exact p95Ms
      maxMbrRatio: 1.4, // exact ratio
    })

    assert.equal(result.passed, true)
    assert.equal(result.violations.length, 0)
  })

  test('detects single metric violation and formats clear diagnostic message', () => {
    const result = evaluateVitalsBudgets(healthySummary, {
      maxEstMs: 10, // 12 > 10
    })

    assert.equal(result.passed, false)
    assert.equal(result.violations.length, 1)
    assert.match(result.violations[0], /\[EST\] Worst event loop stall 12ms exceeded budget 10ms/)
  })

  test('reports all concurrent violations across multiple vitals', () => {
    const degradedSummary = {
      ...healthySummary,
      vitals: {
        ...healthySummary.vitals,
        EST: { ...healthySummary.vitals.EST, worstMs: 120 },
        IRL: { ...healthySummary.vitals.IRL, p95Ms: 65 },
        MBR: { ...healthySummary.vitals.MBR, ratio: 4.2 },
      },
    }

    const result = evaluateVitalsBudgets(degradedSummary, {
      maxEstMs: 50,
      maxIrlMs: 25,
      maxMbrRatio: 2.0,
    })

    assert.equal(result.passed, false)
    assert.equal(result.violations.length, 3)
    assert.ok(result.violations.some((v) => v.includes('[EST]')))
    assert.ok(result.violations.some((v) => v.includes('[IRL]')))
    assert.ok(result.violations.some((v) => v.includes('[MBR]')))
  })

  test('handles empty budgets without false violations', () => {
    const result = evaluateVitalsBudgets(healthySummary, {})
    assert.equal(result.passed, true)
    assert.equal(result.violations.length, 0)
  })
})
