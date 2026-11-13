/**
 * Domain operations for the health-management plugin.
 *
 * All state lives in two JSON documents owned by the plugin: members and
 * measurement records. Every operation returns a plain result object and never
 * throws for user-level problems (unknown member, member limit, bad value) —
 * those come back as `{ ok: false, error }` so the agent tool and the Web panel
 * share exactly one implementation and one set of failure messages.
 */

import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { JsonStore, StoreCorruptError, expectDocument } from './store.js'
import {
  METRICS,
  evaluate,
  formatValue,
  metricOf,
  metricCodes,
  normalizeValues,
  resolveBand,
} from './metrics.js'
import {
  CONDITIONS,
  conditionCodes,
  conditionOf,
  resolveTargets,
  suggestConditions,
} from './conditions.js'
import {
  GOAL_DOMAINS,
  GOAL_SOURCES,
  GOAL_STATUSES,
  GOALS,
  buildGoalProgress,
  describeGoalTemplate,
  goalCodes,
  goalOf,
  sourceName,
  statusName,
} from './goals.js'

export const MAX_MEMBERS = 8

/** @typedef {'self'|'spouse'|'father'|'mother'|'son'|'daughter'|'sibling'|'grandfather'|'grandmother'|'other'} Relation */

export const DOCUMENT_TYPES = /** @type {const} */ ([
  { code: 'medical_record', name: '病历' },
  { code: 'prescription', name: '处方' },
  { code: 'lab_report', name: '检验报告' },
  { code: 'imaging', name: '影像报告' },
  { code: 'other', name: '其他' },
])

export const RELATIONS = /** @type {const} */ ([
  { code: 'self', name: '本人' },
  { code: 'spouse', name: '配偶' },
  { code: 'father', name: '父亲' },
  { code: 'mother', name: '母亲' },
  { code: 'son', name: '儿子' },
  { code: 'daughter', name: '女儿' },
  { code: 'sibling', name: '兄弟姐妹' },
  { code: 'grandfather', name: '祖父/外祖父' },
  { code: 'grandmother', name: '祖母/外祖母' },
  { code: 'other', name: '其他亲属' },
])

export const CONTEXTS = /** @type {const} */ ([
  { code: 'fasting', name: '空腹' },
  { code: 'postprandial', name: '餐后' },
  { code: 'morning', name: '晨起' },
  { code: 'evening', name: '睡前' },
  { code: 'random', name: '随机' },
])

/** Metric groups used by the entry form and the panel, in display order. */
export const METRIC_CATEGORIES = /** @type {const} */ ([
  { code: 'vital', name: '血压 / 心率 / 尿酸' },
  { code: 'glucose', name: '血糖' },
  { code: 'lipid', name: '血脂' },
  { code: 'body', name: '体成分 / 体重' },
  { code: 'diet', name: '饮食 / 饮水' },
  { code: 'activity', name: '运动' },
  { code: 'recovery', name: '恢复 / 睡眠' },
])

export const RISK_LEVELS = /** @type {const} */ ([
  { code: 'low', name: '低危' },
  { code: 'medium', name: '中危' },
  { code: 'high', name: '高危' },
  { code: 'veryHigh', name: '极高危' },
])

export const DISCLAIMER =
  '本工具仅用于记录和展示您自行测量的健康数据，并基于数据做统计性描述。' +
  '所有内容不构成医疗诊断、治疗建议或用药指导。' +
  '参考区间为人群通用参考值，不代表您的个人目标值。' +
  '请以医生的实际诊断和处方为准，任何用药调整务必咨询医生。'

export const GOAL_DISCLAIMER =
  '管理目标表示你想管理什么，不代表诊断或患病结论。' +
  '目标值来自通用参考区间，个人目标与是否患病请以医生意见为准。' +
  '薄肌等体态目标的参考区间来自运动/营养公开共识，非医学标准，不构成训练、营养或用药处方。'

const relationName = (code) => RELATIONS.find((item) => item.code === code)?.name ?? code
const contextName = (code) => CONTEXTS.find((item) => item.code === code)?.name ?? code
const riskName = (code) => RISK_LEVELS.find((item) => item.code === code)?.name ?? code

/** Normalize a member document and reject malformed shapes. */
function validateMembers(raw) {
  const doc = expectDocument(raw, { members: 'array' })
  for (const member of doc.members) {
    if (typeof member?.id !== 'string' || typeof member?.name !== 'string') {
      throw new Error('成员记录缺少 id 或 name')
    }
  }
  return doc
}

/** Normalize a records document and reject malformed shapes. */
function validateRecords(raw) {
  const doc = expectDocument(raw, { records: 'array' })
  for (const record of doc.records) {
    if (typeof record?.id !== 'string' || typeof record?.memberId !== 'string') {
      throw new Error('测量记录缺少 id 或 memberId')
    }
    if (typeof record?.measuredAt !== 'string') {
      throw new Error('测量记录缺少 measuredAt')
    }
  }
  return doc
}

/** Normalize a conditions document and reject malformed shapes. */
function validateConditions(raw) {
  const doc = expectDocument(raw, { conditions: 'array' })
  for (const item of doc.conditions) {
    if (typeof item?.id !== 'string' || typeof item?.memberId !== 'string' || typeof item?.code !== 'string') {
      throw new Error('疾病标签缺少 id、memberId 或 code')
    }
  }
  return doc
}

/** Normalize a documents (health archive) document and reject malformed shapes. */
function validateDocuments(raw) {
  const doc = expectDocument(raw, { documents: 'array' })
  for (const item of doc.documents) {
    if (typeof item?.id !== 'string' || typeof item?.memberId !== 'string') {
      throw new Error('档案记录缺少 id 或 memberId')
    }
  }
  return doc
}

/** Normalize a management-goal binding document and reject malformed shapes. */
function validateGoals(raw) {
  const doc = expectDocument(raw, { goals: 'array' })
  for (const item of doc.goals) {
    if (typeof item?.id !== 'string' || typeof item?.memberId !== 'string' || typeof item?.code !== 'string') {
      throw new Error('管理目标缺少 id、memberId 或 code')
    }
  }
  return doc
}

/** Normalize a progress-photo document and reject malformed shapes. */
function validatePhotos(raw) {
  const doc = expectDocument(raw, { photos: 'array' })
  for (const item of doc.photos) {
    if (typeof item?.id !== 'string' || typeof item?.memberId !== 'string' || typeof item?.filePath !== 'string') {
      throw new Error('身材照片缺少 id、memberId 或 filePath')
    }
    if (typeof item.takenAt !== 'string' || item.takenAt.length < 10) {
      throw new Error('身材照片缺少 takenAt')
    }
    if (!normalizeTimestamp(item.takenAt)) {
      throw new Error('身材照片 takenAt 无法解析')
    }
    if (item.kind !== undefined && item.kind !== 'progress' && item.kind !== 'inspiration') {
      throw new Error('身材照片 kind 非法')
    }
    if (item.mime !== undefined && !PHOTO_MIME[item.mime]) {
      throw new Error('身材照片 mime 非法')
    }
  }
  return doc
}

/** A member id can safely name a photo directory only when it is a plain segment. */
function photoSegment(memberId) {
  const text = String(memberId ?? '')
  if (/^[A-Za-z0-9_-]{1,64}$/.test(text)) return text
  // Legacy or hand-edited ids must never become `..` or an absolute path.
  return `h-${createHash('sha256').update(text).digest('hex').slice(0, 40)}`
}

/** Accepted image types for progress photos, keyed by data-URL mime. */
const PHOTO_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const PHOTO_MAX_BYTES = 12 * 1024 * 1024

/** Today's local date as YYYY-MM-DD. */
export function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * The health service: one instance per plugin activation.
 */
export class HealthService {
  /**
   * @param {string} baseDir  Directory that owns the data documents.
   */
  constructor(baseDir) {
    this.baseDir = baseDir
    this.members = new JsonStore(
      join(baseDir, 'members.json'),
      () => ({ version: 1, members: [] }),
      validateMembers,
    )
    this.records = new JsonStore(
      join(baseDir, 'records.json'),
      () => ({ version: 1, records: [] }),
      validateRecords,
    )
    this.conditions = new JsonStore(
      join(baseDir, 'conditions.json'),
      () => ({ version: 1, conditions: [] }),
      validateConditions,
    )
    this.documents = new JsonStore(
      join(baseDir, 'documents.json'),
      () => ({ version: 1, documents: [] }),
      validateDocuments,
    )
    this.goals = new JsonStore(
      join(baseDir, 'goals.json'),
      () => ({ version: 1, goals: [] }),
      validateGoals,
    )
    this.photos = new JsonStore(
      join(baseDir, 'photos.json'),
      () => ({ version: 1, photos: [] }),
      validatePhotos,
    )
  }

