export type VitalRating = 'good' | 'needs-improvement' | 'poor'

export type VitalName = 'EST' | 'IRL' | 'TTFP' | 'MBR' | 'FDC'

export interface VitalThresholds {
  good: number
  poor: number
}

export const DEFAULT_THRESHOLDS: Record<VitalName, VitalThresholds> = {
  EST: { good: 16, poor: 50 },       // Event Loop Stall Time in ms
  IRL: { good: 16, poor: 50 },       // IPC Roundtrip Latency in ms
  TTFP: { good: 400, poor: 1000 },   // Time to First Pixels in ms
  MBR: { good: 1.8, poor: 2.5 },     // Native RSS / V8 Heap ratio
  FDC: { good: 1.0, poor: 5.0 },     // Frame drop percentage
}

export function rateVital(name: VitalName, value: number, thresholds: VitalThresholds = DEFAULT_THRESHOLDS[name]): VitalRating {
  if (value <= thresholds.good) return 'good'
  if (value >= thresholds.poor) return 'poor'
  return 'needs-improvement'
}

export interface VitalMetric {
  name: VitalName
  value: number
  rating: VitalRating
  unit: string
  label?: string
  timestampMs: number
}

export interface VitalsBudgets {
  maxEstMs?: number
  maxIrlMs?: number
  maxTtfpMs?: number
  maxMbrRatio?: number
  maxFdcPercent?: number
}

export interface VitalsSummary {
  vitals: {
    EST: { value: number; rating: VitalRating; worstMs: number; totalStalls: number }
    IRL: { p50Ms: number; p95Ms: number; p99Ms: number; rating: VitalRating; totalCalls: number }
    TTFP: { valueMs: number; rating: VitalRating }
    MBR: { ratio: number; physicalFootprintMb: number; v8HeapMb: number; rating: VitalRating }
    FDC: { dropRatePercent: number; rating: VitalRating }
  }
  overallScore: VitalRating
  isNativeEngine: boolean
  totalRecordedEvents: number
}
