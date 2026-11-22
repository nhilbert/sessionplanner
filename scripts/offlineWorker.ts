import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, type Plugin } from 'vite'
import { precacheable } from '../src/offline/policy.ts'

const ENTRY = fileURLToPath(new URL('../src/offline/sw.ts', import.meta.url))

const filesIn = (dir: string, under = ''): string[] =>
  readdirSync(path.join(dir, under), { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? filesIn(dir, path.posix.join(under, f.name)) : [path.posix.join(under, f.name)]))

/**
 * Builds the offline copy's service worker (src/offline/sw.ts, docs/offline.md) into `sw.js` beside the app, once the
 * app is built: with the list of the files it keeps and a version that changes with any of them, so a new build
 * installs itself in the browsers that have the switch on. A build that adds to the app uses the same plugin.
 */
export function offlineWorker(): Plugin {
  let outDir = 'dist'
  let base = '/'
  return {
    name: 'sp-offline-worker',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      base = config.base
    },
    async closeBundle() {
      const files = filesIn(outDir).filter(precacheable).sort()
      const version = createHash('sha256')
      for (const f of files) version.update(f).update(f.startsWith('assets/') ? '' : readFileSync(path.join(outDir, f)))
      await build({
        configFile: false,
        logLevel: 'warn',
        publicDir: false,
        define: {
          __SP_PRECACHE__: JSON.stringify(files.map((f) => `${base}${f}`)),
          __SP_VERSION__: JSON.stringify(version.digest('hex').slice(0, 12)),
        },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          minify: true,
          lib: { entry: ENTRY, formats: ['iife'], name: 'spOffline', fileName: () => 'sw.js' },
        },
      })
    },
  }
}
