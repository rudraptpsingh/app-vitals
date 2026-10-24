export interface ChromeTraceEvent {
  name: string
  cat: string
  ph: 'X' | 'i' | 'B' | 'E'
  ts: number
  dur?: number
  pid: number
  tid: number
  args?: Record<string, any>
}

export interface ChromeTraceFormat {
  traceEvents: ChromeTraceEvent[]
  metadata?: Record<string, any>
}

export function exportToChromeTrace(events: Array<{
  timestampMs: number
  vital: string
  value: number
  label?: string | null
  rating: string
}>, options: { appName?: string; pid?: number } = {}): ChromeTraceFormat {
  const pid = options.pid || process.pid || 1
  const traceEvents: ChromeTraceEvent[] = []

  for (const e of events) {
    const tsMicros = Math.round(e.timestampMs * 1000)
    const durMicros = Math.round(e.value * 1000)

    if (e.vital === 'EST') {
      traceEvents.push({
        name: `Event Loop Stall (${Math.round(e.value)}ms)`,
        cat: 'stall',
        ph: 'X',
        ts: tsMicros,
        dur: durMicros,
        pid,
        tid: 1,
        args: { vital: 'EST', rating: e.rating },
      })
    } else if (e.vital === 'IRL') {
      traceEvents.push({
        name: e.label || 'IPC Call',
        cat: 'ipc',
        ph: 'X',
        ts: tsMicros,
        dur: durMicros,
        pid,
        tid: 2,
        args: { vital: 'IRL', durationMs: e.value, rating: e.rating },
      })
    } else {
      traceEvents.push({
        name: `${e.vital}: ${e.label || e.vital}`,
        cat: 'vitals',
        ph: 'i',
        ts: tsMicros,
        pid,
        tid: 3,
        args: { vital: e.vital, value: e.value, rating: e.rating },
      })
    }
  }

  return {
    traceEvents,
    metadata: {
      appName: options.appName || 'desktop-app',
      exportedAt: new Date().toISOString(),
      generator: 'app-vitals-native',
    },
  }
}
