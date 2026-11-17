/**
 * Metabolic ledger ("代谢对账簿") engine.
 *
 * The metabolic goal is deliberately *not* a scored indicator dashboard. It
 * separates two kinds of things:
 *
 *  - behaviour accounts (测 / 吃 / 动 / 睡): things the user can control today,
 *    counted as deposits;
 *  - an indicator statement (腰围 / 血压 / 空腹血糖 / TG / HDL-C ...): noisy
 *    results, shown only against population reference bands, personal doctor-set
 *    targets, averages and trends.
 *
 * It also builds the 12-week review cycle, the weekly ledger and the "visit
 * summary" — a copyable page of facts the user can take to a clinician. Nothing
 * here diagnoses, stages, prescribes, or promises an outcome; every number is a
 * descriptive statistic or a reference band with a source.
 *
 * Pure functions only: the caller passes records and the resolved target specs,
 * so the panel and the agent tools share exactly the same calculation.
 */

import { metricOf, formatValue } from './metrics.js'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/** Metrics that identify a home-monitoring deposit. */
const MEASURE_METRICS = ['sbp', 'dbp', 'fpg', 'ppg', 'waist', 'weight']
/** Metrics that identify a meal record. */
const MEAL_METRICS = ['kcal', 'protein']
/** Lab-only metrics: their presence is enough to treat a record as a lab entry. */
const LAB_METRICS = ['hba1c', 'tc', 'tg', 'ldl', 'hdl', 'ua']
/** Lab panel fields, in display order. */
export const LAB_PANEL_METRICS = ['fpg', 'ppg', 'hba1c', 'tc', 'tg', 'ldl', 'hdl', 'ua']
/** Core metabolic components shown on the statement. */
export const CORE_CODES = ['bp', 'waist', 'fpg', 'tg', 'hdl']
/** Extra rows, collapsed by default. */
export const EXTRA_CODES = ['ua', 'ldl', 'hba1c', 'ppg', 'weight', 'sugary']

const MEAL_NAMES = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

function parseAt(text) {
  return new Date(String(text).replace(' ', 'T')).getTime()
}

function startOfLocalDay(value) {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addLocalDays(day, offset) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset)
}

function dayDiff(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / DAY_MS)
}

function formatDateText(day) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

function weekdayLabel(day) {
  return '日一二三四五六'[day.getDay()]
}

function dayKeyOf(text) {
  return formatDateText(startOfLocalDay(parseAt(text)))
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatClock(ms) {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function average(values) {
  const clean = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (clean.length === 0) return null
  return clean.reduce((sum, value) => sum + value, 0) / clean.length
}

function round(value, decimals = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Number(value.toFixed(decimals))
}

function formatSignedDelta(delta, metric) {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return null
  const text = formatValue(metric, Math.abs(delta))
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
  const unit = metric?.unit ?? ''
  return unit === '%' ? `${sign}${text}%` : `${sign}${text} ${unit}`.trim()
}

function statusOf(value, band) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown'
  const low = typeof band?.low === 'number' ? band.low : null
  const high = typeof band?.high === 'number' ? band.high : null
  if (low !== null && value < low) return 'below'
  if (high !== null && value > high) return 'above'
  if (low === null && high === null) return 'unknown'
  return 'within'
}

const STATUS_TEXT = {
  within: '参考内',
  above: '高于参考',
  below: '低于参考',
  unknown: '暂无数据',
}

function boundText(value, metric) {
  const digits = metric?.decimals ?? 1
  const text = Number(value).toFixed(digits)
  return text.endsWith('.0') && digits === 1 ? text.slice(0, -2) : text
}

/** Build a neutral reference label from the resolved bounds. */
function bandLabelFrom(spec, metric, prefix = '参考') {
  if (!spec) return ''
  const unit = metric?.unit ?? ''
  const low = typeof spec.low === 'number' ? spec.low : null
  const high = typeof spec.high === 'number' ? spec.high : null
  const suffix = unit === '%' ? '%' : unit ? ` ${unit}` : ''
  if (low !== null && high !== null) return `${prefix} ${boundText(low, metric)}–${boundText(high, metric)}${suffix}`
  if (high !== null) return `${prefix} <${boundText(high, metric)}${suffix}`
  if (low !== null) return `${prefix} ≥${boundText(low, metric)}${suffix}`
  return ''
}

function rowBand(spec, metric, fallbackLabel) {
  if (!spec) {
    return { low: null, high: null, label: fallbackLabel ?? '', source: 'general' }
  }
  const personal = spec.source === 'goal-override' || spec.source === 'member-override'
  const label = bandLabelFrom(spec, metric, personal ? '个人目标' : '参考')
    || fallbackLabel
    || ''
  return {
    low: typeof spec.low === 'number' ? spec.low : null,
    high: typeof spec.high === 'number' ? spec.high : null,
    label,
    source: spec.bandSource ?? spec.source ?? 'template',
  }
}

function specOf(resolved, code) {
  return (resolved ?? []).find((item) => item.metric === code) ?? null
}

function recordsWith(records, code) {
  return records
    .filter((record) => typeof record.values?.[code] === 'number')
    .slice()
    .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : a.measuredAt > b.measuredAt ? 1 : 0))
}

