/**
 * Renderer-side instrumentation for Chromium / React / Webview viewports.
 * Automatically tracks TTFP (Time to First Pixels) and FDC (Frame Drop Count).
 */
export interface RendererVitalsOptions {
    ipcRenderer?: any;
    trackScrollFrames?: boolean;
    reportIntervalMs?: number;
}
export declare function initRendererVitals(options?: RendererVitalsOptions): {
    disconnect: () => void;
};
