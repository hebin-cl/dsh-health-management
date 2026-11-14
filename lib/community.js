/**
 * Local preview store for invite-only season squads.
 *
 * This file deliberately implements the *same* small API that a future remote
 * service would expose. It is local-only: data lives next to the health data,
 * there is no network hop, and only aggregate behaviour snapshots are stored.
 * Never write body-composition metrics, photos, notes, conditions or documents
 * here.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const MAX_SQUAD_MEMBERS = 8
export const MAX_ALIAS_LENGTH = 20

const ACCOUNT_CODES = ['training', 'protein', 'sleep', 'water']
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

const ok = (data) => ({ ok: true, data })
const fail = (error) => ({ ok: false, error })

function clampInt(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function normalizeAlias(value) {
  const alias = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (alias.length < 1) throw new Error('请填写小队昵称。')
  if (alias.length > MAX_ALIAS_LENGTH) throw new Error(`昵称最多 ${MAX_ALIAS_LENGTH} 个字符。`)
  return alias
}

function normalizeCode(value) {
  const code = String(value ?? '').trim().toUpperCase()
  if (!new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code)) {
    throw new Error('邀请码格式不正确。')
  }
  return code
}

function normalizeSnapshot(value) {
  const source = value && typeof value === 'object' ? value : {}
  const depositsSource = source.deposits && typeof source.deposits === 'object'
    ? source.deposits
    : {}
  const deposits = {}
  for (const code of ACCOUNT_CODES) {
    // One deposit per day, seven days per week. Caps keep the board about
    // consistency, never about doing more training/protein than someone else.
    deposits[code] = clampInt(depositsSource[code], 0, 7, 0)
  }
  return {
    seasonId: String(source.seasonId ?? '').trim().slice(0, 64) || 'local',
    seasonNumber: clampInt(source.seasonNumber, 1, 99, 1),
    week: clampInt(source.week, 1, 12, 1),
    deposits,
    streak: clampInt(source.streak, 0, 84, 0),
    updatedAt: Date.now(),
  }
}

function totalDeposits(snapshot) {
  return ACCOUNT_CODES.reduce((sum, code) => sum + (Number(snapshot?.deposits?.[code]) || 0), 0)
}

function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

function publicMember(member) {
  return {
    memberId: member.id,
    alias: member.alias,
    joinedAt: member.joinedAt,
    snapshot: member.snapshot,
    total: totalDeposits(member.snapshot),
  }
}

function publicSquad(squad) {
  const members = squad.members
    .map(publicMember)
    .sort((a, b) => b.total - a.total
      || (b.snapshot?.streak ?? 0) - (a.snapshot?.streak ?? 0)
      || a.alias.localeCompare(b.alias, 'zh-Hans-CN'))
    .map((member, index) => ({ ...member, rank: index + 1 }))
  return {
    code: squad.code,
    createdAt: squad.createdAt,
    seasonNumber: squad.seasonNumber,
    week: squad.week,
    memberCount: members.length,
    maxMembers: MAX_SQUAD_MEMBERS,
    members,
  }
}

export class CommunityStore {
  constructor(file) {
    this.file = file
    this.chain = Promise.resolve()
    this.cache = null
  }

  async load() {
    if (this.cache) return this.cache
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw)
      this.cache = {
        version: 1,
        squads: Array.isArray(parsed?.squads) ? parsed.squads : [],
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      this.cache = { version: 1, squads: [] }
    }
    return this.cache
  }

  async save(doc) {
    await mkdir(dirname(this.file), { recursive: true })
    const temp = `${this.file}.tmp`
    await writeFile(temp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
    await rename(temp, this.file)
    this.cache = doc
  }

  /**
   * Serialize mutations. The local preview may receive two browser tabs at
   * once; without this, a join could overwrite a create.
   */
  async withLock(work) {
    const run = this.chain.then(work, work)
    this.chain = run.catch(() => {})
    return run
  }

  async create({ alias, snapshot }) {
    return this.withLock(async () => {
      const displayName = normalizeAlias(alias)
      const nextSnapshot = normalizeSnapshot(snapshot)
      const doc = await this.load()
      let code
      do {
        code = Array.from(randomBytes(CODE_LENGTH))
          .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
          .join('')
      } while (doc.squads.some((squad) => squad.code === code))

      const token = randomBytes(24).toString('hex')
      const member = {
        id: randomUUID(),
        alias: displayName,
        tokenHash: tokenHash(token),
        joinedAt: Date.now(),
        snapshot: nextSnapshot,
      }
      const squad = {
        id: randomUUID(),
        code,
        createdAt: Date.now(),
        seasonNumber: nextSnapshot.seasonNumber,
        week: nextSnapshot.week,
        members: [member],
      }
      doc.squads.push(squad)
      await this.save(doc)
      return ok({
        code: squad.code,
        memberId: member.id,
        token,
        squad: publicSquad(squad),
      })
    }).catch((error) => fail(String(error?.message ?? error)))
  }

  async join({ code, alias, snapshot }) {
    return this.withLock(async () => {
      const invite = normalizeCode(code)
      const displayName = normalizeAlias(alias)
      const nextSnapshot = normalizeSnapshot(snapshot)
      const doc = await this.load()
      const squad = doc.squads.find((item) => item.code === invite)
      if (!squad) throw new Error('小队不存在，或邀请码已失效。')
      if (squad.members.length >= MAX_SQUAD_MEMBERS) {
        throw new Error(`小队最多 ${MAX_SQUAD_MEMBERS} 人。`)
      }
      if (squad.members.some((member) =>
        member.alias.toLocaleLowerCase('zh-Hans-CN') === displayName.toLocaleLowerCase('zh-Hans-CN'))) {
        throw new Error('这个昵称已被小队成员使用，换一个吧。')
      }
      const token = randomBytes(24).toString('hex')
      const member = {
        id: randomUUID(),
        alias: displayName,
        tokenHash: tokenHash(token),
        joinedAt: Date.now(),
        snapshot: nextSnapshot,
      }
      squad.members.push(member)
      squad.week = nextSnapshot.week
      squad.seasonNumber = nextSnapshot.seasonNumber
      await this.save(doc)
      return ok({
        code: squad.code,
        memberId: member.id,
        token,
        squad: publicSquad(squad),
      })
    }).catch((error) => fail(String(error?.message ?? error)))
  }

  async updateSnapshot({ code, token, snapshot }) {
    return this.withLock(async () => {
      const invite = normalizeCode(code)
      const doc = await this.load()
      const squad = doc.squads.find((item) => item.code === invite)
      if (!squad) throw new Error('小队不存在，或已解散。')
      const hash = tokenHash(token)
      const member = squad.members.find((item) => item.tokenHash === hash)
      if (!member) throw new Error('没有找到你的小队身份，请重新加入。')
      const nextSnapshot = normalizeSnapshot(snapshot)
      member.snapshot = nextSnapshot
      squad.week = nextSnapshot.week
      squad.seasonNumber = nextSnapshot.seasonNumber
      await this.save(doc)
      return ok(publicSquad(squad))
    }).catch((error) => fail(String(error?.message ?? error)))
  }

  async leave({ code, token }) {
    return this.withLock(async () => {
      const invite = normalizeCode(code)
      const doc = await this.load()
      const squad = doc.squads.find((item) => item.code === invite)
      if (!squad) throw new Error('小队不存在，或已解散。')
      const hash = tokenHash(token)
      const before = squad.members.length
      squad.members = squad.members.filter((item) => item.tokenHash !== hash)
      if (squad.members.length === before) throw new Error('没有找到你的小队身份。')
      if (squad.members.length === 0) {
        doc.squads = doc.squads.filter((item) => item.id !== squad.id)
      }
      await this.save(doc)
      return ok({ left: true, code: invite, remaining: squad.members.length })
    }).catch((error) => fail(String(error?.message ?? error)))
  }

  async leaderboard({ code }) {
    try {
      const invite = normalizeCode(code)
      const doc = await this.load()
      const squad = doc.squads.find((item) => item.code === invite)
      if (!squad) return fail('小队不存在，或邀请码已失效。')
      return ok(publicSquad(squad))
    } catch (error) {
      return fail(String(error?.message ?? error))
    }
  }
}