function seriesValues(records, code) {
  return recordsWith(records, code).map((record) => record.values[code])
}

function latestWith(records, code) {
  const list = recordsWith(records, code)
  return list.length > 0 ? list[list.length - 1] : null
}

/** Records since a local day (inclusive). */
function sinceDay(records, day) {
  const start = day.getTime()
  return records.filter((record) => parseAt(record.measuredAt) >= start)
}

/** Daily aggregate of one metric; sleep takes the max, everything else sums. */
function dayTotal(records, code, day) {
  const key = formatDateText(day)
  const values = records
    .filter((record) => typeof record.values?.[code] === 'number' && dayKeyOf(record.measuredAt) === key)
    .map((record) => record.values[code])
  if (values.length === 0) return undefined
  if (code === 'sleep') return Math.max(...values)
  return values.reduce((sum, value) => sum + value, 0)
}

function mealRecordsOn(records, day) {
  const key = formatDateText(day)
  return records.filter((record) => {
    if (dayKeyOf(record.measuredAt) !== key) return false
    return Boolean(record.mealType)
      || MEAL_METRICS.some((code) => typeof record.values?.[code] === 'number')
  })
}

function measureRecordsOn(records, day) {
  const key = formatDateText(day)
  return records.filter((record) => {
    if (dayKeyOf(record.measuredAt) !== key) return false
    if (record.context === 'lab') return false
    return MEASURE_METRICS.some((code) => typeof record.values?.[code] === 'number')
  })
}

function isLabRecord(record) {
  if (!record) return false
  if (record.context === 'lab') return true
  return LAB_METRICS.some((code) => typeof record.values?.[code] === 'number')
}

function labRecords(records) {
  return records
    .filter(isLabRecord)
    .slice()
    .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : a.measuredAt > b.measuredAt ? 1 : 0))
}

/** Seven local days ending on `today`, oldest first. */
function weekDays(today) {
  const out = []
  for (let offset = -6; offset <= 0; offset += 1) out.push(addLocalDays(today, offset))
  return out
}

function cycleDays(season) {
  const out = []
  for (let offset = 0; offset < season.capped; offset += 1) out.push(addLocalDays(season.startDay, offset))
  return out
}

/** The account definitions. Targets may be overridden by the goal's resolved specs. */
function accountDefs(resolved) {
  const activitySpec = specOf(resolved, 'activity')
  const sleepSpec = specOf(resolved, 'sleep')
  const moveDays = activitySpec?.kind === 'weeklyDays' ? Number(activitySpec.days) || 5 : 5
  const sleepFloor = typeof sleepSpec?.low === 'number' ? sleepSpec.low : 7
  const sleepHigh = typeof sleepSpec?.high === 'number' ? sleepSpec.high : 9
  return [
    {
      code: 'measure',
      name: '测',
      role: '证据',
      metric: 'measure',
      unit: '次',
      kind: 'monitor',
      cadence: 'weekly',
      target: 3,
      targetDisplay: '每周 ≥3 天',
      depositLine: '当天有家庭监测记录',
    },
    {
      code: 'diet',
      name: '吃',
      role: '记录',
      metric: 'diet',
      unit: '餐',
      kind: 'diet',
      cadence: 'weekly',
      target: 4,
      targetDisplay: '每周 ≥4 天',
      depositLine: '当天记录至少一餐',
    },
    {
      code: 'move',
      name: '动',
      role: '活动',
      metric: 'activity',
      unit: 'min',
      kind: 'activity',
      cadence: 'weekly',
      target: moveDays,
      floor: 30,
      targetDisplay: `每周 ≥${moveDays} 天 · 累计 ≥150 分钟`,
      depositLine: '当天 ≥30 分钟',
    },
    {
      code: 'sleep',
      name: '睡',
      role: '修复',
      metric: 'sleep',
      unit: 'h',
      kind: 'range',
      cadence: 'weekly',
      target: 5,
      floor: sleepFloor,
      high: sleepHigh,
      targetDisplay: `每周 ≥5 天 ≥${sleepFloor} h`,
      depositLine: `≥${sleepFloor} h/日`,
    },
  ]
}

function dayEntry(record, day, def) {
  const value = (() => {
    if (def.code === 'measure') {
      const count = measureRecordsOn(record, day).length
      return count > 0 ? count : undefined
    }
    if (def.code === 'diet') {
      const meals = mealRecordsOn(record, day)
      return meals.length > 0 ? meals.length : undefined
    }
    return dayTotal(record, def.metric, day)
  })()
  let met = false
  if (typeof value === 'number') {
    if (def.code === 'move') met = value >= (def.floor ?? 30)
    else if (def.code === 'sleep') met = value >= (def.floor ?? 7)
    else met = value > 0
  }
  let display = null
  if (typeof value === 'number') {
    if (def.code === 'measure') display = `${value} 次`
    else if (def.code === 'diet') {
      const meals = mealRecordsOn(record, day)
      const last = meals[meals.length - 1]
      const slot = MEAL_NAMES[last?.mealType] ?? '用餐'
      const kcal = num(last?.values?.kcal)
      display = kcal !== undefined ? `${slot} · ${Math.round(kcal)} kcal` : `${value} 餐`
    } else if (def.code === 'move') display = `${Math.round(value)} min`
    else if (def.code === 'sleep') display = `${value.toFixed(1)} h`
    else display = String(value)
  }
  return {
    date: formatDateText(day),
    weekday: weekdayLabel(day),
    value: value ?? null,
    display,
    met,
    hasRecord: typeof value === 'number',
    pending: false,
  }
}

