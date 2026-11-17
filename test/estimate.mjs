/**
 * Focused checks for meal-photo estimation routing: preference normalization,
 * atomic persistence, and how a vision-capable route is resolved from the
 * `llm` service catalog.
 *
 * Run with: node test/estimate.mjs
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ESTIMATE_DEFAULTS,
  ESTIMATE_ID_MAX,
  EstimateSettingsStore,
  buildEstimateCatalog,
  defaultModelSelection,
  listVisionRoutes,
  normalizeEstimateSettings,
  pickAutoRoute,
  resolveEstimateRoute,
  supportsImageInput,
  updateEstimateSettings,
} from '../lib/estimate.js'

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

/** Minimal `llm` service: providers in order, each with its own catalog. */
function fakeLlm(catalogs, { failProviders = false } = {}) {
  return {
    listProviders() {
      if (failProviders) throw new Error('no provider registry')
      return Object.entries(catalogs).map(([id]) => ({ id, name: `provider-${id}` }))
    },
    async listModels(provider) {
      return catalogs[provider] ?? []
    },
    async resolveModelInfo(provider, model) {
      const found = (catalogs[provider] ?? []).find((item) => item.id === model)
      if (!found) throw new Error('未注册的模型')
      return found
    },
  }
}

const CATALOGS = {
  text: [
    { provider: 'text', id: 't1', name: 'Text One', inputModalities: ['text'] },
  ],
  vision: [
    { provider: 'vision', id: 'v1', name: 'Vision One', inputModalities: ['text', 'image'] },
    { provider: 'vision', id: 'v2', name: 'Vision Two', inputModalities: ['image'] },
  ],
  broken: [],
}

