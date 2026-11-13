import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const files = ['index.js', 'client.js', 'test/smoke.mjs']
for (const dir of ['lib', 'scripts']) {
  for (const name of readdirSync(join(root, dir))) {
    if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(join(dir, name))
  }
}

let failed = false
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.status !== 0) failed = true
}
if (failed) process.exit(1)

const smoke = spawnSync(process.execPath, ['test/smoke.mjs'], { stdio: 'inherit' })
process.exit(smoke.status ?? 1)