  /** Ensure all documents exist and are readable, seeding a default "me" member. */
  async init() {
    await Promise.all([
      this.members.load(),
      this.records.load(),
      this.conditions.load(),
      this.documents.load(),
      this.goals.load(),
      this.photos.load(),
    ])
    await this.ensureDefaultMember()
  }

  /**
   * Seed a default "我" (self) member when the family is empty, so the panel
   * opens onto a usable profile instead of an empty state. Sex defaults to male
   * and can be edited; risk level is low.
   */
  async ensureDefaultMember() {
    const doc = await this.members.read()
    if (doc.members.length > 0) return
    const entry = {
      id: randomUUID(),
      name: '我',
      relation: 'self',
      sex: 'male',
      birthYear: null,
      riskLevel: 'low',
      targets: {},
      note: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await this.members.update((current) => ({ ...current, members: [...current.members, entry] }))
    return entry
  }

  /** Paths the user can inspect or back up. */
  get dataPaths() {
    return {
      members: this.members.path,
      records: this.records.path,
      conditions: this.conditions.path,
      documents: this.documents.path,
      goals: this.goals.path,
      photos: this.photos.path,
      directory: this.baseDir,
    }
  }

  // ---------------------------------------------------------------- members

  /** @returns {Promise<Array<object>>} */
  async listMembers() {
    const doc = await this.members.read()
    return doc.members.slice().sort((a, b) => a.createdAt - b.createdAt)
  }

  /** Find a member by id, exact name, or unambiguous fuzzy name match. */
  async findMember(reference) {
    const members = await this.listMembers()
    if (!reference) return undefined
    const key = String(reference).trim()
    if (!key) return undefined
    const byId = members.find((member) => member.id === key)
    if (byId) return byId
    const exact = members.filter((member) => member.name === key)
    if (exact.length === 1) return exact[0]
    const fuzzy = members.filter((member) => member.name.includes(key) || key.includes(member.name))
    return fuzzy.length === 1 ? fuzzy[0] : undefined
  }

  /**
   * Create a member.
   * @param {{ name: string, relation?: Relation, sex: 'male'|'female', birthYear?: number, riskLevel?: string, targets?: Record<string, number>, note?: string }} input
   */
  async createMember(input) {
    const name = String(input?.name ?? '').trim()
    if (!name) return { ok: false, error: '成员姓名不能为空。' }
    if (input?.sex !== 'male' && input?.sex !== 'female') {
      return { ok: false, error: '性别必须填写（male 或 female），因为尿酸和 HDL 的参考区间分性别。' }
    }
    const relation = RELATIONS.some((item) => item.code === input?.relation) ? input.relation : 'other'
    const riskLevel = RISK_LEVELS.some((item) => item.code === input?.riskLevel) ? input.riskLevel : 'low'
    const birthYear = Number.isInteger(input?.birthYear) ? input.birthYear : undefined
    if (birthYear !== undefined && (birthYear < 1900 || birthYear > new Date().getFullYear())) {
      return { ok: false, error: `出生年份 ${birthYear} 不在合理范围内。` }
    }
    const targets = {}
    if (input?.targets && typeof input.targets === 'object') {
      for (const [code, value] of Object.entries(input.targets)) {
        if (!metricOf(code)) return { ok: false, error: `目标值中的指标代码 ${code} 不存在。` }
        const num = Number(value)
        if (!Number.isFinite(num)) return { ok: false, error: `目标值 ${code} 不是有效数字。` }
        targets[code] = num
      }
    }

    let created
    try {
      await this.members.update((doc) => {
        const members = doc.members
        if (members.length >= MAX_MEMBERS) {
          throw new MemberLimitError(MAX_MEMBERS)
        }
        if (members.some((member) => member.name === name)) {
          throw new DuplicateMemberError(name)
        }
        created = {
          id: randomUUID(),
          name,
          relation,
          sex: input.sex,
          birthYear: birthYear ?? null,
          riskLevel,
          targets,
          note: String(input?.note ?? ''),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        members.push(created)
        return { ...doc, members }
      })
    } catch (error) {
      if (error instanceof MemberLimitError || error instanceof DuplicateMemberError) {
        return { ok: false, error: error.message }
      }
      throw error
    }
    return { ok: true, member: created, total: (await this.listMembers()).length }
  }

  /**
   * Update an existing member. Only supplied fields change.
   */
  async updateMember(reference, patch) {
    const member = await this.findMember(reference)
    if (!member) return { ok: false, error: `找不到成员「${reference}」。` }
    if (patch?.sex !== undefined && patch.sex !== 'male' && patch.sex !== 'female') {
      return { ok: false, error: '性别必须是 male 或 female。' }
    }
    let updated
    await this.members.update((doc) => {
      const members = doc.members
      updated = { ...member }
      if (patch?.name !== undefined) {
        const name = String(patch.name).trim()
        if (!name) throw new EmptyNameError()
        if (members.some((item) => item.id !== member.id && item.name === name)) {
          throw new DuplicateMemberError(name)
        }
        updated.name = name
      }
      if (patch?.relation !== undefined) {
        updated.relation = RELATIONS.some((item) => item.code === patch.relation)
          ? patch.relation
          : updated.relation
      }
      if (patch?.sex !== undefined) updated.sex = patch.sex
      if (patch?.riskLevel !== undefined) {
        updated.riskLevel = RISK_LEVELS.some((item) => item.code === patch.riskLevel)
          ? patch.riskLevel
          : updated.riskLevel
      }
      if (patch?.birthYear !== undefined) {
        const year = Number(patch.birthYear)
        if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) {
          throw new BadYearError(year)
        }
        updated.birthYear = year
      }
      if (patch?.note !== undefined) updated.note = String(patch.note)
      if (patch?.targets !== undefined) {
        const targets = { ...updated.targets }
        for (const [code, value] of Object.entries(patch.targets ?? {})) {
          if (!metricOf(code)) throw new UnknownMetricError(code)
          if (value === null) {
            delete targets[code]
            continue
          }
          const num = Number(value)
          if (!Number.isFinite(num)) throw new BadTargetError(code)
          targets[code] = num
        }
        updated.targets = targets
      }
      updated.updatedAt = Date.now()
      return {
        ...doc,
        members: members.map((item) => (item.id === member.id ? updated : item)),
      }
    }).catch((error) => {
      if (
        error instanceof EmptyNameError ||
        error instanceof DuplicateMemberError ||
        error instanceof BadYearError ||
        error instanceof UnknownMetricError ||
        error instanceof BadTargetError
      ) {
        return { ok: false, error: error.message }
      }
      throw error
    })
    return { ok: true, member: updated }
  }

  /**
   * Delete a member and every record that belongs to them.
   * @param {string} reference
   * @param {boolean} cascade  Must be explicitly true to remove records.
   */
  async deleteMember(reference, cascade) {
    const member = await this.findMember(reference)
    if (!member) return { ok: false, error: `找不到成员「${reference}」。` }
    const recordsDoc = await this.records.read()
    const conditionsDoc = await this.conditions.read()
    const documentsDoc = await this.documents.read()
    let goalsDoc
    try {
      goalsDoc = await this.goals.read()
    } catch (error) {
      return { ok: false, error: `管理目标数据读取失败：${String(error?.message ?? error)}` }
    }
    let photosDoc
    try {
      photosDoc = await this.photos.read()
    } catch (error) {
      return { ok: false, error: `身材照片数据读取失败：${String(error?.message ?? error)}` }
    }
    const owned = recordsDoc.records.filter((record) => record.memberId === member.id).length
    const ownedConditions = conditionsDoc.conditions.filter((item) => item.memberId === member.id).length
    const ownedDocuments = documentsDoc.documents.filter((item) => item.memberId === member.id).length
    const ownedGoals = goalsDoc.goals.filter((item) => item.memberId === member.id).length
    const ownedPhotos = photosDoc.photos.filter((item) => item.memberId === member.id).length
    const ownedTotal = owned + ownedConditions + ownedDocuments + ownedGoals + ownedPhotos
    if (ownedTotal > 0 && cascade !== true) {
      const parts = []
      if (owned > 0) parts.push(`${owned} 条测量记录`)
      if (ownedConditions > 0) parts.push(`${ownedConditions} 个疾病标签`)
      if (ownedDocuments > 0) parts.push(`${ownedDocuments} 份档案`)
      if (ownedGoals > 0) parts.push(`${ownedGoals} 个管理目标`)
      if (ownedPhotos > 0) parts.push(`${ownedPhotos} 张身材照片`)
      return {
        ok: false,
        error: `成员「${member.name}」还有 ${parts.join('、')}。删除成员会一并删除这些数据，需要显式确认（cascade=true）。`,
      }
    }
    // Delete dependent documents first and the member last: if a later write
    // fails, the member still exists and the operation can be retried instead of
    // leaving orphaned records behind a deleted member.
    if (ownedPhotos > 0) {
      await this.photos.update((doc) => ({
        ...doc,
        photos: doc.photos.filter((item) => item.memberId !== member.id),
      }))
      await fs.rm(join(this.baseDir, 'photos', photoSegment(member.id)), { recursive: true, force: true }).catch(() => {})
    }
    if (ownedGoals > 0) {
      await this.goals.update((doc) => ({
        ...doc,
        goals: doc.goals.filter((item) => item.memberId !== member.id),
      }))
    }
    if (ownedDocuments > 0) {
      await this.documents.update((doc) => ({
        ...doc,
        documents: doc.documents.filter((item) => item.memberId !== member.id),
      }))
    }
    if (ownedConditions > 0) {
      await this.conditions.update((doc) => ({
        ...doc,
        conditions: doc.conditions.filter((item) => item.memberId !== member.id),
      }))
    }
    if (owned > 0) {
      await this.records.update((doc) => ({
        ...doc,
        records: doc.records.filter((record) => record.memberId !== member.id),
      }))
    }
    await this.members.update((doc) => ({
      ...doc,
      members: doc.members.filter((item) => item.id !== member.id),
    }))
    return {
      ok: true,
      deleted: member.name,
      removedRecords: owned,
      removedConditions: ownedConditions,
      removedDocuments: ownedDocuments,
      removedGoals: ownedGoals,
      removedPhotos: ownedPhotos,
    }
  }

  // ------------------------------------------------------------- conditions

  /** List a member's condition tags (newest first). */
  async listConditions(reference) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const doc = await this.conditions.read()
    const items = doc.conditions
      .filter((item) => item.memberId === member.id)
      .sort((a, b) => b.createdAt - a.createdAt)
    return { ok: true, member: member.name, total: items.length, conditions: items }
  }