function buildAccounts(records, season, resolved) {
  const days = weekDays(season.today)
  const seasonWindow = cycleDays(season)
  return accountDefs(resolved).map((def) => {
    const week = days.map((day) => dayEntry(records, day, def))
    const seasonEntries = seasonWindow.map((day) => dayEntry(records, day, def))
    const metWeek = week.filter((entry) => entry.met).length
    const deposits = seasonEntries.filter((entry) => entry.met).length
    const weekMinutes = def.code === 'move'
      ? week.reduce((sum, entry) => sum + (entry.value ?? 0), 0)
      : null
    const label = def.code === 'move'
      ? `${metWeek}/${def.target} 天 · ${Math.round(weekMinutes)} 分钟`
      : `${metWeek}/${def.target} 天`
    return {
      code: def.code,
      name: def.name,
      role: def.role,
      metric: def.metric,
      unit: def.unit,
      kind: def.kind,
      cadence: def.cadence,
      targetDisplay: def.targetDisplay,
      depositLine: def.depositLine,
      pending: false,
      today: week[week.length - 1],
      week: {
        met: metWeek,
        target: def.target,
        max: 7,
        label,
        days: week,
      },
      ...(typeof weekMinutes === 'number' ? { weekMinutes } : {}),
      season: {
        deposits,
        max: season.capped,
        rate: season.capped > 0 ? Number((deposits / season.capped).toFixed(2)) : 0,
        label: `${deposits} 天`,
      },
    }
  })
}

function buildWeekly(records, accounts, season) {
  const start = addLocalDays(season.today, -6)
  const inWindow = (text) => {
    const day = startOfLocalDay(parseAt(text))
    return dayDiff(start, day) >= 0 && dayDiff(day, season.today) >= 0
  }
  const weekRecords = records.filter((record) => inWindow(record.measuredAt))
  const recordDays = new Set(weekRecords.map((record) => dayKeyOf(record.measuredAt))).size
  const bpDays = new Set(
    weekRecords
      .filter((record) => typeof record.values?.sbp === 'number' || typeof record.values?.dbp === 'number')
      .map((record) => dayKeyOf(record.measuredAt)),
  ).size
  const mealDays = new Set(
    weekRecords
      .filter((record) => Boolean(record.mealType) || MEAL_METRICS.some((code) => typeof record.values?.[code] === 'number'))
      .map((record) => dayKeyOf(record.measuredAt)),
  ).size
  const activityMinutes = weekRecords.reduce(
    (sum, record) => sum + (typeof record.values?.activity === 'number' ? record.values.activity : 0),
    0,
  )
  const deposits = accounts.reduce((sum, account) => sum + (account.week?.met ?? 0), 0)
  const labDone = labRecords(records).some((record) => inWindow(record.measuredAt))
  return {
    start: formatDateText(start),
    end: formatDateText(season.today),
    deposits,
    max: accounts.length * 7,
    recordDays,
    bpDays,
    mealDays,
    activityMinutes,
    labDone,
  }
}

/**
 * Home blood pressure: mean of the last 7 days. When at least seven distinct
 * days exist, the earliest day is dropped, following the home-monitoring
 * protocol (discard day 1 and average the remaining six). A single reading is
 * never presented as a verdict.
 */
