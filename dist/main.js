"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAppVitals = initAppVitals;
const types_1 = require("./types");
const budgets_1 = require("./budgets");
const perfetto_1 = require("./perfetto");
const { addon, nativeInfo } = require('./native-loader.cjs');
const fs = require('node:fs');
const path = require('node:path');
function initAppVitals(options = {}) {
    const { app, ipcMain, stallThresholdMs = 50, checkIntervalMs = 10, budgets, onViolation, } = options;
    // Start native background thread watchdog
    addon.startWatchdog(stallThresholdMs, checkIntervalMs);
    // Maintain regular heartbeat on Node main thread
    const heartbeatTimer = setInterval(() => {
        addon.watchdogTick();
    }, checkIntervalMs);
    if (typeof heartbeatTimer.unref === 'function') {
        ;
        heartbeatTimer.unref();
    }
    // Automatic IPC Handler Instrumentation for IRL (IPC Roundtrip Latency)
    if (ipcMain && typeof ipcMain.handle === 'function') {
        const rawHandle = ipcMain.handle.bind(ipcMain);
        ipcMain.handle = (channel, handler) => {
            // Don't wrap our internal vitals reporting channel
            if (channel === '__app_vitals_report') {
                return rawHandle(channel, handler);
            }
            return rawHandle(channel, async (event, ...args) => {
                const start = performance.now();
                try {
                    return await handler(event, ...args);
                }
                finally {
                    const duration = performance.now() - start;
                    const rating = (0, types_1.rateVital)('IRL', duration);
                    addon.recordVitalMetric('IRL', duration, channel, rating);
                }
            });
        };
        // Channel for renderer processes to report TTFP and FDC
        rawHandle('__app_vitals_report', (_event, report) => {
            const { vital, value, label } = report;
            if (vital === 'TTFP') {
                const rating = (0, types_1.rateVital)('TTFP', value);
                addon.recordVitalMetric('TTFP', value, label || 'window:open', rating);
            }
            else if (vital === 'FDC') {
                const rating = (0, types_1.rateVital)('FDC', value);
                addon.recordVitalMetric('FDC', value, label || 'scroll:grid', rating);
            }
            return { ok: true };
        });
    }
    function getSummary() {
        const wdStatus = addon.getWatchdogStatus();
        const estRating = (0, types_1.rateVital)('EST', wdStatus.worstStallMs);
        const irlDist = addon.computeVitalDistribution('IRL');
        const irlRating = (0, types_1.rateVital)('IRL', irlDist.p95 || 0);
        const ttfpDist = addon.computeVitalDistribution('TTFP');
        const ttfpRating = (0, types_1.rateVital)('TTFP', ttfpDist.mean || 0);
        const fdcDist = addon.computeVitalDistribution('FDC');
        const fdcRating = (0, types_1.rateVital)('FDC', fdcDist.mean || 0);
        const nativeMem = addon.getNativeMemory();
        const v8Mem = process.memoryUsage ? process.memoryUsage() : { heapUsed: 0 };
        const v8HeapMb = Number(((v8Mem.heapUsed || 0) / (1024 * 1024)).toFixed(2));
        const footprintMb = Number((nativeMem.physicalFootprintMb || nativeMem.residentMb || 0).toFixed(2));
        const mbrRatio = v8HeapMb > 0 ? Number((footprintMb / v8HeapMb).toFixed(2)) : 1.0;
        const mbrRating = (0, types_1.rateVital)('MBR', mbrRatio);
        // Calculate composite overall health score
        // A vital with no samples is unmeasured, not good: leave it out of the score.
        const ratings = [estRating, irlRating, mbrRating];
        if (ttfpDist.count)
            ratings.push(ttfpRating);
        if (fdcDist.count)
            ratings.push(fdcRating);
        let overallScore = 'good';
        if (ratings.includes('poor'))
            overallScore = 'poor';
        else if (ratings.includes('needs-improvement'))
            overallScore = 'needs-improvement';
        const allEvents = addon.getVitalEvents();
        return {
            vitals: {
                EST: {
                    value: wdStatus.worstStallMs,
                    rating: estRating,
                    worstMs: wdStatus.worstStallMs,
                    totalStalls: wdStatus.totalStalls,
                },
                IRL: {
                    p50Ms: irlDist.p50 || 0,
                    p95Ms: irlDist.p95 || 0,
                    p99Ms: irlDist.p99 || 0,
                    rating: irlRating,
                    totalCalls: irlDist.count || 0,
                },
                TTFP: {
                    valueMs: ttfpDist.mean || 0,
                    rating: ttfpRating,
                    samples: ttfpDist.count || 0,
                },
                MBR: {
                    ratio: mbrRatio,
                    physicalFootprintMb: footprintMb,
                    v8HeapMb,
                    rating: mbrRating,
                },
                FDC: {
                    dropRatePercent: fdcDist.mean || 0,
                    rating: fdcRating,
                    samples: fdcDist.count || 0,
                },
            },
            overallScore,
            isNativeEngine: Boolean(addon.isNative),
            nativeEngineError: addon.isNative ? null : nativeInfo.error,
            totalRecordedEvents: allEvents.length,
        };
    }
    function assertBudgets(targetBudgets = budgets || {}) {
        const summary = getSummary();
        const result = (0, budgets_1.evaluateVitalsBudgets)(summary, targetBudgets);
        if (!result.passed && typeof onViolation === 'function') {
            for (const v of result.violations)
                onViolation(v);
        }
        return result;
    }
    function exportTrace(outputPath) {
        const events = addon.getVitalEvents();
        const trace = (0, perfetto_1.exportToChromeTrace)(events, {
            appName: app && typeof app.getName === 'function' ? app.getName() : 'desktop-app',
            pid: process.pid,
        });
        if (outputPath) {
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(outputPath, JSON.stringify(trace, null, 2), 'utf8');
        }
        return trace;
    }
    function stop() {
        clearInterval(heartbeatTimer);
        addon.stopWatchdog();
    }
    if (app && typeof app.on === 'function') {
        app.on('will-quit', stop);
        // TTFP from the main process: window created -> its first paint. Needs no
        // renderer wiring, so it works with contextIsolation and no preload change.
        app.on('browser-window-created', (_event, win) => trackFirstPaint(win));
    }
    function trackFirstPaint(win) {
        if (!win || typeof win.once !== 'function')
            return;
        const start = performance.now();
        let done = false;
        const record = (source) => {
            if (done)
                return;
            done = true;
            const value = performance.now() - start;
            addon.recordVitalMetric('TTFP', value, `window:${win.id ?? '?'}:${source}`, (0, types_1.rateVital)('TTFP', value));
        };
        // ready-to-show fires on the first paint; did-finish-load is the fallback
        // for windows that never emit it.
        win.once('ready-to-show', () => record('ready-to-show'));
        const wc = win.webContents;
        if (wc && typeof wc.once === 'function')
            wc.once('did-finish-load', () => record('did-finish-load'));
    }
    return {
        getSummary,
        assertBudgets,
        exportTrace,
        stop,
        recordVital: (vital, value, label) => {
            const rating = (0, types_1.rateVital)(vital, value);
            addon.recordVitalMetric(vital, value, label || null, rating);
        },
        trackWindow: trackFirstPaint,
        getEvents: () => addon.getVitalEvents(),
        clearEvents: () => addon.clearVitalEvents(),
    };
}
