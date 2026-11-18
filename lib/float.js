/**
 * Floating health-avatar settings and descriptive status.
 *
 * The avatar is a Web-panel surface, not a second health store: its reminder
 * engine reads aggregate counts, active goal codes and last water/training
 * timestamps, while the quick card receives a compact set of latest key values
 * with reference bands. It never evaluates a value for the reminder copy and
 * never assigns a disease label or proposes treatment. Its settings live in one
 * plugin-owned JSON document next to the other health documents, so show/hide
 * and the saved position survive a page reload and are shared by every DSH Web
 * window on this machine.
 *
 * The reminder copy itself stays on the Client: it is a general lifestyle nudge
 * ("drink some water", "stand up for a moment") plus a record reminder. It is
 * deliberately not derived from an abnormal measurement.
 */

import { JsonStore } from './store.js'
import { evaluate, formatValue, metricOf } from './metrics.js'

/** Sizes the Client draws; the Host clamps unknown values to `medium`. */
export const FLOAT_SIZES = ['small', 'medium', 'large']

/** Built-in avatar artwork the Client can draw. */
export const FLOAT_AVATAR_STYLES = ['portrait', 'bean', 'muscle', 'sun']

/** Longest display name, in Unicode code points. */
export const FLOAT_NAME_MAX = 24

/**
 * Longest data-URL accepted for an uploaded avatar. The Client caps the source
 * file at 512 KiB, which base64-encodes to roughly 700 KiB; this leaves room.
 */
export const FLOAT_AVATAR_MAX_LENGTH = 800 * 1024

/** Document version for the plugin-owned float settings file. */
export const FLOAT_VERSION = 1

/** Defaults are intentionally conservative: avatar on, reminders on, quiet at night. */
export const FLOAT_DEFAULTS = Object.freeze({
  name: '小肌霸',
  avatarStyle: 'portrait',
  avatarImage: null,
  enabled: true,
  remindersEnabled: true,
  intervalMinutes: 45,
  quietHoursEnabled: true,
  quietStart: '22:00',
  quietEnd: '08:00',
  bubbleSeconds: 12,
  desktopNotifications: false,
  size: 'medium',
  position: Object.freeze({ x: 0.972, y: 0.42 }),
})

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const AVATAR_DATA_PATTERN = /^data:image\/(?:png|jpeg|webp|gif);base64,/i
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/g

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const finiteNumber = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

/** Trim controls/whitespace, cap length by code point, and fall back to the default. */
export function normalizeFloatName(value) {
  const text = String(value ?? '').replace(CONTROL_PATTERN, '').trim()
  return Array.from(text).slice(0, FLOAT_NAME_MAX).join('') || FLOAT_DEFAULTS.name
}

/** Accept only a small, inlined raster image data URL. */
export function normalizeFloatAvatarImage(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  if (value.length > FLOAT_AVATAR_MAX_LENGTH) return null
  return AVATAR_DATA_PATTERN.test(value) ? value : null
}

/**
 * Coerce a stored or supplied settings document into a complete, bounded value.
 * A partially written document (an older build, a hand edit, an interrupted
 * write that still parsed) can therefore never take the avatar routes down.
 *
 * @param {unknown} raw
 */
