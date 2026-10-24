"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateVitalsBudgets = evaluateVitalsBudgets;
function evaluateVitalsBudgets(summary, budgets = {}) {
    const violations = [];
    if (budgets.maxEstMs != null && summary.vitals.EST.worstMs > budgets.maxEstMs) {
        violations.push(`[EST] Worst event loop stall ${summary.vitals.EST.worstMs}ms exceeded budget ${budgets.maxEstMs}ms`);
    }
    if (budgets.maxIrlMs != null && summary.vitals.IRL.p95Ms > budgets.maxIrlMs) {
        violations.push(`[IRL] IPC p95 latency ${summary.vitals.IRL.p95Ms}ms exceeded budget ${budgets.maxIrlMs}ms`);
    }
    if (budgets.maxTtfpMs != null && summary.vitals.TTFP.valueMs > budgets.maxTtfpMs) {
        violations.push(`[TTFP] Time to first pixels ${summary.vitals.TTFP.valueMs}ms exceeded budget ${budgets.maxTtfpMs}ms`);
    }
    if (budgets.maxMbrRatio != null && summary.vitals.MBR.ratio > budgets.maxMbrRatio) {
        violations.push(`[MBR] Memory bloat ratio ${summary.vitals.MBR.ratio}x exceeded budget ${budgets.maxMbrRatio}x`);
    }
    if (budgets.maxFdcPercent != null && summary.vitals.FDC.dropRatePercent > budgets.maxFdcPercent) {
        violations.push(`[FDC] Frame drop rate ${summary.vitals.FDC.dropRatePercent}% exceeded budget ${budgets.maxFdcPercent}%`);
    }
    return {
        passed: violations.length === 0,
        violations,
        summary,
    };
}
