import type { VitalsBudgets, VitalsSummary } from './types';
export interface BudgetEvaluationResult {
    passed: boolean;
    violations: string[];
    summary: VitalsSummary;
}
export declare function evaluateVitalsBudgets(summary: VitalsSummary, budgets?: VitalsBudgets): BudgetEvaluationResult;