export function normalizeFloatSettings(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const position = input.position && typeof input.position === 'object' && !Array.isArray(input.position)
    ? input.position
    : {}
  return {
    version: FLOAT_VERSION,
    name: normalizeFloatName(input.name),
    avatarStyle: FLOAT_AVATAR_STYLES.includes(input.avatarStyle)
      ? input.avatarStyle
      : FLOAT_DEFAULTS.avatarStyle,
    avatarImage: normalizeFloatAvatarImage(input.avatarImage),
    enabled: input.enabled !== false,
    remindersEnabled: input.remindersEnabled !== false,
    intervalMinutes: clamp(
      Math.round(finiteNumber(input.intervalMinutes, FLOAT_DEFAULTS.intervalMinutes)),
      5,
      240,
    ),
    quietHoursEnabled: input.quietHoursEnabled === true,
    quietStart: TIME_PATTERN.test(input.quietStart) ? input.quietStart : FLOAT_DEFAULTS.quietStart,
    quietEnd: TIME_PATTERN.test(input.quietEnd) ? input.quietEnd : FLOAT_DEFAULTS.quietEnd,
    bubbleSeconds: clamp(
      Math.round(finiteNumber(input.bubbleSeconds, FLOAT_DEFAULTS.bubbleSeconds)),
      0,
      120,
    ),
    desktopNotifications: input.desktopNotifications === true,
    size: FLOAT_SIZES.includes(input.size) ? input.size : FLOAT_DEFAULTS.size,
    position: {
      x: clamp(finiteNumber(position.x, FLOAT_DEFAULTS.position.x), 0, 1),
      y: clamp(finiteNumber(position.y, FLOAT_DEFAULTS.position.y), 0, 1),
    },
  }
}

/**
 * One atomic JSON document for the floating avatar's preferences.
 */
export class FloatSettingsStore {
  /** @param {string} filePath */
  constructor(filePath) {
    this.store = new JsonStore(
      filePath,
      () => normalizeFloatSettings(FLOAT_DEFAULTS),
      normalizeFloatSettings,
    )
  }

  /** @returns {Promise<ReturnType<typeof normalizeFloatSettings>>} */
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
    return this.store.update((current) => normalizeFloatSettings({
      ...current,
      ...clean,
      // `position` is the one nested field, so merge it rather than letting a
      // partial {x} patch erase the current y.
      position: clean.position && typeof clean.position === 'object' && !Array.isArray(clean.position)
        ? { ...current.position, ...clean.position }
        : current.position,
    }))
  }

  /** Resolve the document path this store uses. */
  get path() {
    return this.store.path
  }
}

/** Local calendar day of the machine hosting DSH, matching record day keys. */
export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const LEAN_KEY_METRICS = ['weight', 'bodyfat', 'muscle', 'waist']
const METABOLIC_KEY_METRICS = ['sbp', 'dbp', 'fpg', 'waist', 'tg', 'hdl']
const DEFAULT_KEY_METRICS = ['weight', 'sbp', 'fpg', 'waist']

/** Latest timestamp and value per metric for one member, without evaluating. */
function latestByMetric(records) {
  const sorted = records.slice().sort((a, b) => (String(a?.measuredAt) < String(b?.measuredAt) ? 1 : -1))
  const latest = {}
  for (const record of sorted) {
    for (const [code, value] of Object.entries(record?.values ?? {})) {
      if (typeof value !== 'number') continue
      if (latest[code] === undefined) latest[code] = { value, measuredAt: record.measuredAt }
    }
  }
  return latest
}

/** Rolling 7-day average and distinct measurement days for one metric. */
function sevenDayAverage(records, code) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 6)
  const cutoffDay = localDateString(cutoff)
  const values = []
  const days = new Set()
  for (const record of records) {
    const day = String(record?.measuredAt ?? '').slice(0, 10)
    if (day < cutoffDay) continue
    const value = record?.values?.[code]
    if (typeof value !== 'number') continue
    values.push(value)
    days.add(day)
  }
  if (values.length === 0) return null
  return {
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    days: days.size,
  }
}

/**
 * Compact "key metrics" for the quick card. Values and reference bands only:
 * no pass/fail score, no diagnosis, and blood pressure is shown as a 7-day
 * average with measurement days rather than a single-reading verdict.
 */
