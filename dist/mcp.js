"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVitalsMcpTools = createVitalsMcpTools;
/**
 * Creates agent-callable MCP tools for inspecting Desktop Core Vitals.
 */
function createVitalsMcpTools(vitals) {
    return [
        {
            name: 'app:get_core_vitals',
            description: 'Fetch real-time Desktop Core Vitals (EST event loop stalls, IRL IPC latency, TTFP, MBR memory bloat, and FDC frame drops)',
            schema: { type: 'object', properties: {} },
            tier: 'query',
            handler: async () => {
                return vitals.getSummary();
            },
        },
        {
            name: 'app:assert_core_vitals_budgets',
            description: 'Evaluate declarative SLA performance budgets against recorded Desktop Core Vitals in CI or automated agent evaluations',
            schema: {
                type: 'object',
                properties: {
                    maxEstMs: { type: 'number', description: 'Max allowed event-loop stall duration in ms (default: 50)' },
                    maxIrlMs: { type: 'number', description: 'Max allowed p95 IPC latency in ms (default: 25)' },
                    maxTtfpMs: { type: 'number', description: 'Max allowed time to first pixels in ms (default: 800)' },
                    maxMbrRatio: { type: 'number', description: 'Max allowed memory bloat ratio (default: 2.0)' },
                    maxFdcPercent: { type: 'number', description: 'Max allowed frame drop percentage (default: 2.0)' },
                },
            },
            tier: 'query',
            handler: async (budgets = {}) => {
                return vitals.assertBudgets(budgets);
            },
        },
    ];
}
