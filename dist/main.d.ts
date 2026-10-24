import type { VitalsBudgets, VitalsSummary } from './types';
export interface AppVitalsOptions {
    app?: any;
    ipcMain?: any;
    stallThresholdMs?: number;
    checkIntervalMs?: number;
    budgets?: VitalsBudgets;
    onViolation?: (violation: string) => void;
}
export declare function initAppVitals(options?: AppVitalsOptions): {
    getSummary: () => VitalsSummary;
    assertBudgets: (targetBudgets?: VitalsBudgets) => import("./budgets").BudgetEvaluationResult;
    exportTrace: (outputPath?: string) => import("./perfetto").ChromeTraceFormat;
    stop: () => void;
    recordVital: (vital: string, value: number, label?: string) => void;
    getEvents: () => any;
    clearEvents: () => any;
};
