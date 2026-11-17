/**
 * Focused checks for the Little Muscle King floating avatar: settings normalization,
 * atomic persistence, and the aggregate-only status the reminder engine reads.
 *
 * Run with: node test/float.mjs
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HealthService } from '../lib/service.js'
import {
  FLOAT_DEFAULTS,
  FloatSettingsStore,
  floatStatus,
  localDateString,
  normalizeFloatSettings,
} from '../lib/float.js'

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

const dir = await mkdtemp(join(tmpdir(), 'dsh-health-float-'))
try {
  console.log('\n[float: normalization]')
  const VALID_AVATAR = 'data:image/png;base64,iVBORw0KGgo='
  const defaults = normalizeFloatSettings({})
  check('defaults keep the avatar visible', defaults.enabled === true)
  check('defaults keep reminders on', defaults.remindersEnabled === true)
  check('default interval is bounded', defaults.intervalMinutes === 45)
  check('default name is the product name', defaults.name === '小肌霸')
  check('default avatar style is the portrait', defaults.avatarStyle === 'portrait')
  check('default avatar image is empty', defaults.avatarImage === null)
  check('default position x is inside the viewport', defaults.position.x > 0 && defaults.position.x <= 1)
  check('default position y is inside the viewport', defaults.position.y > 0 && defaults.position.y <= 1)

  const identity = normalizeFloatSettings({
    name: '  小美  ',
    avatarStyle: 'sun',
    avatarImage: VALID_AVATAR,
  })
  check('name is trimmed', identity.name === '小美')
  check('built-in avatar style survives', identity.avatarStyle === 'sun')
  check('image data url survives', identity.avatarImage === VALID_AVATAR)
  check('empty name falls back to the default', normalizeFloatSettings({ name: '   ' }).name === '小肌霸')
  check('name is capped at 24 code points',
    Array.from(normalizeFloatSettings({ name: 'x'.repeat(40) }).name).length === 24)
  check('invalid avatar data type is ignored',
    normalizeFloatSettings({ avatarImage: 'data:text/plain;base64,abc' }).avatarImage === null)
  check('oversized avatar is ignored',
    normalizeFloatSettings({ avatarImage: `data:image/png;base64,${'A'.repeat(900 * 1024)}` }).avatarImage === null)

  const clamped = normalizeFloatSettings({
    intervalMinutes: 999,
    bubbleSeconds: -20,
    size: 'huge',
    quietStart: '99:99',
    quietEnd: '07:30',
    position: { x: 2, y: -1 },
  })
  check('interval clamps to the upper bound', clamped.intervalMinutes === 240)
  check('bubble duration clamps to zero', clamped.bubbleSeconds === 0)
  check('unknown size falls back to medium', clamped.size === 'medium')
  check('invalid quiet start falls back', clamped.quietStart === FLOAT_DEFAULTS.quietStart)
  check('valid quiet end survives', clamped.quietEnd === '07:30')
  check('position clamps into [0,1]', clamped.position.x === 1 && clamped.position.y === 0)

  console.log('\n[float: persistence]')
  const store = new FloatSettingsStore(join(dir, 'float.json'))
  const initial = await store.get()
  check('first read returns complete defaults', initial.enabled === true && initial.size === 'medium')

  const saved = await store.save({ enabled: false, intervalMinutes: 60, position: { x: 0.15 } })
  check('save applies the boolean', saved.enabled === false)
  check('save applies the interval', saved.intervalMinutes === 60)
  check('partial position patch keeps y', saved.position.y === FLOAT_DEFAULTS.position.y)
  check('partial position patch applies x', saved.position.x === 0.15)

  const arrayPosition = await store.save({ position: [0.9, 0.9] })
  check('array position is ignored', arrayPosition.position.x === 0.15
    && arrayPosition.position.y === FLOAT_DEFAULTS.position.y)

  const savedIdentity = await store.save({ name: '  小美  ', avatarStyle: 'sun', avatarImage: VALID_AVATAR })
  check('save trims the name', savedIdentity.name === '小美')
  check('save stores the built-in style', savedIdentity.avatarStyle === 'sun')
  check('save stores the avatar image', savedIdentity.avatarImage === VALID_AVATAR)
  const clearedIdentity = await store.save({ avatarImage: null })
  check('clearing the image keeps the built-in style',
    clearedIdentity.avatarImage === null && clearedIdentity.avatarStyle === 'sun')

  const reopened = await new FloatSettingsStore(join(dir, 'float.json')).get()
  check('settings survive a new store instance', reopened.enabled === false && reopened.position.x === 0.15)
  check('identity survives a new store instance', reopened.name === '小美' && reopened.avatarStyle === 'sun')

  console.log('\n[float: aggregate status]')
  const service = new HealthService(dir)
  await service.init()
  const members = await service.listMembers()
  check('init seeds the self member', members.length === 1 && members[0].name === '我')
  const goal = await service.setGoal('我', { code: 'lean_muscle' })
  check('lean-muscle goal activated', goal.ok === true)

  const today = localDateString()
  const record = await service.record({
    member: '我',
    measuredAt: `${today} 09:00`,
    values: { water: 300, training: 20, protein: 15 },
  })
  check('today record stored', record.ok === true)

  const status = await floatStatus(service)
  check('status names the primary member', status.primaryMember?.name === '我')
  check('status counts today records', status.todayRecordCount === 1)
  check('status exposes metric counts only', status.counts.water === 1 && status.counts.training === 1)
  check('status lists the active goal code', status.activeGoals.some((item) => item.code === 'lean_muscle'))
  check('status carries no evaluation fields', !('latest' in status) && !('conditions' in status) && !('targets' in status))
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : 'FAILED'} · ${passes}/${passes + failures} checks`)
process.exit(failures === 0 ? 0 : 1)