  /**
   * Add a condition tag. The caller must state the source explicitly:
   * - 'report'     — transcribed from a doctor's written diagnosis;
   * - 'manual'     — the user added it themselves;
   * - 'recognized' — a metric candidate the user confirmed.
   */
  async addCondition(reference, { code, source = 'manual', note = '' } = {}) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const condition = conditionOf(code)
    if (!condition) {
      return { ok: false, error: `未知疾病代码「${code}」。可用：${conditionCodes().join(', ')}` }
    }
    if (!['report', 'manual', 'recognized'].includes(source)) {
      return { ok: false, error: '来源必须为 report、manual 或 recognized。' }
    }
    const doc = await this.conditions.read()
    const exists = doc.conditions.some((item) => item.memberId === member.id && item.code === code)
    if (exists) {
      return { ok: false, error: `成员「${member.name}」已有「${condition.name}」标签，无需重复添加。` }
    }
    const entry = {
      id: randomUUID(),
      memberId: member.id,
      memberName: member.name,
      code,
      name: condition.name,
      source,
      note: String(note ?? ''),
      createdAt: Date.now(),
    }
    await this.conditions.update((current) => ({
      ...current,
      conditions: [...current.conditions, entry],
    }))
    return { ok: true, condition: entry }
  }

  /** Remove a condition tag by its id or by (member, code). */
  async removeCondition(reference, codeOrId) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const doc = await this.conditions.read()
    const target = doc.conditions.find((item) => {
      if (item.memberId !== member.id) return false
      return item.id === codeOrId || item.code === codeOrId
    })
    if (!target) return { ok: false, error: `找不到该疾病标签「${codeOrId}」。` }
    await this.conditions.update((current) => ({
      ...current,
      conditions: current.conditions.filter((item) => item.id !== target.id),
    }))
    return { ok: true, removed: target.name }
  }

  /**
   * Suggest candidate conditions from the member's latest values. Suggestions
   * are hints only — nothing is persisted; the caller confirms via addCondition.
   */
  async suggestConditionsForMember(reference) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const doc = await this.records.read()
    const latestByMetric = {}
    const owned = doc.records
      .filter((record) => record.memberId === member.id)
      .sort((a, b) => (a.measuredAt < b.measuredAt ? 1 : -1))
    for (const record of owned) {
      for (const [code, value] of Object.entries(record.values)) {
        if (latestByMetric[code] === undefined) latestByMetric[code] = { value, measuredAt: record.measuredAt }
      }
    }
    const existing = (await this.conditions.read()).conditions
      .filter((item) => item.memberId === member.id)
      .map((item) => item.code)
    const suggestions = suggestConditions(latestByMetric, member)
      .filter((item) => !existing.includes(item.code))
    return {
      ok: true,
      member: member.name,
      disclaimer: '以下仅为基于录入数值的候选提示，不构成诊断；是否患有相关疾病以医生诊断为准。',
      total: suggestions.length,
      suggestions,
    }
  }

  /** Per-condition target vs current gap for the panel's management view. */
  async conditionTargets(reference) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const recordsDoc = await this.records.read()
    const owned = recordsDoc.records.filter((record) => record.memberId === member.id)
    const latestByMetric = this.latestByMetric(owned)
    const conditionsDoc = await this.conditions.read()
    const memberConditions = conditionsDoc.conditions.filter((item) => item.memberId === member.id)
    return {
      ok: true,
      member: member.name,
      disclaimer: '目标值遵循指南推荐并可由医生个体化调整；达标与否不构成诊断。',
      conditions: this.buildConditionTargets(member, memberConditions, latestByMetric),
    }
  }

  /** Latest value per metric across a member's records. */
  latestByMetric(owned) {
    const sorted = owned.slice().sort((a, b) => (a.measuredAt < b.measuredAt ? 1 : -1))
    const latestByMetric = {}
    for (const record of sorted) {
      for (const [code, value] of Object.entries(record.values)) {
        if (latestByMetric[code] === undefined) {
          latestByMetric[code] = { value, measuredAt: record.measuredAt }
        }
      }
    }
    return latestByMetric
  }

  /**
   * Build target-vs-current rows for a member's condition tags. Pure with
   * respect to the member and their latest values; shared by the tool and panel.
   */
  buildConditionTargets(member, conditionTags, latestByMetric) {
    return conditionTags.map((tag) => {
      const condition = conditionOf(tag.code)
      if (!condition) return null
      const targets = resolveTargets(condition, member).map((target) => {
        // Risk-stratified metrics (LDL-C) follow resolveBand's precedence
        // (personal override > risk tier > sex > general) instead of the static
        // catalog value, unless the member already has a personal override.
        const metric = metricOf(target.metric)
        if (metric?.byRisk && !(member.targets && typeof member.targets[target.metric] === 'number')) {
          const { band } = resolveBand(metric, member)
          return { ...target, low: band.low, high: band.high, note: band.label }
        }
        return target
      }).map((target) => {
        const latest = latestByMetric[target.metric]
        const current = latest ? latest.value : undefined
        const metric = metricOf(target.metric)
        let status = 'unknown'
        if (current !== undefined) {
          if (target.kind === 'range') {
            if (typeof target.low === 'number' && current < target.low) status = 'low'
            else if (
              typeof target.high === 'number' &&
              (typeof target.low === 'number' ? current > target.high : current >= target.high)
            ) {
              status = 'high'
            } else status = 'normal'
          } else if (typeof target.high === 'number') {
            // Rendered as "目标 <X", so X itself is above the target.
            status = current >= target.high ? 'high' : 'normal'
          }
        }
        return {
          metric: target.metric,
          name: metric?.name ?? target.metric,
          unit: metric?.unit ?? '',
          kind: target.kind,
          low: typeof target.low === 'number' ? target.low : null,
          high: typeof target.high === 'number' ? target.high : null,
          note: target.note,
          current: current ?? null,
          currentDisplay: current !== undefined ? formatValue(metric, current) : null,
          measuredAt: latest?.measuredAt ?? null,
          status,
        }
      })
      return { code: tag.code, name: tag.name, source: tag.source, targets }
    }).filter(Boolean)
  }

  // ------------------------------------------------------------- goals
  //
  // A management goal is an intent, not a diagnosis. It decides which metrics a
  // member's dashboard shows, which targets apply and which tracking dimensions
  // matter (diet / training / body composition). The stored document only holds
  // the binding (member + template + personal targets); progress is always
  // computed from the current records so the two can never drift apart.

  /** Goal catalog (templates) for tools and the panel. */
  goalTemplates() {
    return {
      ok: true,
      total: GOALS.length,
      disclaimer: GOAL_DISCLAIMER,
      templates: GOALS.map(describeGoalTemplate),
    }
  }

  /** Stored goal bindings for one member, oldest first. */
  async memberGoalBindings(member) {
    const doc = await this.goals.read()
    return doc.goals
      .filter((item) => item.memberId === member.id)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /** Full goal dashboard for one member (shared by tools and the panel). */
  async buildGoalsForMember(member) {
    const bindings = await this.memberGoalBindings(member)
    if (bindings.length === 0) return []
    const recordsDoc = await this.records.read()
    const owned = recordsDoc.records.filter((record) => record.memberId === member.id)
    const latestByMetric = this.latestByMetric(owned)
    // Progress photos are evidence for the lean-muscle season. A corrupt photo
    // document must not take goal progress down with it.
    let photoDates = []
    try {
      const photosDoc = await this.photos.read()
      photoDates = photosDoc.photos
        .filter((item) => item.memberId === member.id && (item.kind ?? 'progress') === 'progress')
        .map((item) => ({ takenAt: item.takenAt }))
    } catch {
      photoDates = []
    }
    return bindings
      .map((binding) => {
        const template = goalOf(binding.code)
        return template
          ? buildGoalProgress(binding, template, member, owned, latestByMetric, undefined, photoDates)
          : null
      })
      .filter(Boolean)
  }

  /** List a member's goals without the full dashboard payload. */
  async listGoals(reference) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    let goals
    try {
      goals = await this.buildGoalsForMember(member)
    } catch (error) {
      return { ok: false, member: member.name, error: `管理目标数据读取失败：${String(error?.message ?? error)}` }
    }
    return {
      ok: true,
      member: member.name,
      total: goals.length,
      goals: goals.map((goal) => ({
        id: goal.id,
        code: goal.code,
        name: goal.name,
        shortName: goal.shortName,
        domain: goal.domain,
        domainName: goal.domainName,
        status: goal.status,
        statusName: goal.statusName,
        source: goal.source,
        sourceName: goal.sourceName,
        startedAt: goal.startedAt,
        coverage: goal.coverage,
        targets: goal.targets.length,
      })),
      templates: GOALS.map(describeGoalTemplate),
      disclaimer: GOAL_DISCLAIMER,
    }
  }

  /**
   * Activate or update a management goal for a member. Creates the binding on
   * first use; later calls update status/source/note and merge personal targets.
   * `targets[metric] = null` removes one personal target.
   */
  async setGoal(reference, { code, status, source, targets = {}, note } = {}) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const goal = goalOf(code)
    if (!goal) {
      return { ok: false, error: `未知管理目标「${code}」。可用：${goalCodes().join(', ')}` }
    }
    let existingBinding
    try {
      existingBinding = (await this.goals.read()).goals.find(
        (item) => item.memberId === member.id && item.code === code,
      )
    } catch (error) {
      return { ok: false, error: `管理目标数据读取失败：${String(error?.message ?? error)}` }
    }
    // Partial updates keep the current status/source; a first activation defaults
    // to active/manual instead of resetting an existing goal.
    const nextStatus = status ?? existingBinding?.status ?? 'active'
    const nextSource = source ?? existingBinding?.source ?? 'manual'
    if (!GOAL_STATUSES.some((item) => item.code === nextStatus)) {
      return { ok: false, error: `目标状态「${nextStatus}」无效，可用：${GOAL_STATUSES.map((item) => item.code).join(', ')}` }
    }
    if (!GOAL_SOURCES.some((item) => item.code === nextSource)) {
      return { ok: false, error: `目标来源「${nextSource}」无效，可用：${GOAL_SOURCES.map((item) => item.code).join(', ')}` }
    }
    // Only metrics with a real target row accept a personal value: dimension-only
    // metrics (e.g. waist under lean-muscle) and trend-only rows have no target
    // semantics, and accepting them would silently store an ignored number.
    const targetSpecs = new Map(goal.targets.map((spec) => [spec.metric, spec]))
    const cleanTargets = {}
    for (const [metricCode, raw] of Object.entries(targets ?? {})) {
      const spec = targetSpecs.get(metricCode)
      if (!spec) {
        return {
          ok: false,
          error: `目标「${goal.name}」没有指标「${metricCode}」的目标值。可用：${[...targetSpecs.keys()].join(', ')}`,
        }
      }
      if (raw === null) continue
      if (spec.kind === 'trend') {
        return { ok: false, error: `目标「${goal.name}」对「${spec.metric}」只观察趋势，不能设置个人目标值。` }
      }
      if (spec.kind === 'observe') {
        return {
          ok: false,
          error: `目标「${goal.name}」对「${spec.metric}」只观察趋势与参考区间，不设达标目标值。`,
        }
      }
      const metric = metricOf(metricCode)
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        return { ok: false, error: `个人目标值「${metricCode}」不是有效数字。` }
      }
      if (typeof metric.min === 'number' && value < metric.min) {
        return { ok: false, error: `个人目标值 ${metricCode}=${value} 低于合理下限 ${metric.min} ${metric.unit}。` }
      }
      if (typeof metric.max === 'number' && value > metric.max) {
        return { ok: false, error: `个人目标值 ${metricCode}=${value} 高于合理上限 ${metric.max} ${metric.unit}。` }
      }
      cleanTargets[metricCode] = value
    }

    let entry
    let created = false
    await this.goals.update((doc) => {
      const existing = doc.goals.find((item) => item.memberId === member.id && item.code === code)
      if (existing) {
        const merged = { ...existing.targets }
        for (const [metricCode, value] of Object.entries(cleanTargets)) merged[metricCode] = value
        for (const [metricCode, raw] of Object.entries(targets ?? {})) {
          if (raw === null) delete merged[metricCode]
        }
        entry = {
          ...existing,
          status: nextStatus,
          source: nextSource,
          targets: merged,
          note: note === undefined ? existing.note : String(note),
          updatedAt: Date.now(),
        }
        return { ...doc, goals: doc.goals.map((item) => (item.id === existing.id ? entry : item)) }
      }
      created = true
      entry = {
        id: randomUUID(),
        memberId: member.id,
        memberName: member.name,
        code,
        status: nextStatus,
        source: nextSource,
        targets: cleanTargets,
        note: String(note ?? ''),
        startedAt: Date.now(),
        // A season-bound goal starts its first season immediately. Goals
        // without a season (metabolic) simply ignore these fields.
        seasonNo: goal.season ? 1 : undefined,
        seasonStartedAt: goal.season ? Date.now() : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      return { ...doc, goals: [...doc.goals, entry] }
    })

    const progress = (await this.buildGoalsForMember(member)).find((item) => item.code === code)
    return {
      ok: true,
      created,
      member: member.name,
      goal: progress,
      summary: `${member.name} · ${goal.name}（${statusName(nextStatus)}，来源：${sourceName(nextSource)}）`,
    }
  }

  /** Remove a member's management goal by template code or binding id. */
  async removeGoal(reference, codeOrId) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    let doc
    try {
      doc = await this.goals.read()
    } catch (error) {
      return { ok: false, error: `管理目标数据读取失败：${String(error?.message ?? error)}` }
    }
    const target = doc.goals.find(
      (item) => item.memberId === member.id && (item.code === codeOrId || item.id === codeOrId),
    )
    if (!target) {
      return { ok: false, error: `成员「${member.name}」没有管理目标「${codeOrId}」。` }
    }
    await this.goals.update((current) => ({
      ...current,
      goals: current.goals.filter((item) => item.id !== target.id),
    }))
    return { ok: true, removed: target.code, name: goalOf(target.code)?.name ?? target.code }
  }

  /** Full goal dashboard for one member: targets, coverage and tracking. */
  async goalOverview(reference) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    let goals
    try {
      goals = await this.buildGoalsForMember(member)
    } catch (error) {
      return { ok: false, member: member.name, error: `管理目标数据读取失败：${String(error?.message ?? error)}` }
    }
    return {
      ok: true,
      member: member.name,
      total: goals.length,
      goals,
      templates: GOALS.map(describeGoalTemplate),
      catalogs: {
        statuses: GOAL_STATUSES,
        sources: GOAL_SOURCES,
        domains: GOAL_DOMAINS,
      },
      goalCatalog: {
        statuses: GOAL_STATUSES,
        sources: GOAL_SOURCES,
        domains: GOAL_DOMAINS,
      },
      disclaimer: GOAL_DISCLAIMER,
    }
  }

  /**
   * Start a fresh season for a season-bound goal. Historical records and photos
   * are never deleted; only the season window moves.
   */
  async startGoalSeason(reference, code = 'lean_muscle') {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const goal = goalOf(code)
    if (!goal) {
      return { ok: false, error: `未知管理目标「${code}」。可用：${goalCodes().join(', ')}` }
    }
    if (!goal.season) {
      return { ok: false, error: `目标「${goal.name}」不是赛季制，不能开启新赛季。` }
    }
    let doc
    try {
      doc = await this.goals.read()
    } catch (error) {
      return { ok: false, error: `管理目标数据读取失败：${String(error?.message ?? error)}` }
    }
    const binding = doc.goals.find((item) => item.memberId === member.id && item.code === code)
    if (!binding) {
      return { ok: false, error: `成员「${member.name}」还没有「${goal.name}」目标，请先设定目标。` }
    }
    const nextNo = (Number.isFinite(binding.seasonNo) ? binding.seasonNo : 1) + 1
    const now = Date.now()
    await this.goals.update((current) => ({
      ...current,
      goals: current.goals.map((item) =>
        item.id === binding.id
          ? { ...item, seasonNo: nextNo, seasonStartedAt: now, updatedAt: now }
          : item,
      ),
    }))
    const progress = (await this.buildGoalsForMember(member)).find((item) => item.code === code)
    return {
      ok: true,
      member: member.name,
      code,
      seasonNo: nextNo,
      goal: progress,
      summary: `${member.name} · ${goal.name} 已开启第 ${nextNo} 赛季`,
    }
  }

  /** Compact season/weekly statement for the agent (descriptive only). */
  async goalReview(reference, { code } = {}) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    let goals
    try {
      goals = await this.buildGoalsForMember(member)
    } catch (error) {
      return { ok: false, member: member.name, error: `管理目标数据读取失败：${String(error?.message ?? error)}` }
    }
    const goal = code
      ? goals.find((item) => item.code === code)
      : goals.find((item) => item.code === 'lean_muscle') ?? goals[0]
    if (!goal) {
      return { ok: false, member: member.name, error: '该成员还没有可复盘的管理目标。' }
    }
    return {
      ok: true,
      member: member.name,
      code: goal.code,
      name: goal.name,
      season: goal.season,
      weekly: goal.weekly,
      seasonReview: goal.seasonReview,
      accounts: goal.accounts,
      body: (goal.targets ?? []).filter((target) => target.kind === 'observe'),
      coverage: goal.coverage,
      notes: goal.notes,
      disclaimer: goal.disclaimer,
    }
  }

  // ------------------------------------------------------------- progress photos

  /** Metadata for the panel; never expose the absolute file path. */
  photoView(photo) {
    return {
      id: photo.id,
      memberId: photo.memberId,
      kind: photo.kind ?? 'progress',
      takenAt: photo.takenAt,
      note: photo.note ?? '',
      fileName: photo.fileName ?? null,
      size: photo.size ?? null,
      mime: photo.mime ?? 'image/jpeg',
      createdAt: photo.createdAt,
    }
  }

  /** List a member's progress photos (newest first). */
  async listPhotos(reference, { limit = 60 } = {}) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    let doc
    try {
      doc = await this.photos.read()
    } catch (error) {
      return { ok: false, error: `身材照片数据读取失败：${String(error?.message ?? error)}` }
    }
    const photos = doc.photos
      .filter((item) => item.memberId === member.id)
      .sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : b.createdAt - a.createdAt))
    return {
      ok: true,
      member: member.name,
      total: photos.length,
      photos: photos.slice(0, Math.max(1, Math.min(Number(limit) || 60, 200))).map((item) => this.photoView(item)),
    }
  }

  /**
   * Store one progress photo. The panel compresses the image and sends a data
   * URL; the bytes are validated by magic number, written under the member's own
   * photo directory, and only metadata is kept in photos.json.
   */
  async uploadPhoto(reference, { dataBase64, takenAt, note = '', fileName = null, kind = 'progress' } = {}) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    if (kind !== 'progress' && kind !== 'inspiration') {
      return { ok: false, error: '照片类型必须是 progress（身材照）或 inspiration（激励图）。' }
    }
    if (typeof dataBase64 !== 'string' || dataBase64.trim() === '') {
      return { ok: false, error: '缺少照片数据。' }
    }
    const raw = dataBase64.includes(',') ? dataBase64.slice(dataBase64.indexOf(',') + 1) : dataBase64
    let buffer
    try {
      buffer = Buffer.from(raw, 'base64')
    } catch {
      return { ok: false, error: '照片数据解码失败。' }
    }
    if (buffer.length === 0) return { ok: false, error: '照片内容为空。' }
    if (buffer.length > PHOTO_MAX_BYTES) {
      return { ok: false, error: `照片过大（${Math.round(buffer.length / 1024 / 1024)} MB），请压缩到 12 MB 以内。` }
    }
    const mime = detectImageMime(buffer)
    if (!mime) return { ok: false, error: '只支持 JPEG / PNG / WebP 图片。' }
    const taken = takenAt ? normalizeTimestamp(takenAt) : normalizeTimestamp(undefined)
    if (!taken) {
      return { ok: false, error: `照片日期「${takenAt}」无法识别，请使用 YYYY-MM-DD 或 YYYY-MM-DD HH:mm。` }
    }
    const takenDay = taken.slice(0, 10)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const latestDay = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
    if (takenDay < '1900-01-01' || takenDay > latestDay) {
      return { ok: false, error: `照片日期「${takenDay}」不在合理范围内。` }
    }
    const dir = join(this.baseDir, 'photos', photoSegment(member.id))
    const ext = PHOTO_MIME[mime]
    const filePath = join(dir, `${takenDay}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, buffer)
    const entry = {
      id: randomUUID(),
      memberId: member.id,
      memberName: member.name,
      kind,
      takenAt: taken,
      note: String(note ?? ''),
      filePath,
      fileName: sanitizeFileName(fileName) ?? null,
      size: buffer.length,
      mime,
      createdAt: Date.now(),
    }
    try {
      await this.photos.update((doc) => ({ ...doc, photos: [...doc.photos, entry] }))
    } catch (error) {
      // Never leave a photo file behind when the metadata write fails.
      await fs.rm(filePath, { force: true }).catch(() => {})
      throw error
    }
    return { ok: true, photo: this.photoView(entry) }
  }

  /** Remove one progress photo and its file. */
  async removePhoto(reference, id) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    let doc
    try {
      doc = await this.photos.read()
    } catch (error) {
      return { ok: false, error: `身材照片数据读取失败：${String(error?.message ?? error)}` }
    }
    const target = doc.photos.find((item) => item.memberId === member.id && item.id === id)
    if (!target) return { ok: false, error: '找不到这张照片。' }
    await this.photos.update((current) => ({
      ...current,
      photos: current.photos.filter((item) => item.id !== target.id),
    }))
    // Delete only a file that really lives under the photos root, even if the
    // metadata was hand-edited to point elsewhere.
    const root = resolve(this.baseDir, 'photos')
    const candidate = resolve(target.filePath)
    if (candidate.startsWith(root + sep)) {
      try {
        const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(candidate)])
        if (realFile.startsWith(realRoot + sep)) await fs.rm(realFile, { force: true })
      } catch {
        // File already gone or unreadable; metadata removal is what matters.
      }
    }
    return { ok: true, removed: target.id }
  }

  /** Read one photo's bytes for the panel image route, with path containment. */
  async photoFile(id) {
    let doc
    try {
      doc = await this.photos.read()
    } catch {
      return null
    }
    const photo = doc.photos.find((item) => item.id === id)
    if (!photo) return null
    const root = resolve(this.baseDir, 'photos')
    const candidate = resolve(photo.filePath)
    if (!candidate.startsWith(root + sep)) return null
    let realRoot
    let realFile
    try {
      ;[realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(candidate)])
    } catch {
      return null
    }
    if (!realFile.startsWith(realRoot + sep)) return null
    try {
      const buffer = await fs.readFile(realFile)
      return { buffer, mime: photo.mime ?? 'image/jpeg', fileName: photo.fileName ?? null }
    } catch {
      return null
    }
  }

  // ------------------------------------------------------------- documents

  /** List a member's health documents (newest first). */
  async listDocuments(reference, { type } = {}) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const doc = await this.documents.read()
    let items = doc.documents.filter((item) => item.memberId === member.id)
    if (type) items = items.filter((item) => item.type === type)
    items = items.sort((a, b) => b.docDate - a.docDate)
    return { ok: true, member: member.name, total: items.length, documents: items }
  }

  /**
   * Register a health document's metadata. The file itself is stored under the
   * documents directory by the caller (panel or agent) before this call, and
   * `filePath` records where it landed.
   */
  async addDocument(reference, {
    type = 'other',
    title = '',
    docDate,
    note = '',
    filePath = null,
    fileName = null,
    size = null,
  } = {}) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    if (!DOCUMENT_TYPES.some((item) => item.code === type)) {
      return { ok: false, error: `未知档案类型「${type}」。可用：${DOCUMENT_TYPES.map((item) => item.code).join(', ')}` }
    }
    const dateIso = docDate ? normalizeRangeEnd(docDate) : normalizeTimestamp(undefined)
    if (!dateIso) {
      return { ok: false, error: `档案日期「${docDate}」无法识别。` }
    }
    const entry = {
      id: randomUUID(),
      memberId: member.id,
      memberName: member.name,
      type,
      title: String(title ?? '').trim() || (DOCUMENT_TYPES.find((item) => item.code === type)?.name ?? '档案'),
      docDate: dateIso.slice(0, 10),
      note: String(note ?? ''),
      filePath,
      fileName,
      size: typeof size === 'number' ? size : null,
      createdAt: Date.now(),
    }
    await this.documents.update((current) => ({
      ...current,
      documents: [...current.documents, entry],
    }))
    return { ok: true, document: entry }
  }

  /** Remove a document's metadata by id. */
  async removeDocument(reference, id) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const doc = await this.documents.read()
    const target = doc.documents.find((item) => item.memberId === member.id && item.id === id)
    if (!target) return { ok: false, error: `找不到该档案「${id}」。` }
    await this.documents.update((current) => ({
      ...current,
      documents: current.documents.filter((item) => item.id !== id),
    }))
    return { ok: true, removed: target.title }
  }

  /**
   * Store an uploaded document file and register its metadata. `dataBase64`
   * holds the raw file bytes; it is decoded to the documents directory under a
   * unique name, then the metadata row records that path. File extraction
   * (diagnosis, key metrics) is a model task that runs in conversation, not here.
   */
  async uploadDocument(reference, {
    type = 'other',
    title = '',
    docDate,
    note = '',
    fileName = null,
    dataBase64 = null,
  } = {}) {
    const resolved = await this.resolveMember(reference)
    if (!resolved.ok) return resolved
    const member = resolved.member
    if (!DOCUMENT_TYPES.some((item) => item.code === type)) {
      return { ok: false, error: `未知档案类型「${type}」。可用：${DOCUMENT_TYPES.map((item) => item.code).join(', ')}` }
    }
    let storedPath = null
    let storedName = null
    let storedSize = null
    if (typeof dataBase64 === 'string' && dataBase64.length > 0) {
      const clean = dataBase64.includes(',') ? dataBase64.slice(dataBase64.indexOf(',') + 1) : dataBase64
      let buffer
      try {
        buffer = Buffer.from(clean, 'base64')
      } catch {
        return { ok: false, error: '文件数据解码失败。' }
      }
      const safeName = sanitizeFileName(fileName) || `upload-${Date.now()}`
      const docDir = join(this.baseDir, 'documents')
      const target = join(docDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`)
      await fs.mkdir(docDir, { recursive: true })
      await fs.writeFile(target, buffer)
      storedPath = target
      storedName = safeName
      storedSize = buffer.length
    }
    const added = await this.addDocument(member.name, {
      type,
      title,
      docDate,
      note,
      filePath: storedPath,
      fileName: storedName,
      size: storedSize,
    })
    return added
  }

  // ---------------------------------------------------------------- records

  /**
   * Resolve which member a record belongs to.
   * Returns an `ask` result when the choice is ambiguous — the caller must not
   * guess, because attributing a reading to the wrong family member is worse
   * than not saving it.
   */
  async resolveMember(reference) {
    const members = await this.listMembers()
    if (members.length === 0) {
      return {
        ok: false,
        needsMember: true,
        error: '还没有任何成员。请先添加家庭成员（姓名、性别）。',
      }
    }
    if (reference) {
      const found = await this.findMember(reference)
      if (found) return { ok: true, member: found }
      return {
        ok: false,
        needsMember: true,
        error: `找不到成员「${reference}」。现有成员：${members.map((m) => m.name).join('、')}`,
        members: members.map((m) => m.name),
      }
    }
    if (members.length === 1) return { ok: true, member: members[0] }
    return {
      ok: false,
      needsMember: true,
      error: `家里有 ${members.length} 位成员，请指明这条记录是给谁的：${members.map((m) => m.name).join('、')}`,
      members: members.map((m) => m.name),
    }
  }

  /**
   * Record one measurement.
   * @param {{ member?: string, measuredAt?: string, context?: string, values: Record<string, number>, note?: string, source?: string }} input
   */
  async record(input) {
    const resolved = await this.resolveMember(input?.member)
    if (!resolved.ok) return resolved
    const member = resolved.member

    if (!input?.values || typeof input.values !== 'object') {
      return { ok: false, error: '缺少测量数值（values）。' }
    }
    const { values, rejected } = normalizeValues(input.values)
    if (Object.keys(values).length === 0) {
      return {
        ok: false,
        error: `没有可用的测量数值。${rejected.map((item) => `${item.code}: ${item.reason}`).join('；')}`,
      }
    }

    const measuredAt = normalizeTimestamp(input.measuredAt)
    if (!measuredAt) {
      return {
        ok: false,
        error: `测量时间「${input.measuredAt}」无法识别，请使用 YYYY-MM-DD HH:mm 格式。`,
      }
    }
    const context = CONTEXTS.some((item) => item.code === input.context) ? input.context : 'random'

    const entry = {
      id: randomUUID(),
      memberId: member.id,
      memberName: member.name,
      measuredAt,
      context,
      values,
      source: ['text', 'image', 'form'].includes(input.source) ? input.source : 'text',
      note: String(input.note ?? ''),
      createdAt: Date.now(),
    }
    await this.records.update((doc) => ({ ...doc, records: [...doc.records, entry] }))

    const parts = Object.entries(values).map(([code, value]) => {
      const metric = metricOf(code)
      return `${metric.name} ${formatValue(metric, value)} ${metric.unit}`
    })
    const warnings = rejected.map((item) => `「${item.code}」未记录：${item.reason}`)
    return {
      ok: true,
      record: entry,
      summary: `${member.name} · ${measuredAt}（${contextName(context)}）已记录：${parts.join('，')}`,
      warnings,
    }
  }

  /**
   * Query records.
   * @param {{ member?: string, from?: string, to?: string, metrics?: string[], limit?: number }} query
   */
  async query(query = {}) {
    let memberId
    if (query.member) {
      const member = await this.findMember(query.member)
      if (!member) return { ok: false, error: `找不到成员「${query.member}」。` }
      memberId = member.id
    }
    const from = query.from ? normalizeTimestamp(query.from) : undefined
    const to = query.to ? normalizeRangeEnd(query.to) : undefined
    const wanted = Array.isArray(query.metrics) && query.metrics.length > 0 ? new Set(query.metrics) : undefined
    const doc = await this.records.read()
    let rows = doc.records.filter((record) => {
      if (memberId && record.memberId !== memberId) return false
      if (from && record.measuredAt < from) return false
      if (to && record.measuredAt > to) return false
      if (wanted && !Object.keys(record.values).some((code) => wanted.has(code))) return false
      return true
    })
    rows = rows.sort((a, b) => (a.measuredAt < b.measuredAt ? 1 : a.measuredAt > b.measuredAt ? -1 : 0))
    const total = rows.length
    const limit = Number.isInteger(query.limit) && query.limit > 0 ? Math.min(query.limit, 500) : 50
    return { ok: true, total, records: rows.slice(0, limit) }
  }

  /**
   * Descriptive statistics for one member and one metric. Numbers only — this
   * method deliberately produces no prose and no advice, so interpretation
   * cannot smuggle conclusions past the safety boundary.
   */
  async stats({ member: memberRef, metric: code, from, to } = {}) {
    const resolved = await this.resolveMember(memberRef)
    if (!resolved.ok) return resolved
    const member = resolved.member
    const metric = metricOf(code)
    if (!metric) {
      return { ok: false, error: `未知指标「${code}」。可用：${metricCodes().join(', ')}` }
    }
    const fromIso = from ? normalizeTimestamp(from) : undefined
    const toIso = to ? normalizeRangeEnd(to) : undefined
    const doc = await this.records.read()
    const samples = doc.records
      .filter((record) => record.memberId === member.id)
      .filter((record) => typeof record.values[code] === 'number')
      .filter((record) => !fromIso || record.measuredAt >= fromIso)
      .filter((record) => !toIso || record.measuredAt <= toIso)
      .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1))
      .map((record) => ({ measuredAt: record.measuredAt, context: record.context, value: record.values[code] }))

    const { band, source } = resolveBand(metric, member)
    if (samples.length === 0) {
      return {
        ok: true,
        member: member.name,
        metric: { code, name: metric.name, unit: metric.unit },
        band,
        bandSource: source,
        sampleCount: 0,
        note: '该时间范围内没有数据。',
      }
    }

    const nums = samples.map((sample) => sample.value)
    const sum = nums.reduce((acc, value) => acc + value, 0)
    const mean = sum / nums.length
    const sorted = nums.slice().sort((a, b) => a - b)
    // A metric without a general bound (weight, muscle mass, protein, training)
    // has no "within band" rate at all — report null instead of a misleading 0%.
    const hasBandBounds = typeof band.low === 'number' || typeof band.high === 'number'
    const withinBand = hasBandBounds
      ? samples.filter((sample) => evaluate(metric, sample.value, member).status === 'normal').length
      : null

    return {
      ok: true,
      member: member.name,
      metric: { code, name: metric.name, unit: metric.unit, decimals: metric.decimals },
      band,
      bandSource: source, // 'override' | 'risk' | 'sex' | 'general'
      sampleCount: samples.length,
      first: samples[0],
      last: samples[samples.length - 1],
      mean: round(mean, metric.decimals),
      median: round(percentile(sorted, 0.5), metric.decimals),
      min: Math.min(...nums),
      max: Math.max(...nums),
      p90: round(percentile(sorted, 0.9), metric.decimals),
      withinBandCount: withinBand,
      withinBandRate: withinBand === null ? null : round(withinBand / samples.length, 3),
      trendSlopePerDay: round(slopePerDay(samples), 4),
      series: samples,
    }
  }

  /** Metrics plus the band that applies to one member. */
  async metricCatalog(memberRef) {
    let member = {}
    if (memberRef) {
      const resolved = await this.resolveMember(memberRef)
      if (!resolved.ok) return resolved
      member = resolved.member
    } else {
      const members = await this.listMembers()
      if (members.length === 1) member = members[0]
      else if (members.length > 1) {
        return {
          ok: false,
          needsMember: true,
          error: `家里有 ${members.length} 位成员，请指明要查看谁的参考区间：${members.map((m) => m.name).join('、')}`,
          members: members.map((m) => m.name),
        }
      }
    }
    return {
      ok: true,
      member: member.name ?? null,
      disclaimer: DISCLAIMER,
      metrics: METRICS.map((metric) => {
        const { band, source } = resolveBand(metric, member)
        return {
          code: metric.code,
          name: metric.name,
          unit: metric.unit,
          category: metric.category,
          targetMode: metric.targetMode,
          bandLow: typeof band.low === 'number' ? band.low : null,
          bandHigh: typeof band.high === 'number' ? band.high : null,
          bandLabel: band.label,
          bandSource: source,
          hint: metric.hint ?? null,
        }
      }),
    }
  }

  /** Everything the Web panel needs in one read. */
  async overview(memberRef) {
    const members = await this.listMembers()
    const recordsDoc = await this.records.read()
    const conditionsDoc = await this.conditions.read()
    const documentsDoc = await this.documents.read()
    const catalogs = HealthService.catalogs()

    let member = null
    if (memberRef) {
      member = await this.findMember(memberRef)
    } else if (members.length > 0) {
      member = members[0]
    }
    if (!member) {
      return {
        ok: true,
        members: [],
        member: null,
        conditions: [],
        conditionTargets: [],
        suggestions: [],
        documents: [],
        goals: [],
        goalTemplates: GOALS.map(describeGoalTemplate),
        goalCatalog: { statuses: GOAL_STATUSES, sources: GOAL_SOURCES, domains: GOAL_DOMAINS },
        photos: [],
        latest: [],
        recent: [],
        series: {},
        recordsByMetric: {},
        catalogs,
        disclaimer: DISCLAIMER,
      }
    }

    const owned = recordsDoc.records.filter((record) => record.memberId === member.id)
    const sorted = owned.slice().sort((a, b) => (a.measuredAt < b.measuredAt ? 1 : -1))
    const latestByMetric = this.latestByMetric(owned)

    /** Latest value per metric, with its evaluation. */
    const latest = []
    for (const metric of METRICS) {
      const record = sorted.find((item) => typeof item.values[metric.code] === 'number')
      if (!record) continue
      const value = record.values[metric.code]
      const verdict = evaluate(metric, value, member)
      latest.push({
        code: metric.code,
        name: metric.name,
        unit: metric.unit,
        category: metric.category,
        value,
        display: formatValue(metric, value),
        measuredAt: record.measuredAt,
        context: contextName(record.context),
        status: verdict.status,
        band: verdict.band,
      })
    }

    // Series for charting (newest 120 points per metric) plus the full
    // per-metric record list for the detail modal.
    const series = {}
    const recordsByMetric = {}
    for (const metric of METRICS) {
      const all = owned
        .filter((record) => typeof record.values[metric.code] === 'number')
        .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1))
      if (all.length === 0) continue
      const points = all.slice(-120).map((record) => ({
        at: record.measuredAt,
        value: record.values[metric.code],
        context: contextName(record.context),
        source: record.source,
      }))
      series[metric.code] = {
        name: metric.name,
        unit: metric.unit,
        category: metric.category,
        targetMode: metric.targetMode,
        band: resolveBand(metric, member).band,
        points,
      }
      recordsByMetric[metric.code] = all.map((record) => ({
        id: record.id,
        measuredAt: record.measuredAt,
        value: record.values[metric.code],
        display: formatValue(metric, record.values[metric.code]),
        context: contextName(record.context),
        source: record.source,
        note: record.note,
      }))
    }

    // Condition tags + target gap + candidate suggestions.
    const memberConditions = conditionsDoc.conditions
      .filter((item) => item.memberId === member.id)
      .sort((a, b) => b.createdAt - a.createdAt)
    const conditionTargets = this.buildConditionTargets(member, memberConditions, latestByMetric)
    const existingCodes = memberConditions.map((item) => item.code)
    const suggestions = suggestConditions(latestByMetric, member)
      .filter((item) => !existingCodes.includes(item.code))

    // Documents, newest first.
    const documents = documentsDoc.documents
      .filter((item) => item.memberId === member.id)
      .sort((a, b) => b.docDate - a.docDate)

    // Management goals (intent layer), with targets and tracking dimensions.
    // A corrupt goals document must not take the whole panel down: the metric
    // view still works and the error is surfaced alongside it.
    let goals = []
    let goalError = null
    try {
      goals = await this.buildGoalsForMember(member)
    } catch (error) {
      goalError = String(error?.message ?? error)
    }

    // Per-member goal codes let the panel open on the profile with a physique
    // goal instead of always defaulting to the first family member.
    const memberGoalCodes = new Map()
    try {
      for (const goal of (await this.goals.read()).goals) {
        const list = memberGoalCodes.get(goal.memberId) ?? []
        list.push(goal.code)
        memberGoalCodes.set(goal.memberId, list)
      }
    } catch {
      // A corrupt goals document is already surfaced through goalError above.
    }

    // Latest progress photos for the "physique wall" (metadata only; bytes are
    // served by the photo route). A corrupt photo document must not break the
    // rest of the panel.
    let photos = []
    let photoError = null
    try {
      const photoResult = await this.listPhotos(member.id, { limit: 36 })
      if (photoResult.ok) photos = photoResult.photos ?? []
      else photoError = photoResult.error ?? '身材照片数据读取失败'
    } catch (error) {
      photoError = String(error?.message ?? error)
    }

    return {
      ok: true,
      members: members.map((item) => ({
        id: item.id,
        name: item.name,
        relation: relationName(item.relation),
        relationCode: item.relation,
        sex: item.sex === 'male' ? '男' : '女',
        sexCode: item.sex,
        riskLevel: riskName(item.riskLevel),
        riskCode: item.riskLevel,
        birthYear: item.birthYear ?? null,
        note: item.note,
        targets: item.targets,
        goalCodes: memberGoalCodes.get(item.id) ?? [],
      })),
      member: {
        id: member.id,
        name: member.name,
        relation: relationName(member.relation),
        relationCode: member.relation,
        sex: member.sex === 'male' ? '男' : '女',
        sexCode: member.sex,
        riskLevel: riskName(member.riskLevel),
        riskCode: member.riskLevel,
        birthYear: member.birthYear ?? null,
        note: member.note,
        targets: member.targets,
        goalCodes: memberGoalCodes.get(member.id) ?? [],
      },
      conditions: memberConditions,
      conditionTargets,
      suggestions,
      documents,
      goals,
      goalError,
      goalTemplates: GOALS.map(describeGoalTemplate),
      goalCatalog: { statuses: GOAL_STATUSES, sources: GOAL_SOURCES, domains: GOAL_DOMAINS },
      photos,
      photoError,
      latest,
      recent: sorted.slice(0, 30).map((record) => ({
        id: record.id,
        measuredAt: record.measuredAt,
        context: contextName(record.context),
        source: record.source,
        note: record.note,
        values: Object.entries(record.values).map(([code, value]) => {
          const metric = metricOf(code)
          return { code, name: metric.name, unit: metric.unit, display: formatValue(metric, value) }
        }),
      })),
      series,
      recordsByMetric,
      catalogs,
      disclaimer: DISCLAIMER,
    }
  }

  /** Delete one record by id. */
  async deleteRecord(id) {
    const doc = await this.records.read()
    const target = doc.records.find((record) => record.id === id)
    if (!target) return { ok: false, error: '找不到该记录。' }
    await this.records.update((current) => ({
      ...current,
      records: current.records.filter((record) => record.id !== id),
    }))
    return { ok: true, deleted: id }
  }

  /** Option catalogs so tools and panel agree on codes. */
  static catalogs() {
    return {
      relations: RELATIONS,
      contexts: CONTEXTS,
      riskLevels: RISK_LEVELS,
      categories: METRIC_CATEGORIES,
      metrics: METRICS.map((metric) => ({
        code: metric.code,
        name: metric.name,
        unit: metric.unit,
        decimals: metric.decimals,
        category: metric.category,
        targetMode: metric.targetMode,
      })),
      conditions: CONDITIONS.map((condition) => ({
        code: condition.code,
        name: condition.name,
        metrics: condition.metrics,
      })),
      goals: GOALS.map(describeGoalTemplate),
      goalStatuses: GOAL_STATUSES,
      goalSources: GOAL_SOURCES,
      goalDomains: GOAL_DOMAINS,
      documentTypes: DOCUMENT_TYPES,
      maxMembers: MAX_MEMBERS,
      disclaimer: DISCLAIMER,
      goalDisclaimer: GOAL_DISCLAIMER,
    }
  }
}

