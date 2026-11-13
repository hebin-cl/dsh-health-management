#!/usr/bin/env node
/**
 * Fill the GitHub owner placeholder in every tracked text file.
 *
 *   node scripts/configure-repo.mjs --owner your-name
 *
 * Keeps the package/repository name `dsh-health-management`; run this before
 * the first commit (or commit again afterwards).
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const ownerIndex = args.indexOf('--owner')
const owner = ownerIndex >= 0 ? args[ownerIndex + 1] : ''
if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) {
  console.error('Usage: node scripts/configure-repo.mjs --owner <github-owner>')
  process.exit(1)
}

const skip = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const extensions = new Set(['.md', '.json', '.yml', '.yaml'])
let changed = 0

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue
    const path = join(dir, name)
    const info = statSync(path)
    if (info.isDirectory()) {
      walk(path)
      continue
    }
    if (!extensions.has(name.slice(name.lastIndexOf('.')))) continue
    const text = readFileSync(path, 'utf8')
    if (!text.includes('__OWNER__')) continue
    writeFileSync(path, text.split('__OWNER__').join(owner))
    changed += 1
    console.log(`updated ${path}`)
  }
}

walk('.')
console.log(`done: ${changed} file(s) updated for ${owner}`)