function buildKeyMetrics(member, records, activeCodes) {
  const latest = latestByMetric(records)
  const lean = activeCodes.includes('lean_muscle')
  const metabolic = activeCodes.includes('metabolic')
  const codes = lean
    ? LEAN_KEY_METRICS
    : metabolic
      ? METABOLIC_KEY_METRICS
      : DEFAULT_KEY_METRICS
  const rows = []
  if (!lean) {
    const sbp = sevenDayAverage(records, 'sbp')
    const dbp = sevenDayAverage(records, 'dbp')
    if (sbp || dbp) {
      const latestAt = latest.sbp?.measuredAt ?? latest.dbp?.measuredAt ?? null
      rows.push({
        code: 'bp',
        name: '血压（近 7 天均值）',
        display: `${sbp ? Math.round(sbp.avg) : '—'}/${dbp ? Math.round(dbp.avg) : '—'}`,
        unit: 'mmHg',
        measuredAt: latestAt,
        bandLabel: `${Math.max(sbp?.days ?? 0, dbp?.days ?? 0)} 天有记录`,
        status: 'info',
      })
    }
  }
  for (const code of codes) {
    if (code === 'sbp' || code === 'dbp') continue
    const metric = metricOf(code)
    const item = latest[code]
    if (!metric || !item) continue
    const verdict = evaluate(metric, item.value, member)
    rows.push({
      code,
      name: metric.name,
      value: item.value,
      display: formatValue(metric, item.value),
      unit: metric.unit,
      measuredAt: item.measuredAt,
      bandLabel: verdict.band?.label ?? null,
      status: verdict.status,
    })
  }
  return rows.slice(0, 5)
}

/**
 * Member-aware, descriptive status for the avatar's reminder copy and quick
 * card. It exposes record counts, timestamps and latest key values; it never
 * diagnoses, scores body composition, or represents a management goal as a
 * disease judgment.
 *
 * @param {import('./service.js').HealthService} service
 * @param {string} [memberRef]
 */
export async function floatStatus(service, memberRef) {
  let members = []
  let records = []
  let goals = []
  try {
    members = await service.listMembers()
  } catch {
    members = []
  }
  try {
    records = (await service.records.read()).records ?? []
  } catch {
    records = []
  }
  try {
    goals = (await service.goals.read()).goals ?? []
  } catch {
    goals = []
  }

  let member = null
  if (memberRef) {
    try {
      member = await service.findMember(memberRef)
    } catch {
      member = undefined
    }
  }
  if (!member) member = members[0] ?? null

  const owned = member
    ? records.filter((record) => record?.memberId === member.id)
    : []
  const today = localDateString()
  const todayRecords = owned.filter((record) => String(record?.measuredAt ?? '').slice(0, 10) === today)
  const counts = {}
  for (const record of todayRecords) {
    for (const code of Object.keys(record?.values ?? {})) {
      if (typeof record.values[code] !== 'number') continue
      counts[code] = (counts[code] ?? 0) + 1
    }
  }

  const latest = latestByMetric(owned)
  const activeGoals = member
    ? goals
        .filter((goal) => goal?.memberId === member.id && goal?.status === 'active')
        .map((goal) => ({ code: goal.code }))
    : []
  const activeCodes = activeGoals.map((goal) => goal.code)
  const keyMetrics = member ? buildKeyMetrics(member, owned, activeCodes) : []

  const lastRecordAt = owned.reduce((latestAt, record) => {
    const at = String(record?.measuredAt ?? '')
    return at > latestAt ? at : latestAt
  }, '')

  return {
    today,
    memberCount: members.length,
    member: member ? { id: member.id, name: member.name } : null,
    primaryMember: member ? { id: member.id, name: member.name } : null,
    todayRecordCount: todayRecords.length,
    todayMealCount: todayRecords.filter((record) => (
      Boolean(record?.mealType) || typeof record?.values?.kcal === 'number'
    )).length,
    counts,
    activeGoals,
    lastWaterAt: latest.water?.measuredAt ?? null,
    lastTrainingAt: latest.training?.measuredAt ?? null,
    keyMetrics,
    lastRecordAt: lastRecordAt || null,
  }
}