// ---------------------------------------------------------------- helpers

class MemberLimitError extends Error {
  constructor(limit) {
    super(`成员数量已达上限 ${limit} 人。如需添加，请先删除不再管理的成员。`)
  }
}
class DuplicateMemberError extends Error {
  constructor(name) {
    super(`已存在名为「${name}」的成员，请用不同的称呼区分。`)
  }
}
class EmptyNameError extends Error {
  constructor() {
    super('成员姓名不能为空。')
  }
}
class BadYearError extends Error {
  constructor(year) {
    super(`出生年份 ${year} 不在合理范围内。`)
  }
}
class UnknownMetricError extends Error {
  constructor(code) {
    super(`未知指标代码 ${code}。`)
  }
}
class BadTargetError extends Error {
  constructor(code) {
    super(`目标值 ${code} 不是有效数字。`)
  }
}

/**
 * Accept ISO-like timestamps and a few common Chinese phrasings, normalizing to
 * `YYYY-MM-DD HH:mm`. Returns undefined when the input cannot be understood —
 * the caller reports that rather than guessing a time.
 */
export function normalizeTimestamp(input) {
  if (input === undefined || input === null || input === '') {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  }
  const text = String(input).trim()

  const full = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/)
  if (full) {
    const [, y, mo, d, hh, mm] = full
    const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0))
    if (Number.isNaN(date.getTime())) return undefined
    if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return undefined
    return formatDate(date)
  }

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})[ T]?(\d{2})?(\d{2})?$/)
  if (compact) {
    const [, y, mo, d, hh, mm] = compact
    const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0))
    if (Number.isNaN(date.getTime())) return undefined
    return formatDate(date)
  }

  // Chinese relative day + optional clock, e.g. "今天 7:12" / "昨天 8点" / "前天".
  const rel = text.match(/^(今天|昨天|前天)(?:\s*(\d{1,2})(?::(\d{1,2})|点(\d{1,2})?)?)?$/)
  if (rel) {
    const offset = rel[1] === '今天' ? 0 : rel[1] === '昨天' ? -1 : -2
    const base = new Date()
    base.setDate(base.getDate() + offset)
    const hour = Number(rel[2] ?? base.getHours())
    const minute = Number(rel[3] ?? rel[4] ?? (rel[2] ? 0 : base.getMinutes()))
    if (hour > 23 || minute > 59) return undefined
    return formatDate(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute))
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) return formatDate(parsed)
  return undefined
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Resolve a range upper bound. A bare date means "through the end of that day",
 * so `to: '2026-11-07'` includes readings at 07:00 on the 7th; an explicit clock
 * time is used verbatim.
 */