const dir = await mkdtemp(join(tmpdir(), 'dsh-health-estimate-'))
try {
  console.log('\n[estimate: normalization]')
  const defaults = normalizeEstimateSettings({})
  check('defaults are auto with no pinned route',
    defaults.mode === 'auto' && defaults.provider === null && defaults.model === null, defaults)
  check('defaults carry the current document version', defaults.version === 1, defaults)

  const fixed = normalizeEstimateSettings({ mode: 'fixed', provider: 'vision', model: 'v1' })
  check('a complete fixed route is kept',
    fixed.mode === 'fixed' && fixed.provider === 'vision' && fixed.model === 'v1', fixed)

  const missingModel = normalizeEstimateSettings({ mode: 'fixed', provider: 'vision' })
  check('fixed without a model degrades to auto',
    missingModel.mode === 'auto' && missingModel.provider === null, missingModel)

  const missingProvider = normalizeEstimateSettings({ mode: 'fixed', model: 'v1' })
  check('fixed without a provider degrades to auto',
    missingProvider.mode === 'auto' && missingProvider.model === null, missingProvider)

  const garbageMode = normalizeEstimateSettings({ mode: 'pinned', provider: 'vision', model: 'v1' })
  check('an unknown mode falls back to auto', garbageMode.mode === 'auto', garbageMode)

  const dirty = normalizeEstimateSettings({
    mode: 'fixed',
    provider: '  vis\u0000ion  ',
    model: 'v1\n',
  })
  check('control characters and padding are trimmed',
    dirty.provider === 'vision' && dirty.model === 'v1', dirty)

  const long = normalizeEstimateSettings({
    mode: 'fixed',
    provider: 'p'.repeat(ESTIMATE_ID_MAX + 40),
    model: 'm',
  })
  check('over-long ids are capped', long.provider.length === ESTIMATE_ID_MAX, long.provider?.length)

  const nulls = normalizeEstimateSettings(null)
  check('a null document becomes the defaults',
    nulls.mode === ESTIMATE_DEFAULTS.mode && nulls.provider === null, nulls)

  console.log('\n[estimate: persistence]')
  const store = new EstimateSettingsStore(join(dir, 'estimate.json'))
  const initial = await store.get()
  check('a missing document reads as auto', initial.mode === 'auto', initial)

  const saved = await store.save({ mode: 'fixed', provider: 'vision', model: 'v2' })
  check('a fixed choice is persisted',
    saved.mode === 'fixed' && saved.provider === 'vision' && saved.model === 'v2', saved)

  const reread = new EstimateSettingsStore(join(dir, 'estimate.json'))
  check('a second store sees the same document',
    (await reread.get()).model === 'v2', await reread.get())

  const raw = JSON.parse(await readFile(join(dir, 'estimate.json'), 'utf8'))
  check('the document is written atomically as JSON',
    raw.version === 1 && raw.mode === 'fixed', raw)

  const backToAuto = await store.save({ mode: 'auto' })
  check('switching back to auto clears the pinned ids',
    backToAuto.mode === 'auto' && backToAuto.provider === null && backToAuto.model === null,
    backToAuto)

  console.log('\n[estimate: vision routes]')
  const llm = fakeLlm(CATALOGS)
  check('image input is read from inputModalities',
    supportsImageInput({ inputModalities: ['text', 'image'] })
    && !supportsImageInput({ inputModalities: ['text'] })
    && !supportsImageInput({}), 'supportsImageInput')

  const routes = await listVisionRoutes(llm)
  check('only image-capable models become routes',
    routes.length === 2 && routes.every((route) => route.provider === 'vision'), routes)
  check('routes carry provider and model display names',
    routes[0].providerName === 'provider-vision' && routes[0].modelName === 'Vision One',
    routes[0])

  const failing = fakeLlm(CATALOGS, { failProviders: true })
  check('a broken provider registry yields no routes',
    (await listVisionRoutes(failing)).length === 0, await listVisionRoutes(failing))

  console.log('\n[estimate: automatic route]')
  const autoDefault = await pickAutoRoute(llm, {
    getDefaultSelection: () => ({ provider: 'vision', model: 'v1' }),
  })
  check('the default model wins when it accepts images',
    autoDefault.provider === 'vision' && autoDefault.model === 'v1'
    && autoDefault.modelName === 'Vision One' && autoDefault.source === 'default', autoDefault)

  const autoUnknownDefault = await pickAutoRoute(llm, {
    getDefaultSelection: () => ({ provider: 'custom', model: 'not-in-catalog' }),
  })
  check('an unknown default route is still worth a try',
    autoUnknownDefault.provider === 'custom' && autoUnknownDefault.source === 'default',
    autoUnknownDefault)

  const autoTextDefault = await pickAutoRoute(llm, {
    getDefaultSelection: () => ({ provider: 'text', model: 't1' }),
  })
  check('a text-only default falls back to the first image route',
    autoTextDefault.provider === 'vision' && autoTextDefault.model === 'v1'
    && autoTextDefault.source === 'auto', autoTextDefault)

  const autoNoDefault = await pickAutoRoute(llm, {})
  check('without a default the first image route wins',
    autoNoDefault.provider === 'vision' && autoNoDefault.model === 'v1', autoNoDefault)

  const autoNone = await pickAutoRoute(fakeLlm({ text: CATALOGS.text }), {})
  check('no image model resolves to nothing', autoNone === undefined, autoNone)

  const throwing = pickAutoRoute(llm, {
    getDefaultSelection: () => { throw new Error('service absent') },
  })
  check('a throwing default-model service is ignored', (await throwing)?.provider === 'vision')

  console.log('\n[estimate: resolved route]')
  const fixedRoute = await resolveEstimateRoute(
    { mode: 'fixed', provider: 'vision', model: 'v2' },
    llm,
    {},
  )
  check('a pinned route resolves with display names',
    fixedRoute.provider === 'vision' && fixedRoute.model === 'v2'
    && fixedRoute.providerName === 'provider-vision' && fixedRoute.modelName === 'Vision Two'
    && fixedRoute.source === 'fixed', fixedRoute)

  const pinnedMissing = await resolveEstimateRoute(
    { mode: 'fixed', provider: 'vision', model: 'gone' },
    llm,
    {},
  )
  check('a pinned route outside the catalog still resolves',
    pinnedMissing.model === 'gone' && pinnedMissing.modelName === 'gone'
    && pinnedMissing.source === 'fixed', pinnedMissing)

  const autoRoute = await resolveEstimateRoute(
    { mode: 'auto' },
    llm,
    { getDefaultSelection: () => ({ provider: 'text', model: 't1' }) },
  )
  check('auto mode delegates to the automatic picker',
    autoRoute.provider === 'vision' && autoRoute.source === 'auto', autoRoute)

  check('defaultModelSelection guards a throwing getter',
    defaultModelSelection(() => { throw new Error('boom') }) === undefined)

  console.log('\n[estimate: catalog]')
  const catalogStore = new EstimateSettingsStore(join(dir, 'catalog.json'))
  const catalog = await buildEstimateCatalog({
    llm,
    store: catalogStore,
    getDefaultSelection: () => ({ provider: 'text', model: 't1' }),
  })
  check('the catalog carries the settings, routes and resolved route',
    catalog.ok && catalog.settings.mode === 'auto'
    && catalog.routes.length === 2 && catalog.resolved?.model === 'v1'
    && catalog.hasVision === true, catalog)

  const noLlmCatalog = await buildEstimateCatalog({
    llm: undefined,
    store: catalogStore,
    getDefaultSelection: () => ({ provider: 'vision', model: 'v1' }),
  })
  check('without an llm service the catalog degrades to no routes',
    noLlmCatalog.ok && noLlmCatalog.routes.length === 0
    && noLlmCatalog.resolved === null && noLlmCatalog.hasVision === false, noLlmCatalog)

  console.log('\n[estimate: saving the preference]')
  const savedFixed = await updateEstimateSettings({
    llm,
    store: catalogStore,
    patch: { mode: 'fixed', provider: 'vision', model: 'v2' },
    getDefaultSelection: () => ({ provider: 'text', model: 't1' }),
  })
  check('a verified image model is saved and resolves as fixed',
    savedFixed.ok && savedFixed.settings.mode === 'fixed'
    && savedFixed.resolved?.source === 'fixed' && savedFixed.resolved.modelName === 'Vision Two',
    savedFixed)

  const beforeRejected = (await catalogStore.get()).model
  const textOnly = await updateEstimateSettings({
    llm,
    store: catalogStore,
    patch: { mode: 'fixed', provider: 'text', model: 't1' },
  })
  check('a text-only model is rejected with a readable reason',
    !textOnly.ok && /图片输入/.test(textOnly.error), textOnly)
  check('a rejected choice leaves the stored route untouched',
    (await catalogStore.get()).model === beforeRejected, await catalogStore.get())

  const unknownModel = await updateEstimateSettings({
    llm,
    store: catalogStore,
    patch: { mode: 'fixed', provider: 'vision', model: 'not-there' },
  })
  check('an unregistered model is rejected', !unknownModel.ok && /无法使用该模型/.test(unknownModel.error),
    unknownModel)

  const halfSelection = await updateEstimateSettings({
    llm,
    store: catalogStore,
    patch: { mode: 'fixed', provider: 'vision', model: null },
  })
  check('fixed without a model is rejected instead of stored',
    !halfSelection.ok && /具体/.test(halfSelection.error), halfSelection)

  const invalidPatch = await updateEstimateSettings({ llm, store: catalogStore, patch: [] })
  check('an array patch is rejected', !invalidPatch.ok, invalidPatch)

  const noLlmSave = await updateEstimateSettings({
    llm: undefined,
    store: catalogStore,
    patch: { mode: 'fixed', provider: 'vision', model: 'v1' },
  })
  check('pinning a model without an llm service is rejected',
    !noLlmSave.ok && /模型服务/.test(noLlmSave.error), noLlmSave)

  const autoAgain = await updateEstimateSettings({
    llm,
    store: catalogStore,
    patch: { mode: 'auto' },
  })
  check('switching to auto stores no pinned ids',
    autoAgain.ok && autoAgain.settings.mode === 'auto'
    && autoAgain.settings.provider === null, autoAgain)
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log(`\n${passes} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
