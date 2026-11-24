import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// The Slop Zone's words live in src/slopText.json, in the slop editor's format (the slop-editor package on npm). This
// puts them in the page as its text block, with the package's slop.js and slop.css, which render them. While running
// `npm run edit`, the package's editor shows up on the page (its "Edit text" button) and saves back into the file.
// The file's `version` goes up with every save, so a page that loaded an older version can't save over what changed
// since; edit the file directly and the open page reloads.
// The AI-rticles in public/slop/play link /slop/slop.js and /slop/slop.css: this serves them from the installed package
// (and the build writes them to dist), so `npm update slop-editor` updates every page
const slopText = fileURLToPath(new URL('./src/slopText.json', import.meta.url))
const slopFile = (name) => createRequire(import.meta.url).resolve(`slop-editor/${name}`)
const SHARED = { '/slop/slop.js': 'text/javascript', '/slop/slop.css': 'text/css' }

function slopEditor() {
  let editing = false
  let lastSaved = null // the version this server wrote last, so its own saves don't reload the page
  return {
    name: 'slop-editor',
    configResolved(config) {
      editing = config.command === 'serve' && config.mode === 'edit'
    },
    async transformIndexHtml() {
      const [text, js, css] = await Promise.all([slopText, slopFile('slop.js'), slopFile('slop.css')].map((file) => readFile(file, 'utf8')))
      // compact, and safe inside a script element
      const block = JSON.stringify(JSON.parse(text)).replace(/</g, '\\u003c')
      return [
        { tag: 'style', children: css, injectTo: 'head' },
        { tag: 'script', attrs: { type: 'application/json', id: 'slop-text' }, children: block, injectTo: 'body-prepend' },
        { tag: 'script', children: js, injectTo: 'body' },
      ]
    },
    async generateBundle() {
      for (const at of Object.keys(SHARED)) {
        this.emitFile({ type: 'asset', fileName: at.slice(1), source: await readFile(slopFile(at.split('/').pop()), 'utf8') })
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const at = req.url.split('?')[0]
        if (!SHARED[at]) return next()
        res.setHeader('content-type', `${SHARED[at]}; charset=utf-8`)
        res.end(await readFile(slopFile(at.split('/').pop()), 'utf8'))
      })
      server.watcher.add(slopText)
      server.watcher.on('change', async (file) => {
        if (file !== slopText) return
        try {
          if (JSON.parse(await readFile(slopText, 'utf8')).version === lastSaved) return
        } catch {
          return // halfway through being written
        }
        server.ws.send({ type: 'full-reload' })
      })
      if (!editing) return
      // a link straight into the zone, under Vite's own
      server.httpServer?.once('listening', () => setTimeout(() => {
        console.log(`  ➜  Slop Zone, with the slop editor: http://localhost:${server.httpServer.address().port}/#slop-zone\n`)
      }, 100))
      // the package's handshake: a GET answers "slop-editor", and a POST saves the whole text block
      server.middlewares.use('/__slop', (req, res) => {
        // only the zone saves here. An AI-rticle (/slop/play/…) gets no editor (any answer but "slop-editor"): edit
        // it with `npx slop-editor edit public/slop/play/<page>.html`
        if (/^\/slop\//.test(new URL(req.headers.referer ?? '/', 'http://localhost').pathname)) {
          if (req.method === 'POST') res.statusCode = 403
          res.end('not this page')
          return
        }
        if (req.method !== 'POST') {
          res.end('slop-editor')
          return
        }
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          try {
            const text = JSON.parse(body)
            if (!text.rupture || !text.intro || !text.headings) throw new Error('not Slop Zone text')
            const current = JSON.parse(await readFile(slopText, 'utf8'))
            if ((text.version ?? 0) !== (current.version ?? 0)) {
              res.statusCode = 409
              res.end('the file changed since this page loaded it. Reload the page (copy any unsaved edits first)')
              return
            }
            const saved = { ...text, version: (current.version ?? 0) + 1 }
            lastSaved = saved.version
            await writeFile(slopText, JSON.stringify(saved, null, 4) + '\n')
            res.end(String(saved.version))
          } catch (e) {
            res.statusCode = 400
            res.end(e.message)
          }
        })
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), slopEditor()],
})