function buildBloodPressureRow(records, resolved, season) {
  const bpSpec = specOf(resolved, 'sbp')
  const dbpSpec = specOf(resolved, 'dbp')
  const personalBp = bpSpec?.source === 'goal-override'
    || bpSpec?.source === 'member-override'
    || dbpSpec?.source === 'goal-override'
    || dbpSpec?.source === 'member-override'
  const highSys = typeof bpSpec?.high === 'number' ? bpSpec.high : 130
  const highDia = typeof dbpSpec?.high === 'number' ? dbpSpec.high : 85
  const band = {
    low: null,
    high: highSys,
    highDia,
    label: `${personalBp ? '个人目标' : '代谢组分参考'} <${Math.round(highSys)}/${Math.round(highDia)}`,
    source: bpSpec?.bandSource ?? 'template',
  }
  const weekStart = addLocalDays(season.today, -6)
  const weekRecords = records
    .filter((record) => parseAt(record.measuredAt) >= weekStart.getTime())
    .filter((record) => typeof record.values?.sbp === 'number' || typeof record.values?.dbp === 'number')
    .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1))
  const days = [...new Set(weekRecords.map((record) => dayKeyOf(record.measuredAt)))].sort()
  let used = weekRecords
  let droppedFirstDay = false
  if (days.length >= 7) {
    const drop = days[0]
    used = weekRecords.filter((record) => dayKeyOf(record.measuredAt) !== drop)
    droppedFirstDay = true
  }
  const sysValues = used.map((record) => record.values.sbp).filter((value) => typeof value === 'number')
  const diaValues = used.map((record) => record.values.dbp).filter((value) => typeof value === 'number')
  const morning = used.filter((record) => record.context === 'morning')
  const evening = used.filter((record) => record.context === 'evening')
  const count7 = used.length
  let currentSys = average(sysValues)
  let currentDia = average(diaValues)
  let measuredAt = used.length > 0 ? used[used.length - 1].measuredAt : null
  let valueLabel = '近 7 天均值'

  if (count7 === 0) {
    const latest = latestWith(records, 'sbp')
    if (latest) {
      currentSys = latest.values.sbp
      currentDia = typeof latest.values.dbp === 'number' ? latest.values.dbp : null
      measuredAt = latest.measuredAt
      valueLabel = '最近一次 · 仅参考'
    }
  } else if (count7 === 1) {
    const only = used[0]
    currentSys = only.values.sbp
    currentDia = typeof only.values.dbp === 'number' ? only.values.dbp : null
    valueLabel = '单次 · 仅参考'
  } else {
    valueLabel = '近 7 天均值'
  }

  const hasAnyReading = typeof currentSys === 'number' || typeof currentDia === 'number'
  const single = count7 <= 1 && hasAnyReading
  const status = single
    ? 'single'
    : statusOfTwo(currentSys, currentDia, band.high, band.highDia)
  const statusText = status === 'single' ? '单次 · 仅参考' : STATUS_TEXT[status] ?? '暂无数据'
  const previousStart = addLocalDays(season.today, -13)
  const previousEnd = addLocalDays(season.today, -7)
  const previous = records.filter((record) => {
    if (record.context === 'lab') return false
    const at = parseAt(record.measuredAt)
    return at >= previousStart.getTime() && at < previousEnd.getTime()
  })
  const previousSys = average(previous.map((record) => record.values.sbp))
  const previousDia = average(previous.map((record) => record.values.dbp))
  const deltaSys = typeof currentSys === 'number' && typeof previousSys === 'number'
    ? round(currentSys - previousSys, 0)
    : null
  const deltaDia = typeof currentDia === 'number' && typeof previousDia === 'number'
    ? round(currentDia - previousDia, 0)
    : null
  const deltaDisplay = deltaSys !== null || deltaDia !== null
    ? `${deltaSys !== null ? (deltaSys > 0 ? '+' : '') + deltaSys : '—'}/${deltaDia !== null ? (deltaDia > 0 ? '+' : '') + deltaDia : '—'} mmHg（较前 7 天）`
    : null
  const usedDays = new Set(used.map((record) => dayKeyOf(record.measuredAt))).size

  return {
    code: 'bp',
    name: '血压',
    unit: 'mmHg',
    role: 'core',
    kind: 'homeAvg',
    current: typeof currentSys === 'number' ? round(currentSys, 0) : null,
    currentDisplay: formatBp(currentSys, currentDia),
    valueLabel,
    measuredAt,
    avg7: typeof currentSys === 'number' ? round(currentSys, 0) : null,
    avg7Display: formatBp(currentSys, currentDia),
    count7,
    days7: usedDays,
    droppedFirstDay,
    morningAvg: formatBp(average(morning.map((record) => record.values.sbp)), average(morning.map((record) => record.values.dbp))),
    eveningAvg: formatBp(average(evening.map((record) => record.values.sbp)), average(evening.map((record) => record.values.dbp))),
    band,
    status,
    statusText,
    single,
    deltaPrev7: deltaSys,
    deltaDisplay,
    note: '代谢综合征组分切点 130/85；家庭血压参考界值 135/85；诊室参考界值 140/90。是否患病需医生判断。近 7 天有 7 个以上测量日时，按家庭血压规范弃首日取后 6 天均值；不删除任何高值。',
  }
}

function statusOfTwo(sys, dia, highSys, highDia) {
  if (typeof sys !== 'number' && typeof dia !== 'number') return 'unknown'
  if (typeof sys === 'number' && typeof highSys === 'number' && sys > highSys) return 'above'
  if (typeof dia === 'number' && typeof highDia === 'number' && dia > highDia) return 'above'
  return 'within'
}

function formatBp(sys, dia) {
  if (typeof sys !== 'number' && typeof dia !== 'number') return null
  const s = typeof sys === 'number' ? String(Math.round(sys)) : '—'
  const d = typeof dia === 'number' ? String(Math.round(dia)) : '—'
  return `${s}/${d}`
}

