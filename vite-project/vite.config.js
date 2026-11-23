import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// While running `npm run edit`, the Slop Zone's "Edit text" panel saves its changes back into this file. Its
// `version` goes up with every save (and with every edit made to the file directly), so a page that loaded an older
// version can't save over what changed since
const slopText = fileURLToPath(new URL('./src/slopProjects.json', import.meta.url))

function slopTextSaver() {
  return {
    name: 'slop-text-saver',
    apply: (config, { command, mode }) => command === 'serve' && mode === 'edit',
    configureServer(server) {
      // a link straight into the zone, under Vite's own
      server.httpServer?.once('listening', () => setTimeout(() => {
        console.log(`  \u279c  Slop Zone, with the Edit text panel: http://localhost:${server.httpServer.address().port}/#slop-zone\n`)
      }, 100))
      server.middlewares.use('/__slop-text', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          try {
            const text = JSON.parse(body)
            if (!text.rupture || !text.intro || !text.headings || !Array.isArray(text.projects)) throw new Error('not Slop Zone text')
            // a page left open from before the file changed shape would save the old shape over it
            const entries = text.projects.flatMap((project) => project.items ?? [project])
            if (!entries.every((entry) => ['what', 'how', 'role'].every((part) => Array.isArray(entry[part])))) {
              throw new Error('this page is out of date: reload it, then make your edits again')
            }
            const current = JSON.parse(await readFile(slopText, 'utf8'))
            if ((text.version ?? 0) !== (current.version ?? 0)) {
              res.statusCode = 409
              res.end('the file changed since this page loaded it. Reload the page (copy any unsaved edits first)')
              return
            }
            const saved = { ...text, version: (current.version ?? 0) + 1 }
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
  plugins: [react(), slopTextSaver()],
})
