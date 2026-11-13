/**
 * Smoke test for the health-management service: members, metrics, conditions,
 * documents, management goals and persistence. Runs against a temp directory.
 *
 * The lean-muscle goal is the v3 "thin-muscle account": four behaviour accounts
 * (training / protein / sleep / water), a 12-week season, a rolling 7-day
 * ledger and an observation-only body-composition statement. Those sections
 * also pin the safety boundary: body composition is never scored, and no
 * output may turn into a diagnosis, medication, plan, recipe or promise.
 */

import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HealthService, MAX_MEMBERS, normalizeTimestamp } from '../lib/service.js'
import { METRICS, evaluate, resolveBand } from '../lib/metrics.js'
import { suggestConditions, resolveTargets, conditionOf } from '../lib/conditions.js'

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

/** Recursively collect exact object keys from a JSON-like payload. */
function collectKeys(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      found.add(key)
      collectKeys(item, found)
    }
  }
  return found
}

const BANNED_OUTPUT_KEYS = new Set([
  'advice', 'suggestion', 'suggestions', 'diagnosis', 'prescription', 'treatment',
  'plan', 'recipe', 'supplement', 'dosage', 'medication',
])

/** Keys that would turn a descriptive payload into advice or a prescription. */
function bannedOutputKeys(payload) {
  return [...collectKeys(payload)].filter((key) => BANNED_OUTPUT_KEYS.has(key))
}

/**
 * Safety lexicon scan. A clause may mention a risky word only inside an
 * explicit negation ("不生成训练计划", "不是医疗诊断", "不构成效果承诺"); a
 * positive claim is a failure. Clauses are split on sentence punctuation, not
 * on "、", so the negation scope is preserved.
 */
const SAFETY_TERMS = [
  '诊断', '用药', '停药', '剂量', '服药', '药物', '调药', '处方', '补剂',
  '训练计划', '食谱', '餐单', '效果承诺', '治愈', '治疗', '保证瘦', '一定变瘦',
  '包瘦', '排行榜',
]
const NEGATION = /(不|非|无|未|禁止|拒绝|避免|不会|不要|不是|不构成|不提供|不承诺)/

function unsafeClaims(value, path = '', found = []) {
  if (typeof value === 'string') {
    for (const clause of value.split(/[，。；;！？\n]/)) {
      for (const term of SAFETY_TERMS) {
        const index = clause.indexOf(term)
        if (index < 0) continue
        if (NEGATION.test(clause.slice(0, index))) continue
        found.push({ path, term, clause })
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => unsafeClaims(item, `${path}[${index}]`, found))
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      unsafeClaims(item, path ? `${path}.${key}` : key, found)
    }
  }
  return found
}