function buildWaistRow(records, resolved) {
  const spec = specOf(resolved, 'waist')
  const metric = metricOf('waist')
  const list = recordsWith(records, 'waist')
  const latest = list.length > 0 ? list[list.length - 1] : null
  const current = latest?.values.waist ?? null
  const band = rowBand(spec, metric)
  const monthAgo = Date.now() - 30 * DAY_MS
  const recent = list.filter((record) => parseAt(record.measuredAt) >= monthAgo)
  const delta30 = recent.length >= 2
    ? round(recent[recent.length - 1].values.waist - recent[0].values.waist, 0)
    : null
  const status = statusOf(current, band)
  return {
    code: 'waist',
    name: '腰围',
    unit: 'cm',
    role: 'core',
    kind: 'latest',
    current,
    currentDisplay: current === null ? null : formatValue(metric, current),
    valueLabel: '最近一次',
    measuredAt: latest?.measuredAt ?? null,
    delta30,
    deltaDisplay: delta30 === null ? null : formatSignedDelta(delta30, metric),
    band,
    status,
    statusText: STATUS_TEXT[status],
    single: false,
    note: '代谢组分切点男 ≥90 / 女 ≥85；管理目标常更低（男 <85 / 女 <80，来自高血压食养指南），个人目标以医生为准。',
  }
}

function buildGlucoseRow(records, resolved) {
  const spec = specOf(resolved, 'fpg')
  const metric = metricOf('fpg')
  const list = recordsWith(records, 'fpg')
  const latest = list.length > 0 ? list[list.length - 1] : null
  const current = latest?.values.fpg ?? null
  const band = rowBand(spec, metric)
  const monthAgo = Date.now() - 30 * DAY_MS
  const recent = list.filter((record) => parseAt(record.measuredAt) >= monthAgo)
  const avg30 = average(recent.map((record) => record.values.fpg))
  const delta30 = recent.length >= 2
    ? round(recent[recent.length - 1].values.fpg - recent[0].values.fpg, 1)
    : null
  const status = statusOf(current, band)
  return {
    code: 'fpg',
    name: '空腹血糖',
    unit: 'mmol/L',
    role: 'core',
    kind: 'latest',
    current,
    currentDisplay: current === null ? null : formatValue(metric, current),
    valueLabel: '最近一次',
    measuredAt: latest?.measuredAt ?? null,
    avg30: avg30 === null ? null : round(avg30, 1),
    count30: recent.length,
    delta30,
    deltaDisplay: delta30 === null ? null : formatSignedDelta(delta30, metric),
    band,
    status,
    statusText: STATUS_TEXT[status],
    single: true,
    note: '参考 3.9–6.1 mmol/L；代谢组分切点 ≥6.1；≥7.0 需医生结合临床进一步评估。',
  }
}

function buildLabRow(records, resolved, code) {
  const spec = specOf(resolved, code)
  const metric = metricOf(code)
  const list = recordsWith(records, code)
  const latest = list.length > 0 ? list[list.length - 1] : null
  const previous = list.length >= 2 ? list[list.length - 2] : null
  const current = latest?.values[code] ?? null
  const band = rowBand(spec, metric)
  const deltaPrev = latest && previous
    ? round(latest.values[code] - previous.values[code], metric?.decimals ?? 1)
    : null
  const status = statusOf(current, band)
  return {
    code,
    name: metric?.name ?? code,
    unit: metric?.unit ?? '',
    role: CORE_CODES.includes(code) ? 'core' : 'extra',
    kind: 'lab',
    current,
    currentDisplay: current === null ? null : formatValue(metric, current),
    valueLabel: '最近化验',
    measuredAt: latest?.measuredAt ?? null,
    previous: previous?.values[code] ?? null,
    previousAt: previous?.measuredAt ?? null,
    deltaPrev,
    deltaPrevDisplay: deltaPrev === null ? null : formatSignedDelta(deltaPrev, metric),
    band,
    status,
    statusText: STATUS_TEXT[status],
    single: false,
  }
}

function buildWeightRow(records) {
  const metric = metricOf('weight')
  const list = recordsWith(records, 'weight')
  const latest = list.length > 0 ? list[list.length - 1] : null
  const monthAgo = Date.now() - 30 * DAY_MS
  const recent = list.filter((record) => parseAt(record.measuredAt) >= monthAgo)
  const delta30 = recent.length >= 2
    ? round(recent[recent.length - 1].values.weight - recent[0].values.weight, 1)
    : null
  const bmiList = recordsWith(records, 'bmi')
  const bmi = bmiList.length > 0 ? bmiList[bmiList.length - 1].values.bmi : null
  return {
    code: 'weight',
    name: '体重 / BMI',
    unit: 'kg',
    role: 'extra',
    kind: 'trend',
    current: latest?.values.weight ?? null,
    currentDisplay: latest
      ? `${formatValue(metric, latest.values.weight)} kg${typeof bmi === 'number' ? ` · BMI ${bmi.toFixed(1)}` : ''}`
      : null,
    valueLabel: '最近一次',
    measuredAt: latest?.measuredAt ?? null,
    bmi,
    delta30,
    deltaDisplay: delta30 === null ? null : formatSignedDelta(delta30, metric),
    band: { low: null, high: null, label: '只观察趋势与个人基线', source: 'observe' },
    status: 'unknown',
    statusText: '只观察',
    single: false,
    note: '体重与 BMI 只观察趋势；BMI 由身高与体重自动计算。',
  }
}

