// Post-rename sanity: the loader id, host plugin name, and patch row must all
// agree with package.json's name.
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const client = fs.readFileSync('lib/client.js', 'utf8')
const host = fs.readFileSync('lib/index.js', 'utf8')
const patch = fs.readFileSync('cordis.patch.yml', 'utf8')

const loaderId = /id:\s*"([^"]+)"/.exec(client)?.[1]
const hostName = /const name = '([^']+)'/.exec(host)?.[1]
const patchName = /name:\s*([^\s#]+)\s*$/m.exec(patch)?.[1]

const rows = [
  ['package.json name', pkg.name],
  ['loader id', loaderId],
  ['host plugin name', hostName],
  ['cordis.patch.yml name', patchName],
]
let ok = true
for (const [label, value] of rows) {
  const match = value === pkg.name
  if (!match) ok = false
  console.log(`${match ? 'OK  ' : 'FAIL'} ${label.padEnd(22)} ${value}`)
}
console.log(ok ? 'all identities agree' : 'MISMATCH — rename incomplete')
process.exit(ok ? 0 : 1)