/** Local timestamp string offset from today, used for 7/30-day windows. */
function stamp(offsetDays, hour = 7, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(hour)}:${pad(minute)}`
}

const dir = await mkdtemp(join(tmpdir(), 'dsh-health-'))
const service = new HealthService(dir)
await service.init()
const seededMembers = await service.listMembers()
check('default seed is only 我', seededMembers.length === 1 && seededMembers[0].name === '我', seededMembers)

console.log('\n[members]')
const dad = await service.createMember({ name: '成员A', sex: 'male', relation: 'father', birthYear: 1965, riskLevel: 'high' })
check('create first member', dad.ok, dad)
const mom = await service.createMember({ name: '成员B', sex: 'female', relation: 'mother', birthYear: 1968 })
check('create second member', mom.ok, mom)
const dup = await service.createMember({ name: '成员A', sex: 'male' })
check('duplicate name rejected', !dup.ok, dup)
const noSex = await service.createMember({ name: '叔叔' })
check('missing sex rejected', !noSex.ok, noSex)

// init() seeds a default "我" member, so the cap counts from 3 here.
let created = 3
for (let i = 0; created < MAX_MEMBERS; i += 1) {
  const result = await service.createMember({ name: `成员${i}`, sex: 'male', relation: 'other' })
  if (!result.ok) break
  created += 1
}
check(`member cap is ${MAX_MEMBERS}`, created === MAX_MEMBERS && (await service.listMembers()).length === MAX_MEMBERS)
const overflow = await service.createMember({ name: '多余的人', sex: 'male' })
check('9th member rejected', !overflow.ok && /上限/.test(overflow.error), overflow)

console.log('\n[reference bands]')
const maleMember = (await service.findMember('成员A'))
const femaleMember = (await service.findMember('成员B'))
const ua = METRICS.find((m) => m.code === 'ua')
check('uric acid male band 420', resolveBand(ua, maleMember).band.high === 420, resolveBand(ua, maleMember))
check('uric acid female band 360', resolveBand(ua, femaleMember).band.high === 360, resolveBand(ua, femaleMember))
const ldl = METRICS.find((m) => m.code === 'ldl')
check('LDL high-risk target 2.6', resolveBand(ldl, maleMember).band.high === 2.6, resolveBand(ldl, maleMember))
check('LDL low-risk target 3.4', resolveBand(ldl, femaleMember).band.high === 3.4, resolveBand(ldl, femaleMember))
const waist = METRICS.find((m) => m.code === 'waist')
check('waist male band 90', resolveBand(waist, maleMember).band.high === 90, resolveBand(waist, maleMember))
check('waist female band 85', resolveBand(waist, femaleMember).band.high === 85, resolveBand(waist, femaleMember))
const bodyfat = METRICS.find((m) => m.code === 'bodyfat')
check('body fat male reference 10-20', resolveBand(bodyfat, maleMember).band.high === 20, resolveBand(bodyfat, maleMember))
check('body fat female reference 18-28', resolveBand(bodyfat, femaleMember).band.high === 28, resolveBand(bodyfat, femaleMember))
check('new lifestyle metrics registered', ['waist', 'bodyfat', 'muscle', 'protein', 'training'].every((code) => METRICS.some((m) => m.code === code)))

console.log('\n[recording]')
const ambiguous = await service.record({ values: { sbp: 138, dbp: 88 } })
check('ambiguous owner rejected, not guessed', !ambiguous.ok && ambiguous.needsMember === true, ambiguous)

const rec = await service.record({
  member: '成员A', measuredAt: '2026-11-10 07:12', context: 'morning',
  values: { sbp: 145, dbp: 95, hr: 72 }, source: 'text',
})
check('multi-metric record saved', rec.ok && Object.keys(rec.record.values).length === 3, rec)
const badRange = await service.record({ member: '成员A', values: { sbp: 900 } })
check('out-of-range value rejected', !badRange.ok, badRange)

for (let day = 1; day <= 10; day += 1) {
  await service.record({
    member: '成员A', measuredAt: `2026-11-${String(day).padStart(2, '0')} 07:00`,
    context: 'morning', values: { sbp: 130 + day, dbp: 80 + (day % 5), hr: 70 },
  })
}
await service.record({ member: '成员A', measuredAt: stamp(0), values: { waist: 95, bodyfat: 22 } })
await service.record({ member: '成员B', measuredAt: '2026-11-10 07:30', values: { sbp: 118, dbp: 76, ua: 300 } })
for (const [offset, minutes] of [[-1, 50], [-3, 40]]) {
  await service.record({ member: '成员B', measuredAt: stamp(offset, 20), context: 'evening', values: { training: minutes } })
}
await service.record({
  member: '成员B', measuredAt: stamp(0, 7, 30), context: 'morning',
  values: { weight: 55, bodyfat: 25, muscle: 20, waist: 80, protein: 80 },
})

console.log('\n[query and stats]')
const stats = await service.stats({ member: '成员A', metric: 'sbp', from: '2026-11-01' })
check('stats returns sample count', stats.ok && stats.sampleCount === 11, stats.sampleCount)
check('stats carries no advice field', !('advice' in stats) && !('suggestion' in stats))

console.log('\n[metric evaluation]')
const dadOverview = await service.overview('成员A')
check('male waist 95 flagged high', dadOverview.latest.find((m) => m.code === 'waist')?.status === 'high')
check('male body fat 22 flagged high', dadOverview.latest.find((m) => m.code === 'bodyfat')?.status === 'high')
const momOverview = await service.overview('成员B')
check('female waist 80 not flagged', momOverview.latest.find((m) => m.code === 'waist')?.status === 'normal')
check('female body fat 25 normal', momOverview.latest.find((m) => m.code === 'bodyfat')?.status === 'normal')
check('unbounded metric stays unknown', momOverview.latest.find((m) => m.code === 'protein')?.status === 'unknown')
check('weight has no generic claim', momOverview.latest.find((m) => m.code === 'weight')?.status === 'unknown')

console.log('\n[conditions: suggest]')
// Dad's latest sbp is 140 (Nov 10), dbp 85 — sbp hits the 140 cut-point.
const sugg = await service.suggestConditionsForMember('成员A')
check('suggests hypertension for elevated sbp', sugg.ok && sugg.suggestions.some((s) => s.code === 'hypertension'), sugg)
check('suggestion carries caveat, no persistence', sugg.suggestions.every((s) => s.note), sugg)

console.log('\n[conditions: add/list/remove]')
const addReport = await service.addCondition('成员A', { code: 'hyperlipidemia', source: 'report', note: '2026-11 体检报告' })
check('add report-sourced condition', addReport.ok && addReport.condition.source === 'report', addReport)
const addRecognized = await service.addCondition('成员A', { code: 'hypertension', source: 'recognized' })
check('add recognized condition', addRecognized.ok && addRecognized.condition.source === 'recognized', addRecognized)
const addDup = await service.addCondition('成员A', { code: 'hypertension', source: 'manual' })
check('duplicate condition rejected', !addDup.ok, addDup)
const addBad = await service.addCondition('成员A', { code: 'nonsense', source: 'manual' })
check('unknown condition code rejected', !addBad.ok, addBad)
const badSource = await service.addCondition('成员A', { code: 'diabetes', source: 'guessed' })
check('invalid source rejected', !badSource.ok, badSource)

const list = await service.listConditions('成员A')
check('conditions list has 2 tags', list.ok && list.total === 2, list)

// After hypertension is confirmed, suggest should no longer return it.
const suggAfter = await service.suggestConditionsForMember('成员A')
check('confirmed condition not re-suggested', !suggAfter.suggestions.some((s) => s.code === 'hypertension'), suggAfter)

const rmCond = await service.removeCondition('成员A', 'hypertension')
check('remove condition by code', rmCond.ok && rmCond.removed === '高血压', rmCond)

console.log('\n[conditions: targets]')
const targets = await service.conditionTargets('成员A')
check('targets returns condition rows', targets.ok && targets.conditions.length === 1, targets.conditions?.length)
const lipidRow = targets.conditions?.[0]
check('lipid target has LDL row', lipidRow?.targets.some((t) => t.metric === 'ldl'), lipidRow)
const ldlTarget = lipidRow?.targets.find((t) => t.metric === 'ldl')
check('LDL target uses member override priority', ldlTarget?.high === 2.6, ldlTarget)

console.log('\n[conditions: target boundary]')
await service.record({ member: '成员A', measuredAt: stamp(0, 9), values: { ldl: 2.6 } })
const boundaryCondition = await service.conditionTargets('成员A')
const ldlBoundary = boundaryCondition.conditions?.[0]?.targets.find((t) => t.metric === 'ldl')
check('condition target lt boundary is not met', ldlBoundary?.status === 'high', ldlBoundary)

console.log('\n[goals: catalog]')
const templates = service.goalTemplates()
const leanTpl = templates.templates.find((t) => t.code === 'lean_muscle')
check('two goal templates', templates.ok && templates.templates.length === 2, templates.templates?.length)
check('metabolic template targets core metrics', templates.templates.find((t) => t.code === 'metabolic')?.targets.length === 7)
check('lean muscle template has diet/training dimensions', leanTpl?.dimensions.some((d) => d.code === 'training'))
check('goal templates carry caveats', templates.templates.every((t) => t.notes.length > 0 && t.disclaimer))
check('goal templates define quick-log fields',
  templates.templates.every((t) => Array.isArray(t.quickMetrics) && t.quickMetrics.length >= 3))
const accountDims = leanTpl.dimensions.filter((d) => d.account)
check('lean template has four scored accounts', accountDims.length === 4
  && ['training', 'protein', 'sleep', 'water'].every((code) => accountDims.some((d) => d.code === code)), accountDims)
const bodyDim = leanTpl.dimensions.find((d) => d.code === 'body')
check('lean body composition is an unscored statement',
  bodyDim?.account === false && bodyDim?.role === '对账单' && bodyDim?.metrics.length === 4, bodyDim)
check('lean quick metrics are the four accounts',
  JSON.stringify(leanTpl.quickMetrics) === JSON.stringify(['training', 'protein', 'sleep', 'water']), leanTpl.quickMetrics)
const templateKind = (metric) => leanTpl.targets.find((t) => t.metric === metric)?.kind
check('training target is weekly days', templateKind('training') === 'weeklyDays')
check('protein target is per-kg', templateKind('protein') === 'perKg')
check('water and sleep targets are ranges', templateKind('water') === 'range' && templateKind('sleep') === 'range')
check('body composition targets are observe-only',
  ['bodyfat', 'weight', 'muscle', 'waist'].every((metric) => templateKind(metric) === 'observe'))
check('water template target shows the floor',
  /≥\s*1500/.test(leanTpl.targets.find((t) => t.metric === 'water')?.targetDisplay ?? ''))
check('sleep template target shows 7–9',
  /7–9/.test(leanTpl.targets.find((t) => t.metric === 'sleep')?.targetDisplay ?? ''))
check('lean season is 12 weeks with W4/W8/W12',
  leanTpl.season?.weeks === 12 && JSON.stringify(leanTpl.season?.checkpoints) === JSON.stringify([4, 8, 12]), leanTpl.season)
check('playbook has 6-8 cards', Array.isArray(leanTpl.playbook)
  && leanTpl.playbook.length >= 6 && leanTpl.playbook.length <= 8, leanTpl.playbook?.length)
check('every playbook card carries claim/source/takeaway/boundary',
  leanTpl.playbook.every((card) => ['id', 'title', 'claim', 'source', 'takeaway', 'boundary']
    .every((field) => typeof card[field] === 'string' && card[field].trim().length > 0)))
const waistTplText = templates.templates.find((t) => t.code === 'metabolic')?.targets.find((t) => t.metric === 'waist')?.targetDisplay
check('sex-aware template text', /男 <90/.test(waistTplText ?? '') && /女 <85/.test(waistTplText ?? ''), waistTplText)
const bodyfatTplText = leanTpl.targets.find((t) => t.metric === 'bodyfat')?.targetDisplay
check('body fat template text keeps both sexes', /10–20%/.test(bodyfatTplText ?? '') && /18–28%/.test(bodyfatTplText ?? ''), bodyfatTplText)
const bareOverview = await service.overview('我')
check('overview exposes goal templates', bareOverview.ok && bareOverview.goalTemplates.length === 2)
check('overview starts with no goals', Array.isArray(bareOverview.goals) && bareOverview.goals.length === 0)

console.log('\n[goals: set/update/validate]')
const g1 = await service.setGoal('成员A', { code: 'metabolic', status: 'active', source: 'report', note: '医生建议管理代谢指标' })
check('activate metabolic goal', g1.ok && g1.created === true && g1.goal.targets.length === 7, g1)
const g2 = await service.setGoal('成员A', { code: 'metabolic', targets: { sbp: 130 } })
check('update goal personal target', g2.ok && g2.created === false, g2)
const badGoal = await service.setGoal('成员A', { code: 'nonsense' })
check('unknown goal rejected', !badGoal.ok, badGoal)
const badMetric = await service.setGoal('成员A', { code: 'metabolic', targets: { protein: 100 } })
check('metric outside goal rejected', !badMetric.ok, badMetric)
const badStatus = await service.setGoal('成员A', { code: 'metabolic', status: 'weird' })
check('invalid goal status rejected', !badStatus.ok, badStatus)

const dadGoals = await service.goalOverview('成员A')
check('goal overview lists metabolic', dadGoals.ok && dadGoals.goals.some((g) => g.code === 'metabolic'), dadGoals)
const metabolic = dadGoals.goals.find((g) => g.code === 'metabolic')
check('goal summary carries coverage', metabolic.coverage.evaluable === 7 && metabolic.coverage.measured >= 3, metabolic.coverage)
check('goal sbp row uses personal target', metabolic.targets.find((t) => t.metric === 'sbp')?.high === 130)
check('goal waist row is sex-specific', metabolic.targets.find((t) => t.metric === 'waist')?.high === 90)
check('goal sbp row evaluated as high', metabolic.targets.find((t) => t.metric === 'sbp')?.status === 'high')
check('goal overview exposes tracking dimensions', metabolic.dimensions[0].metrics.length === 7)
// "目标 <140" means 140 itself has not met the target.
await service.setGoal('成员A', { code: 'metabolic', targets: { sbp: 140 } })
const boundaryGoal = (await service.goalOverview('成员A')).goals.find((g) => g.code === 'metabolic')
check('lt boundary at 140 is not met', boundaryGoal.targets.find((t) => t.metric === 'sbp')?.status === 'high',
  boundaryGoal.targets.find((t) => t.metric === 'sbp'))
await service.setGoal('成员A', { code: 'metabolic', status: 'paused', source: 'report' })
const partialUpdate = await service.setGoal('成员A', { code: 'metabolic', targets: { dbp: 85 } })
check('partial update keeps status and source',
  partialUpdate.goal.status === 'paused' && partialUpdate.goal.source === 'report', partialUpdate.goal)

console.log('\n[goals: lean muscle]')
const lean = await service.setGoal('成员B', { code: 'lean_muscle' })
check('activate lean muscle goal', lean.ok, lean)
const leanGoal = (await service.goalOverview('成员B')).goals.find((g) => g.code === 'lean_muscle')
const proteinRow = leanGoal.targets.find((t) => t.metric === 'protein')
check('protein per-kg range resolved from weight', proteinRow.kind === 'perKg' && proteinRow.low === 66 && proteinRow.high === 88, proteinRow)
check('protein in range normal', proteinRow.status === 'normal', proteinRow)
const momBodyfatRow = leanGoal.targets.find((t) => t.metric === 'bodyfat')
check('female body fat is observe-only with the female band',
  momBodyfatRow.status === 'observe' && momBodyfatRow.band.high === 28 && momBodyfatRow.band.low === 18, momBodyfatRow)
const trainingRow = leanGoal.targets.find((t) => t.metric === 'training')
check('training weekly-days target met', trainingRow.status === 'normal' && trainingRow.current === 2, trainingRow)
check('weight and muscle are observation-only',
  leanGoal.targets.find((t) => t.metric === 'weight')?.status === 'observe'
  && leanGoal.targets.find((t) => t.metric === 'muscle')?.status === 'observe')
const momCoverage = leanGoal.coverage
check('coverage separates met from measured',
  momCoverage.met === 2 && momCoverage.measured === 2 && momCoverage.evaluable === 4, momCoverage)
check('coverage counts only the four accounts, never body composition',
  momCoverage.evaluable === 4 && leanGoal.targets.filter((t) => t.kind === 'observe').length === 4, momCoverage)

// Personal targets without target semantics are rejected instead of silently stored.
const trendTarget = await service.setGoal('成员B', { code: 'lean_muscle', targets: { weight: 60 } })
check('observe target rejected', !trendTarget.ok && /只观察趋势/.test(trendTarget.error), trendTarget)
const dimensionTarget = await service.setGoal('成员B', { code: 'lean_muscle', targets: { waist: 80 } })
check('dimension-only target rejected', !dimensionTarget.ok, dimensionTarget)
const bodyTarget = await service.setGoal('成员B', { code: 'lean_muscle', targets: { bodyfat: 18 } })
check('observe body fat target rejected', !bodyTarget.ok && /只观察/.test(bodyTarget.error), bodyTarget)

// HDL-C is a floor: a member-level personal target must tighten the minimum,
// not turn the band into a ceiling.
await service.updateMember('成员1', { targets: { hdl: 1.4 } })
await service.record({ member: '成员1', measuredAt: stamp(0), values: { hdl: 1.5 } })
const hdlOverview = await service.overview('成员1')
check('HDL personal floor keeps high direction', hdlOverview.latest.find((m) => m.code === 'hdl')?.status === 'normal',
  hdlOverview.latest.find((m) => m.code === 'hdl'))
const hdlStats = await service.stats({ member: '成员1', metric: 'hdl' })
check('HDL stats band uses a floor', hdlStats.band.low === 1.4 && hdlStats.band.high === undefined, hdlStats.band)
await service.setGoal('成员1', { code: 'metabolic' })
const hdlGoal = (await service.goalOverview('成员1')).goals.find((g) => g.code === 'metabolic')
const hdlRow = hdlGoal.targets.find((t) => t.metric === 'hdl')
check('goal HDL row uses floor direction', hdlRow.low === 1.4 && hdlRow.high === null && hdlRow.status === 'normal', hdlRow)

// Per-kg range judged against the exact gram bounds, not the rounded display.
await service.record({ member: '成员1', measuredAt: stamp(0, 8), values: { weight: 55.4, protein: 66 } })
await service.setGoal('成员1', { code: 'lean_muscle' })
const exactPerKg = (await service.goalOverview('成员1')).goals.find((g) => g.code === 'lean_muscle')
  .targets.find((t) => t.metric === 'protein')
check('per-kg judges exact range below rounded floor', exactPerKg.low === 66 && exactPerKg.status === 'low', exactPerKg)
const proteinStats = await service.stats({ member: '成员1', metric: 'protein' })
check('stats without band reports null rate', proteinStats.withinBandCount === null && proteinStats.withinBandRate === null, proteinStats)
const member1Lean = (await service.goalOverview('成员1')).goals.find((g) => g.code === 'lean_muscle')
check('coverage measured counts account rows with data',
  member1Lean.coverage.evaluable === 4 && member1Lean.coverage.met === 0 && member1Lean.coverage.measured === 1,
  member1Lean.coverage)
check('coverage ratio is data coverage (measured/evaluable)', member1Lean.coverage.ratio === 0.25, member1Lean.coverage)
check('coverage metRatio is met/evaluable', member1Lean.coverage.metRatio === 0, member1Lean.coverage)

// "近 7 天" means today plus the previous six calendar days.
for (const offset of [0, -1, -6, -7, -8]) {
  await service.record({ member: '成员2', measuredAt: stamp(offset, 20), context: 'evening', values: { training: 30 } })
}
await service.setGoal('成员2', { code: 'lean_muscle' })
const weekRow = (await service.goalOverview('成员2')).goals.find((g) => g.code === 'lean_muscle')
  .targets.find((t) => t.metric === 'training')
check('weekly window counts today through 6 days ago only', weekRow.current === 3, weekRow)

// A goal with no records yet: per-kg waits for weight, training has no data.
await service.setGoal('成员3', { code: 'lean_muscle' })
const emptyGoal = (await service.goalOverview('成员3')).goals.find((g) => g.code === 'lean_muscle')
check('per-kg pending even without protein records', emptyGoal.targets.find((t) => t.metric === 'protein')?.status === 'pending',
  emptyGoal.targets.find((t) => t.metric === 'protein'))
check('empty goal coverage met is 0', emptyGoal.coverage.met === 0 && emptyGoal.coverage.measured === 0, emptyGoal.coverage)

// Member-level targets for special metrics must not leak into rows that have no
// fixed bound of their own (per-kg / weekly-days / observe).
await service.updateMember('成员4', { targets: { protein: 100, training: 150, weight: 60 } })
await service.setGoal('成员4', { code: 'lean_muscle' })
const specialRows = (await service.goalOverview('成员4')).goals.find((g) => g.code === 'lean_muscle').targets
check('per-kg row carries no leaked high bound',
  specialRows.find((t) => t.metric === 'protein')?.high === null, specialRows.find((t) => t.metric === 'protein'))
check('weekly-days row carries no leaked high bound',
  specialRows.find((t) => t.metric === 'training')?.high === null, specialRows.find((t) => t.metric === 'training'))
check('observe row carries no leaked high bound',
  specialRows.find((t) => t.metric === 'weight')?.high === null, specialRows.find((t) => t.metric === 'weight'))

// A high-only range renders as "目标 <90", so 90 itself is above the target.
await service.record({ member: '成员4', measuredAt: stamp(0), values: { waist: 90 } })
await service.setGoal('成员4', { code: 'metabolic' })
const waistBoundary = (await service.goalOverview('成员4')).goals.find((g) => g.code === 'metabolic')
  .targets.find((t) => t.metric === 'waist')
check('waist boundary at 90 is not met', waistBoundary.status === 'high', waistBoundary)

// A member with protein but no weight cannot resolve the per-kg target.
await service.record({ member: '成员0', measuredAt: stamp(0), values: { protein: 80 } })
const noWeightId = (await service.findMember('成员0')).id
await service.setGoal(noWeightId, { code: 'lean_muscle' })
const noWeightGoal = (await service.goalOverview('成员0')).goals.find((g) => g.code === 'lean_muscle')
const pendingProtein = noWeightGoal.targets.find((t) => t.metric === 'protein')
check('per-kg target pending without weight', pendingProtein.status === 'pending', pendingProtein)
const noTraining = noWeightGoal.targets.find((t) => t.metric === 'training')
check('no training records stays unknown, not missed', noTraining.status === 'unknown' && noTraining.current === null, noTraining)

const removedGoal = await service.removeGoal('成员0', 'lean_muscle')
check('remove goal by code', removedGoal.ok, removedGoal)

console.log('\n[progress photos]')
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const photo = await service.uploadPhoto('成员B', { dataBase64: PNG_1X1, takenAt: '2026-11-10', note: '晨起第一张' })
check('upload progress photo', photo.ok && photo.photo.mime === 'image/png', photo)
const photoList = await service.listPhotos('成员B')
check('list progress photos', photoList.ok && photoList.total === 1 && photoList.photos[0].takenAt.startsWith('2026-11-10'), photoList)
check('photo metadata hides file path', !('filePath' in photoList.photos[0]))
const photoBytes = await service.photoFile(photo.photo.id)
check('photo bytes readable', photoBytes?.mime === 'image/png' && photoBytes.buffer.length > 0)
const notImage = await service.uploadPhoto('成员B', { dataBase64: 'data:image/png;base64,aGVsbG8=' })
check('non-image bytes rejected', !notImage.ok, notImage)
const overviewWithPhoto = await service.overview('成员B')
check('overview carries photos', overviewWithPhoto.ok && overviewWithPhoto.photos.length === 1)
const inspiration = await service.uploadPhoto('成员B', {
  dataBase64: PNG_1X1, takenAt: '2026-11-09', kind: 'inspiration', note: '激励图',
})
check('upload inspiration image', inspiration.ok && inspiration.photo.kind === 'inspiration', inspiration)
const bothPhotos = await service.listPhotos('成员B')
check('photos keep their kind', bothPhotos.ok && bothPhotos.total === 2
  && bothPhotos.photos.filter((item) => item.kind === 'inspiration').length === 1, bothPhotos)
const badKind = await service.uploadPhoto('成员B', { dataBase64: PNG_1X1, kind: 'nonsense' })
check('unknown photo kind rejected', !badKind.ok, badKind)
const removeInspiration = await service.removePhoto('成员B', inspiration.photo.id)
check('remove inspiration image', removeInspiration.ok)
const removePhoto = await service.removePhoto('成员B', photo.photo.id)
check('remove progress photo', removePhoto.ok && (await service.listPhotos('成员B')).total === 0, removePhoto)

// Future dates are rejected; a tampered metadata path must never read or delete
// a file outside the photos root.
const futurePhoto = await service.uploadPhoto('成员B', { dataBase64: PNG_1X1, takenAt: '2099-01-01' })
check('future photo date rejected', !futurePhoto.ok, futurePhoto)
const secret = join(dir, 'outside-secret.txt')
await writeFile(secret, 'do not delete', 'utf8')
const momId = (await service.findMember('成员B')).id
await service.photos.update((doc) => ({
  ...doc,
  photos: [...doc.photos, {
    id: 'evil-photo', memberId: momId, filePath: secret, takenAt: '2026-11-10',
    kind: 'progress', mime: 'image/png', size: 7, createdAt: 1,
  }],
}))
check('photo route refuses a path outside photos root', (await service.photoFile('evil-photo')) === null)
const evilRemove = await service.removePhoto('成员B', 'evil-photo')
check('removePhoto refuses to delete outside photos root',
  evilRemove.ok && (await stat(secret)).size === 13 && (await service.listPhotos('成员B')).total === 0,
  evilRemove)
await rm(secret, { force: true })

// A tampered member id must not name a directory outside photos/.
await service.members.update((doc) => ({
  ...doc,
  members: [...doc.members, {
    id: '..\\outside', name: '伪造成员', relation: 'other', sex: 'male',
    birthYear: null, riskLevel: 'low', targets: {}, note: '', createdAt: 0, updatedAt: 0,
  }],
}))
const unsafe = await service.uploadPhoto('伪造成员', { dataBase64: PNG_1X1, takenAt: '2026-11-10' })
check('unsafe member id remains inside photos root', unsafe.ok, unsafe)
const photoDirs = await readdir(join(dir, 'photos'))
check('no directory escapes the photos root', !photoDirs.includes('outside'), photoDirs)
const forgedDelete = await service.deleteMember('伪造成员', true)
check('forged member and photo directory cleaned up', forgedDelete.ok && forgedDelete.removedPhotos === 1, forgedDelete)

// ---------------------------------------------------------------------------
// Thin-muscle account v3: water/sleep metrics, four behaviour accounts, the
// rolling weekly ledger, the 12-week season and the observation-only body
// statement. These checks run after the photo fixture so `PNG_1X1` exists.
// ---------------------------------------------------------------------------

console.log('\n[metrics: water and sleep]')
const waterMetric = METRICS.find((metric) => metric.code === 'water')
const sleepMetric = METRICS.find((metric) => metric.code === 'sleep')
const maleMemberNow = await service.findMember('成员A')
const femaleMemberNow = await service.findMember('成员B')
check('water metric is registered in ml',
  waterMetric?.unit === 'ml' && waterMetric?.category === 'diet' && waterMetric?.targetMode === 'range', waterMetric)
check('sleep metric is registered in hours',
  sleepMetric?.unit === 'h' && sleepMetric?.category === 'recovery' && sleepMetric?.targetMode === 'range', sleepMetric)
check('water reference is a floor at 1500',
  resolveBand(waterMetric, maleMemberNow).band.low === 1500
  && resolveBand(waterMetric, maleMemberNow).band.high === undefined, resolveBand(waterMetric, maleMemberNow))
check('sleep reference is 7-9',
  resolveBand(sleepMetric, femaleMemberNow).band.low === 7
  && resolveBand(sleepMetric, femaleMemberNow).band.high === 9, resolveBand(sleepMetric, femaleMemberNow))
check('water at 1500 is normal', evaluate(waterMetric, 1500, maleMemberNow).status === 'normal')
check('water below 1500 is low', evaluate(waterMetric, 1499, maleMemberNow).status === 'low')
check('sleep 7 and 9 are inside the band',
  evaluate(sleepMetric, 7, maleMemberNow).status === 'normal'
  && evaluate(sleepMetric, 9, maleMemberNow).status === 'normal')
check('sleep below 7 is low', evaluate(sleepMetric, 6.9, maleMemberNow).status === 'low')
check('sleep above 9 is high on the metric band', evaluate(sleepMetric, 9.1, maleMemberNow).status === 'high')

const metricCatalog = await service.metricCatalog('成员B')
const waterEntry = metricCatalog.metrics?.find((metric) => metric.code === 'water')
const sleepEntry = metricCatalog.metrics?.find((metric) => metric.code === 'sleep')
check('metric catalog exposes the water floor',
  metricCatalog.ok && waterEntry?.bandLow === 1500 && waterEntry?.bandHigh === null
  && waterEntry?.bandSource === 'general', waterEntry)
check('metric catalog exposes the sleep range',
  metricCatalog.ok && sleepEntry?.bandLow === 7 && sleepEntry?.bandHigh === 9, sleepEntry)
check('metric catalog keeps water/sleep editable',
  waterEntry?.targetMode === 'range' && sleepEntry?.targetMode === 'range')

// Record / query / stats / delete for the two new metrics.
const sleep95 = await service.record({ member: '成员2', measuredAt: stamp(0, 9), values: { sleep: 9.5 } })
const water1499 = await service.record({ member: '成员2', measuredAt: stamp(0, 10), values: { water: 1499 } })
check('water and sleep are recordable', sleep95.ok && water1499.ok, { sleep95, water1499 })
const waterQuery = await service.query({ member: '成员2', metrics: ['water'] })
check('water is queryable',
  waterQuery.ok && waterQuery.total === 1 && waterQuery.records[0].values.water === 1499, waterQuery)
const waterStats = await service.stats({ member: '成员2', metric: 'water' })
check('water stats uses the floor band',
  waterStats.sampleCount === 1 && waterStats.band.low === 1500 && waterStats.withinBandCount === 0, waterStats)
const sleepStats = await service.stats({ member: '成员2', metric: 'sleep' })
check('sleep stats keeps the 7-9 band',
  sleepStats.sampleCount === 1 && sleepStats.band.low === 7 && sleepStats.band.high === 9
  && sleepStats.withinBandCount === 0, sleepStats)
const metricOverview = await service.overview('成员2')
check('water 1499 is low in the latest view',
  metricOverview.latest.find((m) => m.code === 'water')?.status === 'low')
check('sleep 9.5 is high in the latest view',
  metricOverview.latest.find((m) => m.code === 'sleep')?.status === 'high')
const member2Lean = (await service.goalOverview('成员2')).goals.find((g) => g.code === 'lean_muscle')
const member2Sleep = member2Lean.accounts.find((account) => account.code === 'sleep')
const member2Water = member2Lean.accounts.find((account) => account.code === 'water')
check('account floor: sleep 9.5 still deposits',
  member2Sleep.today.met === true && member2Sleep.today.value === 9.5, member2Sleep.today)
check('account floor: water 1499 does not deposit',
  member2Water.today.met === false && member2Water.today.value === 1499, member2Water.today)
check('account deposit line describes the floor',
  /≥\s*7/.test(member2Sleep.depositLine ?? '') && /≥\s*1500/.test(member2Water.depositLine ?? ''),
  [member2Sleep.depositLine, member2Water.depositLine])
const water1500 = await service.record({ member: '成员2', measuredAt: stamp(0, 11), values: { water: 1500 } })
const sleep7 = await service.record({ member: '成员2', measuredAt: stamp(0, 11), values: { sleep: 7 } })
const waterStats2 = await service.stats({ member: '成员2', metric: 'water' })
check('water 1500 is within band in stats',
  waterStats2.sampleCount === 2 && waterStats2.withinBandCount === 1, waterStats2)
const sleepStats2 = await service.stats({ member: '成员2', metric: 'sleep' })
check('sleep 7 is within band in stats',
  sleepStats2.sampleCount === 2 && sleepStats2.withinBandCount === 1, sleepStats2)
const deletedNewMetrics = []
for (const id of [sleep95.record.id, water1499.record.id, water1500.record.id, sleep7.record.id]) {
  deletedNewMetrics.push(await service.deleteRecord(id))
}
check('water and sleep records are deletable',
  deletedNewMetrics.every((result) => result.ok)
  && (await service.stats({ member: '成员2', metric: 'water' })).sampleCount === 0
  && (await service.stats({ member: '成员2', metric: 'sleep' })).sampleCount === 0, deletedNewMetrics)

console.log('\n[goals: v3 guard rails]')
const noGoalReview = await service.goalReview('我')
check('goal review without a goal is rejected',
  noGoalReview.ok === false && /还没有/.test(noGoalReview.error ?? ''), noGoalReview)
const noSeason = await service.startGoalSeason('我')
check('starting a season without a goal is rejected',
  noSeason.ok === false && /还没有/.test(noSeason.error ?? ''), noSeason)
const metabolicSeason = await service.startGoalSeason('成员A', 'metabolic')
check('metabolic goal cannot start a season',
  metabolicSeason.ok === false && /不是赛季制/.test(metabolicSeason.error ?? ''), metabolicSeason)
const activateLean = await service.setGoal('我', { code: 'lean_muscle' })
check('activate lean-muscle goal', activateLean.ok && activateLean.created === true, activateLean)
let iLean = (await service.goalOverview('我')).goals.find((g) => g.code === 'lean_muscle')
check('new season starts at no=1 week=1 day=1',
  iLean.season.no === 1 && iLean.season.week === 1 && iLean.season.day === 1, iLean.season)
check('season is 84 days with 83 left and not ended',
  iLean.season.days === 84 && iLean.season.daysLeft === 83 && iLean.season.ended === false, iLean.season)
check('season dates are internally consistent',
  iLean.season.startedAt === stamp(0).slice(0, 10)
  && iLean.season.endsAt > iLean.season.startedAt
  && iLean.season.days - iLean.season.day === iLean.season.daysLeft, iLean.season)
check('season checkpoints 4/8/12 are not reached',
  iLean.season.checkpoints.map((checkpoint) => checkpoint.week).join(',') === '4,8,12'
  && iLean.season.checkpoints.every((checkpoint) => checkpoint.reached === false), iLean.season.checkpoints)
check('season label names the season and week',
  /第 1 赛季/.test(iLean.season.label) && /第 1 周/.test(iLean.season.label), iLean.season.label)
check('season progress stays below one day of 84',
  iLean.season.progress > 0 && iLean.season.progress < 1, iLean.season.progress)

console.log('\n[goals: lean muscle accounts]')
const today = stamp(0).slice(0, 10)
const fixtureRecords = [
  { at: stamp(0, 6), values: { weight: 70, bodyfat: 22, muscle: 30, waist: 85 } },
  { at: stamp(0, 7, 0), values: { training: 30 } },
  { at: stamp(0, 7, 30), values: { training: 10 } },
  { at: stamp(0, 7, 10), values: { sleep: 6.5 } },
  { at: stamp(0, 8, 30), values: { sleep: 7.5, protein: 90 } },
  { at: stamp(0, 9, 0), values: { water: 1600 } },
  { at: stamp(0, 20, 0), values: { weight: 69, bodyfat: 20.5, muscle: 30.5, waist: 84 } },
  { at: stamp(-1, 7, 0), values: { sleep: 6 } },
  { at: stamp(-1, 8, 0), values: { protein: 60 } },
  { at: stamp(-1, 8, 30), values: { protein: 40 } },
  { at: stamp(-1, 9, 0), values: { water: 800 } },
  { at: stamp(-1, 10, 0), values: { water: 900 } },
  { at: stamp(-1, 20, 0), values: { training: 40 } },
  { at: stamp(-2, 7, 0), values: { sleep: 8 } },
  { at: stamp(-2, 8, 0), values: { protein: 70 } },
  { at: stamp(-2, 9, 0), values: { water: 1400 } },
  { at: stamp(-2, 20, 0), values: { training: 20 } },
  { at: stamp(-3, 8, 0), values: { protein: 84 } },
  { at: stamp(-7, 20, 0), values: { training: 30 } },
]
for (const fixture of fixtureRecords) {
  const result = await service.record({ member: '我', measuredAt: fixture.at, values: fixture.values })
  if (!result.ok) check(`fixture record ${fixture.at}`, false, result)
}
iLean = (await service.goalOverview('我')).goals.find((g) => g.code === 'lean_muscle')
const accountOf = (code) => iLean.accounts.find((account) => account.code === code)
const trainingAcc = accountOf('training')
const proteinAcc = accountOf('protein')
const sleepAcc = accountOf('sleep')
const waterAcc = accountOf('water')
check('four behaviour accounts are returned in order',
  iLean.accounts.map((account) => account.code).join(',') === 'training,protein,sleep,water', iLean.accounts.map((a) => a.code))
check('training week met counts training days',
  trainingAcc.week.met === 3 && trainingAcc.week.target === 2 && trainingAcc.week.max === 7, trainingAcc.week)
check('training same-day minutes are summed',
  trainingAcc.today.value === 40 && trainingAcc.today.display === '40' && trainingAcc.today.met === true, trainingAcc.today)
check('protein target is resolved per kg',
  proteinAcc.kind === 'perKg' && /83–110/.test(proteinAcc.targetDisplay ?? '')
  && proteinAcc.today.met === true, proteinAcc.targetDisplay)
check('protein week counts met days', proteinAcc.week.met === 3, proteinAcc.week)
check('sleep same-day records take the maximum',
  sleepAcc.today.value === 7.5 && sleepAcc.today.display === '7.5' && sleepAcc.today.met === true, sleepAcc.today)
check('sleep week counts met days', sleepAcc.week.met === 2, sleepAcc.week)
const yesterday = stamp(-1).slice(0, 10)
const waterYesterday = waterAcc.week.days.find((day) => day.date === yesterday)
check('water same-day records are summed',
  waterYesterday?.value === 1700 && waterYesterday?.met === true, waterYesterday)
check('water week counts met days', waterAcc.week.met === 2, waterAcc.week)
check('account weekly labels match the counts',
  trainingAcc.week.label === '3/2 天' && proteinAcc.week.label === '3/7 天'
  && sleepAcc.week.label === '2/7 天' && waterAcc.week.label === '2/7 天',
  [trainingAcc.week.label, proteinAcc.week.label, sleepAcc.week.label, waterAcc.week.label])
const ledgerDays = trainingAcc.week.days
const weekdayOf = (date) => '日一二三四五六'[new Date(`${date}T12:00:00`).getDay()]
check('weekly ledger has seven day cells', ledgerDays.length === 7)
check('weekly ledger days ascend by date',
  ledgerDays.every((day, index) => index === 0 || ledgerDays[index - 1].date < day.date))
check('weekly ledger weekdays are valid and match the date',
  ledgerDays.every((day) => day.weekday.length === 1 && '日一二三四五六'.includes(day.weekday)
    && day.weekday === weekdayOf(day.date)))
check('weekly ledger starts six days ago and ends today',
  ledgerDays[0].date === stamp(-6).slice(0, 10) && ledgerDays[6].date === today)
check('weekly ledger cells carry record and pending flags',
  ledgerDays.every((day) => typeof day.hasRecord === 'boolean'
    && typeof day.met === 'boolean' && typeof day.pending === 'boolean'))
const weekly = iLean.weekly
check('weekly ledger totals four accounts x seven days',
  weekly.max === 28 && weekly.deposits === 10, weekly)
check('weekly window is the rolling seven days',
  weekly.start === stamp(-6).slice(0, 10) && weekly.end === today, weekly)
check('weekly record days counts distinct days', weekly.recordDays === 4, weekly.recordDays)
check('weekly photo days starts at zero', weekly.photoDays === 0, weekly.photoDays)
const cov = iLean.coverage
check('coverage counts only the four accounts', cov.evaluable === 4, cov)
check('coverage met and measured follow the accounts',
  cov.met === 4 && cov.measured === 4, cov)
check('coverage ratio and metRatio are pinned',
  cov.ratio === 1 && cov.metRatio === 1, cov)
check('coverage reports recency fields',
  cov.lastRecordAt === stamp(0, 20) && cov.recordDays7 === 4 && cov.recordDays30 === 5
  && cov.photoDays7 === 0, cov)
check('coverage deposit rate uses the weekly ledger', cov.depositRate7 === 0.36, cov.depositRate7)

const observeRows = iLean.targets.filter((target) => target.kind === 'observe')
check('body statement has four observe rows',
  observeRows.length === 4
  && observeRows.map((row) => row.metric).sort().join(',') === 'bodyfat,muscle,waist,weight',
  observeRows.map((row) => row.metric))
check('observe rows are never scored',
  observeRows.every((row) => row.status === 'observe'
    && !['normal', 'low', 'high', 'unknown', 'pending'].includes(row.status)))
const bodyfatRow = observeRows.find((row) => row.metric === 'bodyfat')
check('body fat band stays sex-specific',
  bodyfatRow.band.low === 10 && bodyfatRow.band.high === 20 && /男性/.test(bodyfatRow.band.label), bodyfatRow.band)
check('body fat is high against its band yet unscored',
  bodyfatRow.current === 20.5 && bodyfatRow.status === 'observe', bodyfatRow)
check('body fat carries season baseline and delta',
  bodyfatRow.baseline?.value === 22 && bodyfatRow.deltaSinceBaseline === -1.5
  && bodyfatRow.deltaDisplay === '-1.5%', bodyfatRow)
const weightObserve = observeRows.find((row) => row.metric === 'weight')
check('weight observe row carries no target bounds',
  weightObserve.low === null && weightObserve.high === null, weightObserve)
check('waist observe row uses the male cut-point for display',
  observeRows.find((row) => row.metric === 'waist')?.high === 90)
check('body fat is high but coverage stays 4/4',
  bodyfatRow.status === 'observe' && iLean.coverage.met === 4, iLean.coverage)

// Member-level personal targets must not turn observe rows into pass/fail bounds.
await service.updateMember('成员4', { targets: { bodyfat: 15 } })
const member4Lean = (await service.goalOverview('成员4')).goals.find((g) => g.code === 'lean_muscle')
const member4Bodyfat = member4Lean.targets.find((row) => row.metric === 'bodyfat')
const member4Weight = member4Lean.targets.find((row) => row.metric === 'weight')
check('member-level weight target does not leak into the observe row',
  member4Weight.high === null && member4Weight.low === null, member4Weight)
check('member-level body fat target does not leak into the observe band',
  member4Bodyfat.high === 20 && member4Bodyfat.band.high === 20, member4Bodyfat)

// Without a weight the protein account is pending, not missed.
await service.setGoal('成员0', { code: 'lean_muscle' })
const member0Lean = (await service.goalOverview('成员0')).goals.find((g) => g.code === 'lean_muscle')
const member0Protein = member0Lean.accounts.find((account) => account.code === 'protein')
check('protein account is pending without a weight',
  member0Protein.pending === true && member0Protein.today.pending === true, member0Protein)
check('pending protein day is neither met nor missed',
  member0Protein.today.hasRecord === true && member0Protein.today.met === false
  && member0Protein.week.met === 0, member0Protein.today)
check('pending protein does not enter the weekly deposits',
  member0Lean.weekly.deposits === 0, member0Lean.weekly)
check('pending protein is measured but not met',
  member0Lean.coverage.measured === 1 && member0Lean.coverage.met === 0, member0Lean.coverage)

// Recording body composition must never change the score.
const member3Before = (await service.goalOverview('成员3')).goals.find((g) => g.code === 'lean_muscle')
await service.record({ member: '成员3', measuredAt: stamp(0, 10), values: { bodyfat: 15, weight: 60, muscle: 25, waist: 75 } })
const member3After = (await service.goalOverview('成员3')).goals.find((g) => g.code === 'lean_muscle')
check('body composition changes never change coverage',
  member3Before.coverage.met === 0 && member3Before.coverage.measured === 0
  && member3After.coverage.met === member3Before.coverage.met
  && member3After.coverage.measured === member3Before.coverage.measured
  && member3After.coverage.evaluable === 4, { before: member3Before.coverage, after: member3After.coverage })
check('recorded body composition stays observe-only',
  member3After.targets.find((row) => row.metric === 'bodyfat')?.status === 'observe'
  && member3After.targets.find((row) => row.metric === 'bodyfat')?.current === 15)

console.log('\n[goals: season review]')
let reviewNow = (await service.goalOverview('我')).goals.find((g) => g.code === 'lean_muscle')
let seasonReview = reviewNow.seasonReview
check('season review exists before photos',
  seasonReview.photoCount === 0 && seasonReview.photoDays === 0, seasonReview)
check('season review starts with one day and four deposits',
  seasonReview.days === 1 && seasonReview.deposits === 4 && seasonReview.max === 4
  && seasonReview.rate === 1, seasonReview)
check('season review byAccount mirrors the accounts',
  seasonReview.byAccount.length === 4 && seasonReview.byAccount.every((row) => {
    const account = reviewNow.accounts.find((item) => item.code === row.code)
    return account && row.deposits === account.season.deposits
      && row.max === account.season.max && row.rate === account.season.rate
      && row.label === `${row.deposits}/${row.max} 格`
  }), seasonReview.byAccount)
check('season review deposits add up',
  seasonReview.deposits === seasonReview.byAccount.reduce((sum, row) => sum + row.deposits, 0)
  && seasonReview.max === seasonReview.byAccount.reduce((sum, row) => sum + row.max, 0))
check('season review training days and target',
  seasonReview.trainingDays === 1 && seasonReview.trainingTarget === 2, seasonReview)
check('season review has four body statement rows',
  seasonReview.body.length === 4
  && seasonReview.body.map((row) => row.metric).sort().join(',') === 'bodyfat,muscle,waist,weight',
  seasonReview.body.map((row) => row.metric))
const reviewBodyfat = seasonReview.body.find((row) => row.metric === 'bodyfat')
check('season review body carries baseline/latest/delta/band',
  reviewBodyfat.baseline === 22 && reviewBodyfat.latest === 20.5 && reviewBodyfat.delta === -1.5
  && reviewBodyfat.band.high === 20 && /男性/.test(reviewBodyfat.band.label), reviewBodyfat)
check('season review body carries a signed delta display', reviewBodyfat.deltaDisplay === '-1.5%')
check('season review carries the no-promise note', /不构成效果承诺/.test(seasonReview.note ?? ''))
check('season review record days is one', seasonReview.recordDays === 1, seasonReview.recordDays)

const firstSeasonPhoto = await service.uploadPhoto('我', { dataBase64: PNG_1X1, takenAt: stamp(0, 12) })
const afterFirstPhoto = (await service.goalOverview('我')).goals.find((g) => g.code === 'lean_muscle')
check('progress photo is stored for the season', firstSeasonPhoto.ok, firstSeasonPhoto)
check('photo evidence increases the season counts',
  afterFirstPhoto.seasonReview.photoCount === 1 && afterFirstPhoto.seasonReview.photoDays === 1
  && afterFirstPhoto.weekly.photoDays === 1 && afterFirstPhoto.coverage.photoDays7 === 1,
  { review: afterFirstPhoto.seasonReview, weekly: afterFirstPhoto.weekly, coverage: afterFirstPhoto.coverage })
const secondSeasonPhoto = await service.uploadPhoto('我', { dataBase64: PNG_1X1, takenAt: stamp(0, 13) })
const afterSecondPhoto = (await service.goalOverview('我')).goals.find((g) => g.code === 'lean_muscle')
check('second photo increments the count but not the days',
  secondSeasonPhoto.ok && afterSecondPhoto.seasonReview.photoCount === 2
  && afterSecondPhoto.seasonReview.photoDays === 1, afterSecondPhoto.seasonReview)
const inspirationForSeason = await service.uploadPhoto('我', {
  dataBase64: PNG_1X1, takenAt: stamp(0, 14), kind: 'inspiration',
})
const afterInspiration = (await service.goalOverview('我')).goals.find((g) => g.code === 'lean_muscle')
check('inspiration images are not counted as season evidence',
  inspirationForSeason.ok && afterInspiration.seasonReview.photoCount === 2
  && afterInspiration.seasonReview.photoDays === 1
  && afterInspiration.weekly.photoDays === 1
  && afterInspiration.coverage.photoDays7 === 1, afterInspiration.seasonReview)

const recordsBeforeSeason = (await service.query({ member: '我', limit: 500 })).total
const photosBeforeSeason = (await service.listPhotos('我')).total
const startedSeason = await service.startGoalSeason('我', 'lean_muscle')
check('starting a new season succeeds',
  startedSeason.ok && startedSeason.seasonNo === 2, startedSeason)
const afterSeasonStart = (await service.goalOverview('我')).goals.find((g) => g.code === 'lean_muscle')
check('new season resets to week 1 and keeps 84 days',
  afterSeasonStart.season.no === 2 && afterSeasonStart.season.week === 1
  && afterSeasonStart.season.day === 1 && afterSeasonStart.season.daysLeft === 83
  && afterSeasonStart.season.ended === false, afterSeasonStart.season)
check('starting a season keeps every record',
  (await service.query({ member: '我', limit: 500 })).total === recordsBeforeSeason, recordsBeforeSeason)
check('starting a season keeps every photo',
  (await service.listPhotos('我')).total === photosBeforeSeason, photosBeforeSeason)
check('starting a season keeps the photo evidence',
  afterSeasonStart.seasonReview.photoCount === 2 && afterSeasonStart.seasonReview.photoDays === 1,
  afterSeasonStart.seasonReview)

console.log('\n[goals: review tool]')
const review = await service.goalReview('我')
check('goal review selects the lean-muscle goal',
  review.ok === true && review.code === 'lean_muscle', review)
check('goal review returns season/weekly/seasonReview/accounts/body/coverage',
  ['season', 'weekly', 'seasonReview', 'accounts', 'body', 'coverage']
    .every((key) => review[key] !== undefined), Object.keys(review))
check('goal review body is the four observe rows',
  review.body.length === 4 && review.body.every((row) => row.kind === 'observe'))
check('goal review accounts match the dashboard',
  review.accounts.length === 4
  && review.accounts.every((account, index) => account.code === afterSeasonStart.accounts[index].code))
check('goal review exposes no advice or suggestion fields',
  bannedOutputKeys(review).length === 0, bannedOutputKeys(review))
const reviewWrongCode = await service.goalReview('我', { code: 'metabolic' })
check('goal review rejects a goal the member does not have',
  reviewWrongCode.ok === false, reviewWrongCode)
const reviewUnknownMember = await service.goalReview('不存在的人')
check('goal review rejects an unknown member',
  reviewUnknownMember.ok === false && reviewUnknownMember.needsMember === true, reviewUnknownMember)

console.log('\n[goals: compatibility]')
// A pre-v3 binding has no seasonStartedAt/seasonNo/targets: derive the season
// window from startedAt instead of crashing.
const member2 = await service.findMember('成员2')
const legacyStartedAt = Date.now() - 28 * 24 * 60 * 60 * 1000
await service.goals.update((doc) => ({
  ...doc,
  goals: doc.goals.map((item) => {
    if (item.memberId !== member2.id || item.code !== 'lean_muscle') return item
    const { seasonStartedAt, seasonNo, targets, ...legacy } = item
    return { ...legacy, startedAt: legacyStartedAt }
  }),
}))
const legacyGoal = (await service.goalOverview('成员2')).goals.find((g) => g.code === 'lean_muscle')
check('legacy binding derives a season from startedAt',
  legacyGoal?.season?.no === 1 && legacyGoal.season.week === 5 && legacyGoal.season.day === 29,
  legacyGoal?.season)
check('legacy season marks W4 reached but not W8',
  legacyGoal.season.checkpoints.find((checkpoint) => checkpoint.week === 4)?.reached === true
  && legacyGoal.season.checkpoints.find((checkpoint) => checkpoint.week === 8)?.reached === false,
  legacyGoal.season.checkpoints)
check('legacy binding still returns the four accounts',
  legacyGoal.accounts.length === 4 && legacyGoal.coverage.evaluable === 4, legacyGoal.accounts.length)

// A season older than 84 days ends: week caps at 12, daysLeft at 0 and every
// checkpoint is reached. (No clock injection: the binding supplies the start.)
const endedStartedAt = Date.now() - 90 * 24 * 60 * 60 * 1000
await service.goals.update((doc) => ({
  ...doc,
  goals: doc.goals.map((item) => item.memberId === member2.id && item.code === 'lean_muscle'
    ? { ...item, startedAt: endedStartedAt }
    : item),
}))
const endedGoal = (await service.goalOverview('成员2')).goals.find((g) => g.code === 'lean_muscle')
check('season older than 84 days is ended and capped at week 12',
  endedGoal?.season?.ended === true && endedGoal.season.week === 12
  && endedGoal.season.daysLeft === 0 && endedGoal.season.progress === 1, endedGoal?.season)
check('ended season marks every checkpoint reached',
  endedGoal.season.checkpoints.every((checkpoint) => checkpoint.reached === true),
  endedGoal.season.checkpoints)
check('ended season never reports negative time left', endedGoal.season.daysLeft >= 0)

// The metabolic goal keeps its old seven-row target dashboard.
const dadMetabolic = (await service.goalOverview('成员A')).goals.find((g) => g.code === 'metabolic')
check('metabolic goal keeps seven target rows',
  dadMetabolic.targets.length === 7 && dadMetabolic.coverage.evaluable === 7, dadMetabolic.coverage)
check('metabolic goal has no season or accounts',
  dadMetabolic.season === null && dadMetabolic.accounts.length === 0
  && dadMetabolic.weekly === null && dadMetabolic.seasonReview === null)
check('metabolic waist target uses the male cut-point',
  dadMetabolic.targets.find((row) => row.metric === 'waist')?.high === 90)

// A corrupt goals.json must degrade to a goal error, never take the panel down.
const corruptDir = await mkdtemp(join(tmpdir(), 'dsh-health-corrupt-'))
const corruptSeed = new HealthService(corruptDir)
await corruptSeed.init()
await writeFile(join(corruptDir, 'goals.json'), '{"version":1,"goals":[}', 'utf8')
const degraded = new HealthService(corruptDir)
const degradedOverview = await degraded.overview('我')
check('corrupt goals.json degrades without taking the panel down',
  degradedOverview.ok === true && typeof degradedOverview.goalError === 'string'
  && degradedOverview.goals.length === 0 && Array.isArray(degradedOverview.latest),
  { goalError: degradedOverview.goalError })
const degradedGoalOverview = await degraded.goalOverview('我')
check('corrupt goals.json reports goal errors instead of throwing',
  degradedGoalOverview.ok === false && /读取失败|格式损坏/.test(degradedGoalOverview.error ?? ''),
  degradedGoalOverview)
await rm(corruptDir, { recursive: true, force: true })

console.log('\n[safety: output lexicon]')
const reviewUnsafe = unsafeClaims(review)
check('goal review text avoids diagnosis/medication/plan/recipe claims',
  reviewUnsafe.length === 0, reviewUnsafe)
const templateUnsafe = unsafeClaims(leanTpl)
check('lean template text avoids diagnosis/medication/plan/recipe claims',
  templateUnsafe.length === 0, templateUnsafe)
check('goal review contains no advice/suggestion/diagnosis keys',
  bannedOutputKeys(review).length === 0, bannedOutputKeys(review))
check('goal templates contain no advice/suggestion/diagnosis keys',
  bannedOutputKeys(templates.templates).length === 0, bannedOutputKeys(templates.templates))
check('season note states a change is not an effect promise',
  /仅供记录参考/.test(seasonReview.note ?? '') && /不构成效果承诺/.test(seasonReview.note ?? ''))
check('lean disclaimer separates management goal from diagnosis',
  /非医学标准/.test(leanTpl.disclaimer ?? '') && /不构成/.test(leanTpl.disclaimer ?? ''),
  leanTpl.disclaimer)

console.log('\n[documents]')
const doc = await service.addDocument('成员A', { type: 'lab_report', title: '2026 体检报告', docDate: '2026-11-10', note: '年度体检' })
check('add document', doc.ok && doc.document.type === 'lab_report', doc)
const docBad = await service.addDocument('成员A', { type: 'nonsense' })
check('bad document type rejected', !docBad.ok, docBad)
const docList = await service.listDocuments('成员A')
check('document list has 1 item', docList.ok && docList.total === 1, docList)
const docFilter = await service.listDocuments('成员A', { type: 'lab_report' })
check('document type filter works', docFilter.total === 1, docFilter)
const docRemove = await service.removeDocument('成员A', doc.document.id)
check('remove document', docRemove.ok, docRemove)

console.log('\n[deletion cascades all domains]')
const dadPhoto = await service.uploadPhoto('成员A', { dataBase64: PNG_1X1, takenAt: '2026-11-10' })
check('dad progress photo uploaded', dadPhoto.ok)
const memberDeleteBlocked = await service.deleteMember('成员A', false)
check('member delete blocked while data exists', !memberDeleteBlocked.ok && /管理目标/.test(memberDeleteBlocked.error), memberDeleteBlocked)
const memberDelete = await service.deleteMember('成员A', true)
check('member delete cascades records/conditions/documents/goals/photos',
  memberDelete.ok && memberDelete.removedRecords > 0 && memberDelete.removedGoals === 1
  && memberDelete.removedPhotos === 1, memberDelete)

console.log('\n[persistence]')
const reopened = new HealthService(dir)
await reopened.init()
check('data survives reload', (await reopened.listMembers()).length === MAX_MEMBERS - 1)
const reopenedGoals = await reopened.goalOverview('成员B')
check('goal bindings survive reload', reopenedGoals.ok && reopenedGoals.goals.some((g) => g.code === 'lean_muscle'))
check('goals document is tracked', reopened.dataPaths.goals.endsWith('goals.json'))

await rm(dir, { recursive: true, force: true })
const totalChecks = passes + failures
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`} · ${passes}/${totalChecks} checks`)
process.exit(failures === 0 ? 0 : 1)