function buildSugaryRow(records, season) {
  const start = addLocalDays(season.today, -6)
  const sugaryRecords = records
    .filter((record) => parseAt(record.measuredAt) >= start.getTime())
    .filter((record) => typeof record.values?.sugary === 'number')
  const values = sugaryRecords.map((record) => record.values.sugary)
  const total = values.reduce((sum, value) => sum + value, 0)
  const latest = sugaryRecords.length > 0 ? sugaryRecords[sugaryRecords.length - 1] : null
  return {
    code: 'sugary',
    name: '含糖饮料',
    unit: 'ml',
    role: 'extra',
    kind: 'trend',
    current: values.length > 0 ? total : null,
    currentDisplay: values.length > 0 ? `${Math.round(total)} ml` : null,
    weekMl: Math.round(total),
    weekCount: values.length,
    valueLabel: '近 7 天合计',
    measuredAt: latest?.measuredAt ?? null,
    count7: values.length,
    days7: new Set(sugaryRecords.map((record) => dayKeyOf(record.measuredAt))).size,
    band: { low: null, high: null, label: '只记录，不评价', source: 'observe' },
    status: 'unknown',
    statusText: '只记录',
    single: false,
    note: '中国居民膳食指南（2022）建议添加糖 <50 g/日，最好 <25 g；含糖饮料是常见来源之一。只记录，不贴食物好坏标签。',
  }
}

function buildStatement(records, resolved, season) {
  const bp = buildBloodPressureRow(records, resolved, season)
  const waist = buildWaistRow(records, resolved)
  const fpg = buildGlucoseRow(records, resolved)
  const tg = buildLabRow(records, resolved, 'tg')
  const hdl = buildLabRow(records, resolved, 'hdl')
  const extra = [
    buildLabRow(records, resolved, 'ua'),
    buildLabRow(records, resolved, 'ldl'),
    buildLabRow(records, resolved, 'hba1c'),
    buildLabRow(records, resolved, 'ppg'),
    buildWeightRow(records),
    buildSugaryRow(records, season),
  ]
  const rows = [bp, waist, fpg, tg, hdl, ...extra]
  const core = rows.filter((row) => row.role === 'core')
  return {
    rows,
    coverage: {
      recorded: core.filter((row) => row.currentDisplay !== null && row.currentDisplay !== undefined).length,
      total: core.length,
    },
    note: '本页只做参考区间与趋势展示，不计算「符合几项」，不构成诊断。是否患病请医生判断。',
  }
}

function buildLabs(records, resolved, season) {
  const labs = labRecords(records)
  const cycleLabs = labs.filter((record) => parseAt(record.measuredAt) >= season.startDay.getTime())
  const latest = labs.length > 0 ? labs[labs.length - 1] : null
  const items = LAB_PANEL_METRICS.map((code) => {
    const metric = metricOf(code)
    const list = recordsWith(labs, code)
    if (list.length === 0) return null
    const last = list[list.length - 1]
    const previous = list.length >= 2 ? list[list.length - 2] : null
    const spec = specOf(resolved, code)
    const band = rowBand(spec, metric)
    return {
      code,
      name: metric?.name ?? code,
      unit: metric?.unit ?? '',
      display: formatValue(metric, last.values[code]),
      measuredAt: last.measuredAt,
      band,
      previous: previous?.values[code] ?? null,
      deltaPrev: previous ? round(last.values[code] - previous.values[code], metric?.decimals ?? 1) : null,
    }
  }).filter(Boolean)
  return {
    latestAt: latest?.measuredAt ?? null,
    latestDate: latest ? dayKeyOf(latest.measuredAt) : null,
    cycleCount: cycleLabs.length,
    hasCycleLab: cycleLabs.length > 0,
    items,
  }
}

