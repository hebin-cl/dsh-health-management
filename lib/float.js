/**
 * Floating health-avatar settings and descriptive status.
 *
 * The avatar is a Web-panel surface, not a second health store: it only reads
 * aggregate counts (how many records exist today, which management goals are
 * active) and never evaluates a value, assigns a disease label, or proposes
 * treatment. Its settings live in one plugin-owned JSON document next to the
 * other health documents, so showing/hiding the avatar survives a page reload
 * and is shared by every DSH Web window on this machine.
 *
 * The reminder copy itself stays on the Client: it is a general lifestyle nudge
 * ("drink some water", "stand up for a moment") plus a record reminder. It is
 * deliberately not derived from an abnormal measurement.
 */

import { JsonStore } from './store.js'

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

/**
 * Aggregate, non-diagnostic status for the avatar's reminder copy and its
 * settings page. It deliberately exposes counts only: no verdicts, no target
 * gaps, no body-composition statements.
 *
 * @param {import('./service.js').HealthService} service
 */
export async function floatStatus(service) {
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

  const today = localDateString()
  const todayRecords = records.filter((record) => String(record?.measuredAt ?? '').slice(0, 10) === today)
  const counts = {}
  for (const record of todayRecords) {
    for (const code of Object.keys(record?.values ?? {})) {
      if (typeof record.values[code] !== 'number') continue
      counts[code] = (counts[code] ?? 0) + 1
    }
  }

  const memberName = new Map(members.map((member) => [member.id, member.name]))
  const activeGoals = goals
    .filter((goal) => goal?.status === 'active')
    .map((goal) => ({
      code: goal.code,
      memberId: goal.memberId ?? null,
      memberName: goal.memberId ? (memberName.get(goal.memberId) ?? null) : null,
    }))

  const lastRecordAt = records.reduce((latest, record) => {
    const at = String(record?.measuredAt ?? '')
    return at > latest ? at : latest
  }, '')

  return {
    today,
    memberCount: members.length,
    primaryMember: members.length > 0
      ? { id: members[0].id, name: members[0].name }
      : null,
    todayRecordCount: todayRecords.length,
    todayMealCount: todayRecords.filter((record) => (
      Boolean(record?.mealType) || typeof record?.values?.kcal === 'number'
    )).length,
    counts,
    activeGoals,
    lastRecordAt: lastRecordAt || null,
  }
}
