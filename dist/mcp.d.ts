import type { initAppVitals } from './main';
import type { VitalsBudgets } from './types';
/**
 * Creates agent-callable MCP tools for inspecting Desktop Core Vitals.
 */
export declare function createVitalsMcpTools(vitals: ReturnType<typeof initAppVitals>): ({
    name: string;
    description: string;
    schema: {
        type: string;
        properties: {
            maxEstMs?: undefined;
            maxIrlMs?: undefined;
            maxTtfpMs?: undefined;
            maxMbrRatio?: undefined;
            maxFdcPercent?: undefined;
        };
    };
    tier: string;
    handler: () => Promise<import("./types").VitalsSummary>;
} | {
    name: string;
    description: string;
    schema: {
        type: string;
        properties: {
            maxEstMs: {
                type: string;
                description: string;
            };
            maxIrlMs: {
                type: string;
                description: string;
            };
            maxTtfpMs: {
                type: string;
                description: string;
            };
            maxMbrRatio: {
                type: string;
                description: string;
            };
            maxFdcPercent: {
                type: string;
                description: string;
            };
        };
    };
    tier: string;
    handler: (budgets?: VitalsBudgets) => Promise<import("./budgets").BudgetEvaluationResult>;
})[];