function buildReview(records, accounts, statement, labs, season) {
  const inCycle = records.filter((record) => parseAt(record.measuredAt) >= season.startDay.getTime())
  const recordDays = new Set(inCycle.map((record) => dayKeyOf(record.measuredAt))).size
  const bpDays = new Set(
    inCycle
      .filter((record) => typeof record.values?.sbp === 'number' || typeof record.values?.dbp === 'number')
      .map((record) => dayKeyOf(record.measuredAt)),
  ).size
  const mealDays = new Set(
    inCycle
      .filter((record) => Boolean(record.mealType) || MEAL_METRICS.some((code) => typeof record.values?.[code] === 'number'))
      .map((record) => dayKeyOf(record.measuredAt)),
  ).size
  const activityMinutes = inCycle.reduce(
    (sum, record) => sum + (typeof record.values?.activity === 'number' ? record.values.activity : 0),
    0,
  )
  const sleepDays = [...new Set(inCycle.filter((record) => typeof record.values?.sleep === 'number').map((record) => dayKeyOf(record.measuredAt)))]
  const sleepValues = sleepDays.map((key) => dayTotal(inCycle, 'sleep', startOfLocalDay(new Date(`${key}T12:00:00`)))).filter((value) => typeof value === 'number')
  const waterTotal = inCycle.reduce(
    (sum, record) => sum + (typeof record.values?.water === 'number' ? record.values.water : 0),
    0,
  )
  const waterDays = new Set(inCycle.filter((record) => typeof record.values?.water === 'number').map((record) => dayKeyOf(record.measuredAt))).size
  const sugaryTotal = inCycle.reduce(
    (sum, record) => sum + (typeof record.values?.sugary === 'number' ? record.values.sugary : 0),
    0,
  )
  const byAccount = accounts.map((account) => ({
    code: account.code,
    name: account.name,
    deposits: account.season.deposits,
    max: account.season.max,
    rate: account.season.rate,
    label: account.season.label,
  }))
  const deposits = byAccount.reduce((sum, item) => sum + item.deposits, 0)
  const max = byAccount.reduce((sum, item) => sum + item.max, 0)
  const baselineRows = ['waist', 'fpg', 'tg', 'hdl'].map((code) => {
    const list = recordsWith(inCycle, code)
    const first = list.length > 0 ? list[0] : null
    const row = statement.rows.find((item) => item.code === code)
    const metric = metricOf(code)
    if (!first || !row) return null
    const delta = typeof row.current === 'number' ? round(row.current - first.values[code], metric?.decimals ?? 1) : null
    return {
      code,
      name: row.name,
      unit: metric?.unit ?? '',
      baseline: first.values[code],
      baselineAt: first.measuredAt,
      latest: row.current,
      latestAt: row.measuredAt,
      latestDisplay: row.currentDisplay,
      delta,
      deltaDisplay: delta === null ? null : formatSignedDelta(delta, metric),
    }
  }).filter(Boolean)
  const bpList = recordsWith(inCycle, 'sbp')
  const bpRow = statement.rows.find((item) => item.code === 'bp')
  const bpBaseline = bpList.length > 0
    ? {
        code: 'bp',
        name: '血压',
        unit: 'mmHg',
        baseline: bpList[0].values.sbp,
        baselineAt: bpList[0].measuredAt,
        latest: bpRow?.current ?? null,
        latestAt: bpRow?.measuredAt ?? null,
        latestDisplay: bpRow?.currentDisplay ?? null,
        delta: null,
        deltaDisplay: null,
        note: '基线为周期内第一次读数（单次）；最新为近 7 天均值，两者口径不同，只并列展示。',
      }
    : null
  return {
    ended: season.ended,
    week: season.week,
    weeks: season.weeks,
    days: season.elapsedDays,
    daysLeft: season.daysLeft,
    deposits,
    max,
    rate: max > 0 ? Number((deposits / max).toFixed(2)) : 0,
    byAccount,
    recordDays,
    bpDays,
    mealDays,
    activityMinutes,
    sleepAvg: sleepValues.length > 0 ? round(average(sleepValues), 1) : null,
    waterAvg: waterDays > 0 ? Math.round(waterTotal / waterDays) : null,
    sugaryMl: Math.round(sugaryTotal),
    labCount: labs.cycleCount,
    latestLabAt: labs.latestAt,
    statement: [...baselineRows, ...(bpBaseline ? [bpBaseline] : [])],
    note: '本周期只陈述记录事实；指标变化受设备、饮食、水分、作息等影响，不构成效果承诺。',
  }
}

