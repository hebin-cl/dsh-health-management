/**
 * Meal-photo estimation routing: which model service reads the photo.
 *
 * The estimate itself is throwaway (the panel only gets a proposal; nothing is
 * persisted until the user confirms `saveMeal`), but the choice of model is a
 * device-level preference: it is the user's own API budget and their own
 * provider configuration. It therefore lives in one plugin-owned JSON document
 * next to the health data and is shared by every DSH Web window on this
 * machine, instead of being hard-wired to the agent's default model.
 *
 * `auto` keeps the old behaviour: the agent default model when it accepts
 * image input, otherwise the first registered model that declares `image`.
 * `fixed` uses exactly the provider/model the user picked. Adding a provider
 * (including an OpenAI-compatible local endpoint) stays a DSH Settings concern;
 * this module only selects among the routes the `llm` service already knows.
 */

import { JsonStore } from './store.js'

/** Document version for the plugin-owned estimate settings file. */
export const ESTIMATE_VERSION = 1

/** How the estimate route is chosen. */
export const ESTIMATE_MODES = ['auto', 'fixed']

/** Longest accepted provider/model id, in code points. */
export const ESTIMATE_ID_MAX = 120

/** Defaults are the historical behaviour: nothing pinned. */
export const ESTIMATE_DEFAULTS = Object.freeze({
  mode: 'auto',
  provider: null,
  model: null,
})

const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/g

/** Trim controls/whitespace, cap length, and treat empty as "not set". */
function cleanId(value) {
  const text = String(value ?? '').replace(CONTROL_PATTERN, '').trim()
  if (text === '') return null
  return Array.from(text).slice(0, ESTIMATE_ID_MAX).join('')
}

/**
 * Coerce a stored or supplied settings document into a complete, bounded value.
 *
 * `fixed` without both ids is meaningless, so it degrades to `auto` rather than
 * leaving the panel with a selection that cannot be resolved. A hand-edited file
 * can therefore never break the estimate route.
 *
 * @param {unknown} raw
 */
export function normalizeEstimateSettings(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const provider = cleanId(input.provider)
  const model = cleanId(input.model)
  const fixed = input.mode === 'fixed' && provider !== null && model !== null
  return {
    version: ESTIMATE_VERSION,
    mode: fixed ? 'fixed' : 'auto',
    provider: fixed ? provider : null,
    model: fixed ? model : null,
  }
}

/**
 * One atomic JSON document for the meal-estimate model preference.
 */
export class EstimateSettingsStore {
  /** @param {string} filePath */
  constructor(filePath) {
    this.store = new JsonStore(
      filePath,
      () => normalizeEstimateSettings(ESTIMATE_DEFAULTS),
      normalizeEstimateSettings,
    )
  }

  /** @returns {Promise<ReturnType<typeof normalizeEstimateSettings>>} */
  async get() {
    return this.store.read()
  }

  /**
   * Merge one partial change into the persisted settings.
   *
   * @param {object} patch
   */
  async save(patch) {
    const clean = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
    return this.store.update((current) => normalizeEstimateSettings({ ...current, ...clean }))
  }

  /** Resolve the document path this store uses. */
  get path() {
    return this.store.path
  }
}

/** A model accepts the meal photo only when it declares `image` input. */
export function supportsImageInput(info) {
  return Array.isArray(info?.inputModalities) && info.inputModalities.includes('image')
}

async function safeListModels(llm, provider) {
  try {
    return (await llm.listModels(provider)) ?? []
  } catch {
    return []
  }
}

function safeProviders(llm) {
  try {
    return llm.listProviders() ?? []
  } catch {
    return []
  }
}

/** Read the agent default model defensively; the service may be absent. */
export function defaultModelSelection(getDefaultSelection) {
  try {
    const selection = getDefaultSelection?.()
    if (selection?.provider && selection?.model) return selection
  } catch {
    // A missing/uninitialised default-model service means "no preference".
  }
  return undefined
}

/**
 * Every image-capable route the `llm` service can reach right now, in provider
 * registration order. Provider catalogs that fail to load are skipped: an
 * unknown catalog must not take the picker down.
 *
 * @param {{ listProviders: Function, listModels: Function }} llm
 */
export async function listVisionRoutes(llm) {
  const routes = []
  for (const provider of safeProviders(llm)) {
    const models = await safeListModels(llm, provider.id)
    for (const model of models) {
      if (!supportsImageInput(model)) continue
      routes.push({
        provider: provider.id,
        providerName: provider.name ?? provider.id,
        model: model.id,
        modelName: model.name ?? model.id,
      })
    }
  }
  return routes
}

