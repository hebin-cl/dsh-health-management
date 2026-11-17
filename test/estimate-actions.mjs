/**
 * Mounts the real plugin against a fake Host context and drives the panel
 * action route, so the meal-estimate model choice is verified end to end
 * (action dispatch -> estimate.json -> resolved route -> estimateMeal).
 *
 * No DSH process, network call, or model provider is involved: the fake `llm`
 * returns a fixed JSON estimate.
 *
 * Run with: node test/estimate-actions.mjs
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

let passes = 0
let failures = 0
function check(label, condition, detail) {
  if (condition) {
    passes += 1
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`)
  }
}

/** Real 1x1 transparent PNG. */
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_1X1}`

const ESTIMATE_REPLY = JSON.stringify({
  items: [{ name: '米饭', portion: '一碗', kcal: 230 }],
  kcal: 620,
  kcalLow: 520,
  kcalHigh: 720,
  protein: 30,
  confidence: 'medium',
})

const CATALOGS = {
  vision: [
    { provider: 'vision', id: 'v1', name: 'Vision One', inputModalities: ['text', 'image'] },
  ],
  text: [
    { provider: 'text', id: 't1', name: 'Text One', inputModalities: ['text'] },
  ],
}

/** Fake `llm` service: catalog lookup, route validation, and one canned stream. */
function fakeLlm() {
  return {
    listProviders: () => Object.keys(CATALOGS).map((id) => ({ id, name: `provider-${id}` })),
    listModels: async (provider) => CATALOGS[provider] ?? [],
    resolveModelInfo: async (provider, model) => {
      const found = (CATALOGS[provider] ?? []).find((item) => item.id === model)
      if (!found) throw new Error('未注册的模型')
      return found
    },
    stream(options) {
      return (async function* streamReply() {
        yield { type: 'text-delta', index: 0, text: ESTIMATE_REPLY }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
}

const dir = await mkdtemp(join(tmpdir(), 'dsh-health-estimate-actions-'))
try {
  const registeredRoutes = new Map()
  const disposers = []
  const services = {
    llm: fakeLlm(),
    // A text-only agent default: auto must fall back to the first image model.
    agentDefaultModel: { currentSelection: () => ({ provider: 'text', model: 't1' }) },
    attachments: {
      saveImage: async ({ mediaType, data }) => ({
        attachmentId: 'attachment-1',
        mediaType,
        bytes: data.length,
        width: 1,
        height: 1,
      }),
    },
  }

  const ctx = {
    workingDirectory: { defaultDirectory: dir },
    logger: { info() {}, error() {} },
    get(name) {
      return services[name]
    },
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    systemPrompt: { section: () => () => {} },
    tools: { register: () => () => {} },
    webServer: {
      register(route) {
        registeredRoutes.set(route.path, route)
        return () => {}
      },
    },
  }

  apply(ctx, { dataDir: dir })

  /** Invoke the same POST /api/dsh-health/action route the panel uses. */
  function callAction(action, args = {}) {
    const route = registeredRoutes.get('/api/dsh-health/action')
    if (!route?.handler) throw new Error('action route was not registered')
    return new Promise((resolve, reject) => {
      const body = Buffer.from(JSON.stringify({ action, args }), 'utf8')
      const req = {
        method: 'POST',
        headers: { 'content-length': String(body.length) },
        async *[Symbol.asyncIterator]() {
          yield body
        },
      }
      const res = {
        writeHead(status) {
          res.status = status
        },
        end(text) {
          try {
            resolve({ status: res.status, body: JSON.parse(text) })
          } catch (error) {
            reject(error)
          }
        },
      }
      Promise.resolve(route.handler(req, res)).catch(reject)
    })
  }

  console.log('\n[estimate actions: catalog]')
  const first = await callAction('getEstimateModels')
  check('the catalog action answers over the panel route', first.status === 200 && first.body.ok, first)
  check('the default preference is auto',
    first.body.settings?.mode === 'auto' && first.body.settings?.provider === null, first.body)
  check('only the image-capable model is offered',
    first.body.routes?.length === 1 && first.body.routes[0].model === 'v1'
    && first.body.routes[0].modelName === 'Vision One', first.body.routes)
  check('a text-only default model falls back to the vision model',
    first.body.resolved?.model === 'v1' && first.body.resolved?.source === 'auto',
    first.body.resolved)
  check('hasVision reflects the resolved route', first.body.hasVision === true, first.body)

  console.log('\n[estimate actions: pinning a model]')
  const pinned = await callAction('setEstimateSettings', {
    settings: { mode: 'fixed', provider: 'vision', model: 'v1' },
  })
  check('a pinned image model is accepted',
    pinned.body.ok && pinned.body.resolved?.source === 'fixed'
    && pinned.body.resolved?.modelName === 'Vision One', pinned.body)

  const stored = JSON.parse(await readFile(join(dir, 'estimate.json'), 'utf8'))
  check('the choice is stored next to the health documents',
    stored.mode === 'fixed' && stored.provider === 'vision' && stored.model === 'v1', stored)

  const afterPin = await callAction('getEstimateModels')
  check('the stored choice is what the next estimate resolves',
    afterPin.body.settings?.mode === 'fixed'
    && afterPin.body.resolved?.provider === 'vision'
    && afterPin.body.resolved?.model === 'v1', afterPin.body)

  const rejected = await callAction('setEstimateSettings', {
    settings: { mode: 'fixed', provider: 'text', model: 't1' },
  })
  check('a text-only model is refused', rejected.body.ok === false
    && /图片输入/.test(rejected.body.error), rejected.body)
  check('a refused change does not rewrite the stored choice',
    (await readFile(join(dir, 'estimate.json'), 'utf8')).includes('"model": "v1"'))

  console.log('\n[estimate actions: estimate uses the pinned route]')
  const estimated = await callAction('estimateMeal', {
    member: '我',
    dataBase64: PNG_DATA_URL,
    mealType: 'lunch',
  })
  check('the estimate succeeds through the panel action', estimated.body.ok === true, estimated.body)
  check('the estimate reports the pinned provider/model',
    estimated.body.estimate?.provider === 'vision'
    && estimated.body.estimate.model === 'v1'
    && estimated.body.estimate.modelName === 'Vision One'
    && estimated.body.estimate.source === 'fixed', estimated.body.estimate)
  check('the estimate keeps the confirmed-only contract',
    estimated.body.estimate?.kcal === 620 && estimated.body.privacy.includes('不会写入饮食记录'),
    estimated.body)

  const recordCount = await (async () => {
    try {
      const raw = await readFile(join(dir, 'records.json'), 'utf8')
      return JSON.parse(raw).records?.length ?? 0
    } catch {
      return 0
    }
  })()
  check('the estimate alone persisted no measurement record', recordCount === 0, recordCount)

  console.log('\n[estimate actions: errors]')
  const unknownAction = await callAction('nope')
  check('an unknown action still fails cleanly',
    unknownAction.body.ok === false && /未知操作/.test(unknownAction.body.error), unknownAction.body)

  const noImage = await callAction('estimateMeal', { member: '我' })
  check('an estimate without a photo asks for a manual value',
    noImage.body.ok === false && noImage.body.canManual === true, noImage.body)

  for (const dispose of disposers) {
    try { dispose() } catch { /* ignore */ }
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log(`\n${passes} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
