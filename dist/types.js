"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_THRESHOLDS = void 0;
exports.rateVital = rateVital;
exports.DEFAULT_THRESHOLDS = {
    EST: { good: 16, poor: 50 }, // Event Loop Stall Time in ms
    IRL: { good: 16, poor: 50 }, // IPC Roundtrip Latency in ms
    TTFP: { good: 400, poor: 1000 }, // Time to First Pixels in ms
    MBR: { good: 1.8, poor: 2.5 }, // Native RSS / V8 Heap ratio
    FDC: { good: 1.0, poor: 5.0 }, // Frame drop percentage
};
function rateVital(name, value, thresholds = exports.DEFAULT_THRESHOLDS[name]) {
    if (value <= thresholds.good)
        return 'good';
    if (value >= thresholds.poor)
        return 'poor';
    return 'needs-improvement';
}
