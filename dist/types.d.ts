export type VitalRating = 'good' | 'needs-improvement' | 'poor';
export type VitalName = 'EST' | 'IRL' | 'TTFP' | 'MBR' | 'FDC';
export interface VitalThresholds {
    good: number;
    poor: number;
}
export declare const DEFAULT_THRESHOLDS: Record<VitalName, VitalThresholds>;
export declare function rateVital(name: VitalName, value: number, thresholds?: VitalThresholds): VitalRating;
export interface VitalMetric {
    name: VitalName;
    value: number;
    rating: VitalRating;
    unit: string;
    label?: string;
    timestampMs: number;
}
export interface VitalsBudgets {
    maxEstMs?: number;
    maxIrlMs?: number;
    maxTtfpMs?: number;
    maxMbrRatio?: number;
    maxFdcPercent?: number;
}
export interface VitalsSummary {
    vitals: {
        EST: {
            value: number;
            rating: VitalRating;
            worstMs: number;
            totalStalls: number;
        };
        IRL: {
            p50Ms: number;
            p95Ms: number;
            p99Ms: number;
            rating: VitalRating;
            totalCalls: number;
        };
        TTFP: {
            valueMs: number;
            rating: VitalRating;
        };
        MBR: {
            ratio: number;
            physicalFootprintMb: number;
            v8HeapMb: number;
            rating: VitalRating;
        };
        FDC: {
            dropRatePercent: number;
            rating: VitalRating;
        };
    };
    overallScore: VitalRating;
    isNativeEngine: boolean;
    totalRecordedEvents: number;
}
