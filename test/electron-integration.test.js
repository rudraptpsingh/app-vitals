'use strict'

/**
 * What broke inside a real Electron app (ShotSelect): the app's bundler inlined
 * the loader, so the native engine was never found and the JS fallback ran
 * silently; and TTFP stayed 0 because nothing measured it in the main process.
 */
const { test, describe, after } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-vitals-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

/** Load the loader from `dir` in a fresh process and report what it found. */
function loadFrom(dir, env = {}) {
  const loader = path.join(dir, 'native-loader.cjs')
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'dist', 'native-loader.cjs'), loader)
  const out = execFileSync(
    process.execPath,
    ['-e', `const l=require(${JSON.stringify(loader)});console.log(JSON.stringify({isNative:l.addon.isNative,...l.nativeInfo}))`],
    { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' }
  )
  return JSON.parse(out)
}

const hasPrebuild = fs.existsSync(
  path.join(ROOT, 'prebuilds', `app-vitals.${process.platform}-${process.arch}.node`)
)

describe('native engine lookup', () => {
  test('finds the engine when a bundler moved the loader out of the package', { skip: !hasPrebuild }, () => {
    // An app's main bundle: <app>/dist-electron/main.cjs, package in <app>/node_modules.
    const app = path.join(tmp, 'app')
    fs.mkdirSync(path.join(app, 'node_modules'), { recursive: true })
    fs.symlinkSync(ROOT, path.join(app, 'node_modules', 'electron-app-vitals'), 'junction')
    const info = loadFrom(path.join(app, 'dist-electron'))
    assert.equal(info.isNative, true, info.error)
    assert.equal(fs.realpathSync(info.path), fs.realpathSync(path.join(ROOT, 'prebuilds', info.binary)))
  })

  test('says why it fell back instead of failing silently', () => {
    const info = loadFrom(path.join(tmp, 'lonely', 'dist'))
    assert.equal(info.isNative, false)
    assert.match(info.error, /no native binary app-vitals\..+\.node found/)
  })

  test('APP_VITALS_NATIVE_PATH points at a binary anywhere', { skip: !hasPrebuild }, () => {
    const bin = path.join(ROOT, 'prebuilds', `app-vitals.${process.platform}-${process.arch}.node`)
    const info = loadFrom(path.join(tmp, 'elsewhere', 'dist'), { APP_VITALS_NATIVE_PATH: bin })
    assert.equal(info.isNative, true, info.error)
    assert.equal(info.path, bin)
  })
})

describe('TTFP from the main process', () => {
  const { initAppVitals, createVitalsMcpTools } = require('../dist/index.js')

  test('measures window creation to first paint, once per window', async () => {
    const app = new EventEmitter()
    const vitals = initAppVitals({ app })
    vitals.clearEvents()
    assert.equal(vitals.getSummary().vitals.TTFP.samples, 0)

    const win = new EventEmitter()
    win.id = 7
    win.webContents = new EventEmitter()
    app.emit('browser-window-created', {}, win)
    await new Promise((r) => setTimeout(r, 30))
    win.emit('ready-to-show')
    win.webContents.emit('did-finish-load') // later signal must not add a sample

    const { TTFP } = vitals.getSummary().vitals
    assert.equal(TTFP.samples, 1)
    assert.ok(TTFP.valueMs >= 25, `TTFP ${TTFP.valueMs}`)
    const ev = vitals.getEvents().filter((e) => e.vital === 'TTFP')
    assert.equal(ev[0].label, 'window:7:ready-to-show')
    vitals.stop()
  })

  test('summary reports which engine measured', () => {
    const vitals = initAppVitals({})
    const s = vitals.getSummary()
    assert.equal(s.nativeEngineError === null, s.isNativeEngine)
    vitals.stop()
  })

  test('MCP tool tiers type-check against a literal union', () => {
    const tools = createVitalsMcpTools(initAppVitals({}))
    assert.deepEqual(tools.map((t) => t.tier), ['query', 'query'])
    const check = path.join(tmp, 'tier-check.ts')
    fs.writeFileSync(
      check,
      `import { createVitalsMcpTools } from ${JSON.stringify(path.join(ROOT, 'dist', 'index'))}\n` +
        `declare const v: Parameters<typeof createVitalsMcpTools>[0]\n` +
        `const tier: 'query' | 'action' = createVitalsMcpTools(v)[0].tier\nexport { tier }\n`
    )
    execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', check], {
      encoding: 'utf8',
    })
  })
})
