#!/usr/bin/env node
/**
 * Generate a format-1 plugin market index for the host's Discover page.
 *
 *   node scripts/build-market-index.mjs --owner your-name --source git
 *   node scripts/build-market-index.mjs --owner your-name --source npm
 *
 * `git` pins the current HEAD commit, which must already contain the plugin
 * package. `npm` points at the published package name/version instead.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const valueOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const owner = valueOf('owner', '')
const repo = valueOf('repo', pkg.name)
const sourceType = valueOf('source', 'npm')
if (!owner || owner === '__OWNER__') {
  console.error('Missing --owner (the GitHub account or organization).')
  process.exit(1)
}
if (sourceType !== 'npm' && sourceType !== 'git') {
  console.error('--source must be npm or git.')
  process.exit(1)
}

const repoUrl = `https://github.com/${owner}/${repo}`
let source
if (sourceType === 'git') {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    console.error('Could not resolve a 40-character git commit.')
    process.exit(1)
  }
  source = { type: 'git', url: repoUrl, commit }
} else {
  source = { type: 'npm' }
}

const index = {
  format: 1,
  title: { en: 'Health Management', zh: '健康管理' },
  description: {
    en: 'Family health records and management goals for DeepSeek Harness.',
    zh: 'DeepSeek Harness 的家庭健康记录与管理目标。',
  },
  metadata: {
    categories: { tools: { title: { en: 'Tools', zh: '工具' } } },
    labels: {},
    sortKeys: {},
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Health Management', zh: '健康管理' },
      description: {
        en: 'Family health records and management goals: metabolic monitoring plus a 12-week lean-muscle account, weekly ledger, body-composition statement, progress photos and health archive. Records only; no diagnosis or medication advice.',
        zh: '家庭健康记录与管理目标：代谢指标监测，以及 12 周薄肌账户、周对账、体成分对账单、身材照片与健康档案。仅做记录，不提供诊断或用药建议。',
      },
      icon: `https://raw.githubusercontent.com/${owner}/${repo}/main/assets/icon-180.png`,
      author: pkg.author ?? owner,
      homepage: `${repoUrl}#readme`,
      repository: { url: repoUrl },
      metadata: {
        category: 'tools',
        keywords: pkg.keywords ?? [],
        labels: [],
        sortKeys: {},
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source,
          engines: { dsh: pkg.engines?.dsh },
        },
      ],
    },
  ],
}

writeFileSync('index.json', `${JSON.stringify(index, null, 2)}\n`)
console.log(`wrote index.json (${sourceType}, ${pkg.name}@${pkg.version})`)