export function normalizeRangeEnd(input) {
  const text = String(input ?? '').trim()
  const isBareDate = /^\d{4}-\d{1,2}-\d{1,2}$/.test(text) || /^\d{8}$/.test(text)
  const normalized = normalizeTimestamp(text)
  if (!normalized) return undefined
  return isBareDate ? `${normalized.slice(0, 10)} 23:59` : normalized
}

/** Linear-interpolation percentile on a pre-sorted ascending array. */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

/** Least-squares slope in metric units per day, over sample timestamps. */
function slopePerDay(samples) {
  if (samples.length < 2) return 0
  const times = samples.map((sample) => new Date(sample.measuredAt.replace(' ', 'T')).getTime())
  const base = times[0]
  const xs = times.map((time) => (time - base) / 86_400_000)
  const ys = samples.map((sample) => sample.value)
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length
  let numerator = 0
  let denominator = 0
  for (let i = 0; i < xs.length; i += 1) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY)
    denominator += (xs[i] - meanX) ** 2
  }
  if (denominator === 0) return 0
  return numerator / denominator
}

function round(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Detect the actual image type from magic bytes; the file extension follows it. */
function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'image/png'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Strip path separators and control characters from a user-supplied filename. */
function sanitizeFileName(name) {
  if (typeof name !== 'string') return null
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return base.length > 0 && base.length <= 200 ? base : null
}

export { StoreCorruptError }
