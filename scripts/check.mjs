import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const files = ['index.js', 'client.js']
for (const dir of ['lib', 'scripts', 'test']) {
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

// Every test file is a standalone script that exits non-zero on failure.
const tests = readdirSync(join(root, 'test'))
  .filter((name) => name.endsWith('.mjs'))
  .sort()
for (const name of tests) {
  console.log(`\n>>> test/${name}`)
  const result = spawnSync(process.execPath, [join('test', name)], { stdio: 'inherit' })
  if (result.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