function buildVisitSummary({ member, binding, season, accounts, statement, labs, review, weekly, now }) {
  const sections = []
  const bp = statement.rows.find((row) => row.code === 'bp')
  const fpg = statement.rows.find((row) => row.code === 'fpg')
  const waist = statement.rows.find((row) => row.code === 'waist')
  const weight = statement.rows.find((row) => row.code === 'weight')
  const monitorLines = []
  if (bp?.currentDisplay) {
    const countText = bp.count7 > 0
      ? `${bp.days7} 天 / ${bp.count7} 次`
      : '最近一次'
    monitorLines.push(`血压：${bp.valueLabel}${countText ? `（${countText}）` : ''} ${bp.currentDisplay} mmHg`
      + (bp.morningAvg || bp.eveningAvg ? `（晨 ${bp.morningAvg ?? '—'}，晚 ${bp.eveningAvg ?? '—'}）` : '')
      + (bp.droppedFirstDay ? '，已按规范弃首日' : ''))
  }
  if (fpg?.currentDisplay) {
    monitorLines.push(`空腹血糖：最近 ${fpg.currentDisplay} mmol/L（${dayKeyOf(fpg.measuredAt)}）`
      + (fpg.count30 > 1 ? `；近 30 天 ${fpg.count30} 次，均值 ${fpg.avg30?.toFixed(1)} mmol/L` : ''))
  }
  if (waist?.currentDisplay) {
    monitorLines.push(`腰围：最近 ${waist.currentDisplay} cm（${dayKeyOf(waist.measuredAt)}）`
      + (typeof waist.delta30 === 'number' ? `；较 30 天前 ${waist.deltaDisplay}` : ''))
  }
  if (weight?.currentDisplay) {
    monitorLines.push(`体重：最近 ${weight.currentDisplay}（${dayKeyOf(weight.measuredAt)}）`
      + (typeof weight.delta30 === 'number' ? `；较 30 天前 ${weight.deltaDisplay}` : ''))
  }
  if (monitorLines.length > 0) {
    sections.push({ id: 'monitor', title: '家庭监测', lines: monitorLines })
  }

  const labLines = []
  if (labs.items.length > 0) {
    const date = labs.latestDate ?? '最近'
    labLines.push(`${date}：` + labs.items.map((item) => {
      const unit = item.unit === '%' ? '%' : item.unit ? ` ${item.unit}` : ''
      return `${item.name} ${item.display}${unit}`
    }).join('，'))
    const bands = labs.items
      .filter((item) => item.band?.label)
      .map((item) => `${item.name} ${item.band.label}`)
    if (bands.length > 0) labLines.push(`参考：${bands.join('；')}`)
  } else {
    labLines.push('本周期尚未录入化验数值。')
  }
  sections.push({ id: 'labs', title: '最近化验', lines: labLines })

  const behaviorLines = [
    `饮食：近 7 天 ${weekly.mealDays} 天有记录；本周期 ${review.mealDays} 天。`,
    `活动：近 7 天 ${weekly.activityMinutes} 分钟；本周期 ${review.activityMinutes} 分钟。`,
    `睡眠：本周期记录日均值 ${review.sleepAvg ?? '—'} h。`,
    `饮水：本周期记录日均值 ${review.waterAvg ?? '—'} ml。`,
    `含糖饮料：本周期合计 ${review.sugaryMl} ml（只记录，不评价）。`,
  ]
  sections.push({ id: 'behavior', title: '行为记录', lines: behaviorLines })

  sections.push({
    id: 'coverage',
    title: '记录覆盖',
    lines: [
      `本周期 ${review.recordDays}/${season.elapsedDays} 天有记录；核心指标有数据 ${statement.coverage.recorded}/${statement.coverage.total} 项。`,
      `化验：本周期录入 ${review.labCount} 次${review.latestLabAt ? `，最近 ${dayKeyOf(review.latestLabAt)}` : ''}。`,
    ],
  })

  const questions = [
    '我的个人目标值应该是多少？',
    '下次复查哪些项目、什么时候？',
    '家庭血压均值与诊室血压不一致时，以哪个为准？',
  ]
  const noteLine = binding?.note ? `我的备注：${String(binding.note).slice(0, 200)}` : ''
  const period = `第 ${binding?.seasonNo ?? 1} 个复查周期 · 第 ${season.week} 周 / ${season.weeks} 周（${formatDateText(season.startDay)} 起）`
  const disclaimer = '本摘要由用户自行记录的数据自动汇总，不含任何诊断、治疗或用药建议；请以医生判断为准。'
  const textLines = [
    `就诊摘要 · ${member.name} · ${formatClock(now)}`,
    period,
    '',
  ]
  for (const section of sections) {
    textLines.push(`【${section.title}】`)
    for (const line of section.lines) textLines.push(line)
    textLines.push('')
  }
  textLines.push('【想问医生】')
  questions.forEach((question, index) => textLines.push(`${index + 1}. ${question}`))
  if (noteLine) textLines.push(noteLine)
  textLines.push('')
  textLines.push(disclaimer)
  return {
    title: '就诊摘要',
    generatedAt: formatClock(now),
    period,
    sections,
    questions,
    note: '可在复制前补充自己的问题；本摘要不含诊断或建议。',
    text: textLines.join('\n'),
    disclaimer,
  }
}

/**
 * Build every metabolic-specific section for one member goal.
 *
 * @param {object} input
 * @param {object} input.goal        Template.
 * @param {object} input.binding     Stored member goal.
 * @param {object} input.member      Member document.
 * @param {Array<object>} input.records  Records owned by the member.
 * @param {object} input.season      Season window from goals.js.
 * @param {Array<object>} input.resolved  Resolved target specs.
 * @param {number} [input.now]
 * @returns {object}
 */
export function buildMetabolicProgress({ goal, binding, member, records, season, resolved, now = Date.now() }) {
  const accounts = buildAccounts(records, season, resolved)
  const weekly = buildWeekly(records, accounts, season)
  const statement = buildStatement(records, resolved, season)
  const labs = buildLabs(records, resolved, season)
  const review = buildReview(records, accounts, statement, labs, season)
  const visitSummary = buildVisitSummary({
    member, binding, season, accounts, statement, labs, review, weekly, now,
  })
  return {
    kind: 'review',
    accounts,
    weekly,
    statement,
    labs,
    sugary: statement.rows.find((row) => row.code === 'sugary'),
    visitSummary,
    review,
    note: '代谢对账簿只做记录、参考区间与趋势展示；不计算「符合几项」，不诊断、不调药、不生成食谱或训练计划。',
    disclaimer: goal?.disclaimer ?? '',
  }
}

/** Small helper the panel can use to label a cycle without the goal template. */
export function reviewCycleLabel(seasonNo, week, weeks) {
  const no = Number.isFinite(seasonNo) ? seasonNo : 1
  const safeWeek = Math.max(1, Number(week) || 1)
  const safeWeeks = Math.max(1, Number(weeks) || 12)
  return `第 ${no} 个复查周期 · 第 ${safeWeek} 周 / ${safeWeeks} 周`
}

export { WEEK_MS, DAY_MS }
