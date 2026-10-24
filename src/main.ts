import type { VitalsBudgets, VitalsSummary, VitalRating } from './types'
import { rateVital } from './types'
import { evaluateVitalsBudgets } from './budgets'
import { exportToChromeTrace } from './perfetto'
const { addon } = require('./native-loader.cjs')
const fs = require('node:fs')
const path = require('node:path')

export interface AppVitalsOptions {
  app?: any
  ipcMain?: any
  stallThresholdMs?: number
  checkIntervalMs?: number
  budgets?: VitalsBudgets
  onViolation?: (violation: string) => void
}

export function initAppVitals(options: AppVitalsOptions = {}) {
  const {
    app,
    ipcMain,
    stallThresholdMs = 50,
    checkIntervalMs = 10,
    budgets,
    onViolation,
  } = options

  // Start native background thread watchdog
  addon.startWatchdog(stallThresholdMs, checkIntervalMs)

  // Maintain regular heartbeat on Node main thread
  const heartbeatTimer = setInterval(() => {
    addon.watchdogTick()
  }, checkIntervalMs)

  if (typeof (heartbeatTimer as any).unref === 'function') {
    ;(heartbeatTimer as any).unref()
  }

  // Automatic IPC Handler Instrumentation for IRL (IPC Roundtrip Latency)
  if (ipcMain && typeof ipcMain.handle === 'function') {
    const rawHandle = ipcMain.handle.bind(ipcMain)
    ipcMain.handle = (channel: string, handler: Function) => {
      // Don't wrap our internal vitals reporting channel
      if (channel === '__app_vitals_report') {
        return rawHandle(channel, handler)
      }
      return rawHandle(channel, async (event: any, ...args: any[]) => {
        const start = performance.now()
        try {
          return await handler(event, ...args)
        } finally {
          const duration = performance.now() - start
          const rating = rateVital('IRL', duration)
          addon.recordVitalMetric('IRL', duration, channel, rating)
        }
      })
    }

    // Channel for renderer processes to report TTFP and FDC
    rawHandle('__app_vitals_report', (_event: any, report: { vital: string; value: number; label?: string }) => {
      const { vital, value, label } = report
      if (vital === 'TTFP') {
        const rating = rateVital('TTFP', value)
        addon.recordVitalMetric('TTFP', value, label || 'window:open', rating)
      } else if (vital === 'FDC') {
        const rating = rateVital('FDC', value)
        addon.recordVitalMetric('FDC', value, label || 'scroll:grid', rating)
      }
      return { ok: true }
    })
  }

  function getSummary(): VitalsSummary {
    const wdStatus = addon.getWatchdogStatus()
    const estRating = rateVital('EST', wdStatus.worstStallMs)

    const irlDist = addon.computeVitalDistribution('IRL')
    const irlRating = rateVital('IRL', irlDist.p95 || 0)

    const ttfpDist = addon.computeVitalDistribution('TTFP')
    const ttfpRating = rateVital('TTFP', ttfpDist.mean || 0)

    const fdcDist = addon.computeVitalDistribution('FDC')
    const fdcRating = rateVital('FDC', fdcDist.mean || 0)

    const nativeMem = addon.getNativeMemory()
    const v8Mem = process.memoryUsage ? process.memoryUsage() : { heapUsed: 0 }
    const v8HeapMb = Number(((v8Mem.heapUsed || 0) / (1024 * 1024)).toFixed(2))
    const footprintMb = Number((nativeMem.physicalFootprintMb || nativeMem.residentMb || 0).toFixed(2))
    const mbrRatio = v8HeapMb > 0 ? Number((footprintMb / v8HeapMb).toFixed(2)) : 1.0
    const mbrRating = rateVital('MBR', mbrRatio)

    // Calculate composite overall health score
    const ratings = [estRating, irlRating, ttfpRating, mbrRating, fdcRating]
    let overallScore: VitalRating = 'good'
    if (ratings.includes('poor')) overallScore = 'poor'
    else if (ratings.includes('needs-improvement')) overallScore = 'needs-improvement'

    const allEvents = addon.getVitalEvents()

    return {
      vitals: {
        EST: {
          value: wdStatus.worstStallMs,
          rating: estRating,
          worstMs: wdStatus.worstStallMs,
          totalStalls: wdStatus.totalStalls,
        },
        IRL: {
          p50Ms: irlDist.p50 || 0,
          p95Ms: irlDist.p95 || 0,
          p99Ms: irlDist.p99 || 0,
          rating: irlRating,
          totalCalls: irlDist.count || 0,
        },
        TTFP: {
          valueMs: ttfpDist.mean || 0,
          rating: ttfpRating,
        },
        MBR: {
          ratio: mbrRatio,
          physicalFootprintMb: footprintMb,
          v8HeapMb,
          rating: mbrRating,
        },
        FDC: {
          dropRatePercent: fdcDist.mean || 0,
          rating: fdcRating,
        },
      },
      overallScore,
      isNativeEngine: Boolean(addon.isNative),
      totalRecordedEvents: allEvents.length,
    }
  }

  function assertBudgets(targetBudgets: VitalsBudgets = budgets || {}) {
    const summary = getSummary()
    const result = evaluateVitalsBudgets(summary, targetBudgets)
    if (!result.passed && typeof onViolation === 'function') {
      for (const v of result.violations) onViolation(v)
    }
    return result
  }

  function exportTrace(outputPath?: string) {
    const events = addon.getVitalEvents()
    const trace = exportToChromeTrace(events, {
      appName: app && typeof app.getName === 'function' ? app.getName() : 'desktop-app',
      pid: process.pid,
    })
    if (outputPath) {
      const dir = path.dirname(outputPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(outputPath, JSON.stringify(trace, null, 2), 'utf8')
    }
    return trace
  }

  function stop() {
    clearInterval(heartbeatTimer)
    addon.stopWatchdog()
  }

  if (app && typeof app.on === 'function') {
    app.on('will-quit', stop)
  }

  return {
    getSummary,
    assertBudgets,
    exportTrace,
    stop,
    recordVital: (vital: string, value: number, label?: string) => {
      const rating = rateVital(vital as any, value)
      addon.recordVitalMetric(vital, value, label || null, rating)
    },
    getEvents: () => addon.getVitalEvents(),
    clearEvents: () => addon.clearVitalEvents(),
  }
}
