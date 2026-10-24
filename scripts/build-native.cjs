#!/usr/bin/env node
'use strict'
/**
 * Build the Rust engine with plain cargo and place it at
 * prebuilds/app-vitals.<platform>-<arch>.node, the name the loader looks for.
 *
 *   node scripts/build-native.cjs                          # this machine
 *   node scripts/build-native.cjs --target x86_64-apple-darwin
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const i = process.argv.indexOf('--target')
const argTarget = i > 0 ? process.argv[i + 1] : null

const TARGETS = {
  'darwin-arm64': ['aarch64-apple-darwin', 'libapp_vitals_native.dylib'],
  'darwin-x64': ['x86_64-apple-darwin', 'libapp_vitals_native.dylib'],
  'win32-x64': ['x86_64-pc-windows-msvc', 'app_vitals_native.dll'],
  'win32-arm64': ['aarch64-pc-windows-msvc', 'app_vitals_native.dll'],
  'linux-x64': ['x86_64-unknown-linux-gnu', 'libapp_vitals_native.so'],
  'linux-arm64': ['aarch64-unknown-linux-gnu', 'libapp_vitals_native.so'],
}
const tag = argTarget
  ? Object.keys(TARGETS).find((k) => TARGETS[k][0] === argTarget)
  : `${process.platform}-${process.arch}`
if (!tag || !TARGETS[tag]) throw new Error(`unsupported target: ${argTarget ?? tag}`)
const [triple, lib] = TARGETS[tag]

const env = { ...process.env }
if (triple.endsWith('windows-msvc')) {
  env.RUSTFLAGS = [env.RUSTFLAGS, '-C target-feature=+crt-static'].filter(Boolean).join(' ')
}
const r = spawnSync('cargo', ['build', '--release', '--target', triple], { cwd: ROOT, stdio: 'inherit', env })
if (r.status !== 0) process.exit(r.status ?? 1)

const out = path.join(ROOT, 'prebuilds', `app-vitals.${tag}.node`)
fs.mkdirSync(path.dirname(out), { recursive: true })
// Replace, never overwrite in place: macOS kills a process that has the old
// library mapped when its bytes change under it.
const staged = `${out}.${process.pid}.tmp`
fs.copyFileSync(path.join(ROOT, 'target', triple, 'release', lib), staged)
fs.rmSync(out, { force: true })
fs.renameSync(staged, out)
console.log(`built ${path.relative(process.cwd(), out)}`)