/**
 * Choose a route automatically. The agent default model wins when its metadata
 * is unknown (the route may be custom) or when it declares image input;
 * otherwise the first image-capable model wins.
 *
 * @param {{ listProviders: Function, listModels: Function }} llm
 * @param {{ getDefaultSelection?: () => { provider?: string, model?: string } | undefined }} [options]
 */
export async function pickAutoRoute(llm, { getDefaultSelection } = {}) {
  const selection = defaultModelSelection(getDefaultSelection)
  if (selection) {
    const models = await safeListModels(llm, selection.provider)
    const info = models.find((model) => model.id === selection.model)
    if (!info || supportsImageInput(info)) {
      return {
        provider: selection.provider,
        providerName: selection.provider,
        model: selection.model,
        modelName: info?.name ?? selection.model,
        source: 'default',
      }
    }
  }
  const routes = await listVisionRoutes(llm)
  const first = routes[0]
  return first ? { ...first, source: 'auto' } : undefined
}

/**
 * Resolve the concrete route one estimate will use. A pinned route is returned
 * without a catalog lookup so a provider whose catalog is temporarily
 * unavailable still gets its explicit attempt; the call itself reports failure.
 *
 * @param {ReturnType<typeof normalizeEstimateSettings>} settings
 * @param {{ listProviders: Function, listModels: Function }} llm
 * @param {{ getDefaultSelection?: () => { provider?: string, model?: string } | undefined }} [options]
 */
export async function resolveEstimateRoute(settings, llm, { getDefaultSelection } = {}) {
  const normalized = normalizeEstimateSettings(settings)
  if (normalized.mode === 'fixed') {
    let providerName = normalized.provider
    let modelName = normalized.model
    for (const provider of safeProviders(llm)) {
      if (provider.id !== normalized.provider) continue
      providerName = provider.name ?? provider.id
      const models = await safeListModels(llm, provider.id)
      const info = models.find((model) => model.id === normalized.model)
      if (info) modelName = info.name ?? info.id
      break
    }
    return {
      provider: normalized.provider,
      providerName,
      model: normalized.model,
      modelName,
      source: 'fixed',
    }
  }
  return pickAutoRoute(llm, { getDefaultSelection })
}

/**
 * Read the preference, the available image routes, and the route an estimate
 * would use right now. Read-only: the panel calls this before spending a call
 * so it can show which model is about to receive the photo.
 */
export async function buildEstimateCatalog({ llm, store, getDefaultSelection } = {}) {
  let settings
  try {
    settings = await store.get()
  } catch {
    settings = normalizeEstimateSettings({})
  }
  if (!llm) return { ok: true, settings, routes: [], resolved: null, hasVision: false }
  let routes = []
  try {
    routes = await listVisionRoutes(llm)
  } catch {
    routes = []
  }
  let resolved
  try {
    resolved = await resolveEstimateRoute(settings, llm, { getDefaultSelection })
  } catch {
    resolved = undefined
  }
  return {
    ok: true,
    settings,
    routes,
    resolved: resolved ?? null,
    // A pinned route resolves without a catalog, so it still counts as usable.
    hasVision: Boolean(resolved),
  }
}

/**
 * Persist the model preference. A pinned route is verified against the `llm`
 * service (registered route + declared image input) before it is stored, so a
 * typo cannot silently turn every estimate into a failure.
 */
export async function updateEstimateSettings({ llm, store, patch, getDefaultSelection } = {}) {
  const clean = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : undefined
  if (!clean) return { ok: false, error: '设置格式无效。' }
  let current
  try {
    current = await store.get()
  } catch {
    current = normalizeEstimateSettings({})
  }
  const next = normalizeEstimateSettings({ ...current, ...clean })
  if (clean.mode === 'fixed' && next.mode !== 'fixed') {
    return { ok: false, error: '请选择一个具体的模型，或改回自动选择。' }
  }
  if (next.mode === 'fixed') {
    if (!llm) return { ok: false, error: '当前没有可用的模型服务。' }
    let info
    try {
      info = await llm.resolveModelInfo(next.provider, next.model)
    } catch (error) {
      return { ok: false, error: `无法使用该模型：${String(error?.message ?? error)}` }
    }
    // Reject only a model that explicitly declares text-only input; an unknown
    // capability is left to the provider, which reports its own error.
    const declared = Array.isArray(info?.inputModalities) ? info.inputModalities : []
    if (declared.length > 0 && !declared.includes('image')) {
      return { ok: false, error: '该模型不支持图片输入，请换一个支持图片的模型。' }
    }
  }
  try {
    await store.save(next)
  } catch (error) {
    return { ok: false, error: `保存失败：${String(error?.message ?? error)}` }
  }
  return buildEstimateCatalog({ llm, store, getDefaultSelection })
}

