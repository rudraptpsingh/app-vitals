export interface ChromeTraceEvent {
    name: string;
    cat: string;
    ph: 'X' | 'i' | 'B' | 'E';
    ts: number;
    dur?: number;
    pid: number;
    tid: number;
    args?: Record<string, any>;
}
export interface ChromeTraceFormat {
    traceEvents: ChromeTraceEvent[];
    metadata?: Record<string, any>;
}
export declare function exportToChromeTrace(events: Array<{
    timestampMs: number;
    vital: string;
    value: number;
    label?: string | null;
    rating: string;
}>, options?: {
    appName?: string;
    pid?: number;
}): ChromeTraceFormat;
