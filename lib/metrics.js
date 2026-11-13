/**
 * Metric registry and reference-range resolution.
 *
 * Reference values follow current Chinese guideline consensus for a general
 * adult population. They are defaults only: every member may override any
 * target with a clinician-set value, which always wins.
 *
 * Sources of the presets:
 * - Blood pressure bands: Chinese Guidelines for Prevention and Treatment of
 *   Hypertension (2024 revision) — ideal <120/80, normal high-value upper bound
 *   139/89, hypertension from 140/90.
 * - Fasting glucose: Chinese Guidelines for Prevention and Control of Type 2
 *   Diabetes — normal 3.9-6.1 mmol/L, diabetes diagnostic threshold 7.0.
 * - Postprandial 2h glucose: normal <7.8 mmol/L.
 * - Lipids: Chinese Guidelines for Lipid Management (2023) — LDL-C target is
 *   risk-stratified (<3.4 low, <2.6 medium/high, <1.8 very high); TC <5.2,
 *   TG <1.7, HDL-C >=1.0 (male) / >=1.3 (female).
 * - Uric acid: Chinese Guideline for Hyperuricemia and Gout — male <420,
 *   female <360 umol/L.
 *
 * These are population reference values, not personal treatment targets.
 */

/**
 * @typedef {'vital'|'lipid'|'glucose'|'body'|'diet'|'activity'|'recovery'} MetricCategory
 * @typedef {'low'|'medium'|'high'|'veryHigh'} RiskLevel
 * @typedef {'male'|'female'} Sex
 */

/**
 * @typedef {object} RefBand
 * @property {number} [low]     Inclusive lower bound of the acceptable range.
 * @property {number} [high]    Inclusive upper bound of the acceptable range.
 * @property {string} label     Human-readable band description.
 */

/**
 * @typedef {object} MetricDef
 * @property {string} code
 * @property {string} name
 * @property {string} unit
 * @property {number} decimals
 * @property {MetricCategory} category
 * @property {'range'|'trend'} targetMode
 * @property {RefBand} general
 * @property {Partial<Record<Sex, RefBand>>} [bySex]
 * @property {Partial<Record<RiskLevel, RefBand>>} [byRisk]
 * @property {number} [min]
 * @property {number} [max]
 * @property {string} [hint]
 */

/** @type {ReadonlyArray<MetricDef>} */
export const METRICS = Object.freeze([
  {
    code: 'sbp',
    name: '收缩压',
    unit: 'mmHg',
    decimals: 0,
    category: 'vital',
    targetMode: 'range',
    general: { high: 139, label: '理想 <120，正常高值 ≤139，≥140 偏高' },
    min: 50,
    max: 300,
    hint: '静坐 5 分钟后测量；高血压诊断阈值 140 mmHg。',
  },
  {
    code: 'dbp',
    name: '舒张压',
    unit: 'mmHg',
    decimals: 0,
    category: 'vital',
    targetMode: 'range',
    general: { high: 89, label: '理想 <80，正常高值 ≤89，≥90 偏高' },
    min: 20,
    max: 200,
    hint: '高血压诊断阈值 90 mmHg。',
  },
  {
    code: 'hr',
    name: '心率',
    unit: '次/分',
    decimals: 0,
    category: 'vital',
    targetMode: 'trend',
    general: { low: 60, high: 100, label: '静息 60–100' },
    min: 20,
    max: 250,
    hint: '个体差异大，更适合观察自身趋势。',
  },
  {
    code: 'fpg',
    name: '空腹血糖',
    unit: 'mmol/L',
    decimals: 1,
    category: 'glucose',
    targetMode: 'range',
    general: { low: 3.9, high: 6.1, label: '正常 3.9–6.1，≥7.0 达糖尿病诊断切点' },
    min: 1,
    max: 40,
    hint: '需空腹 8 小时以上。',
  },
  {
    code: 'ppg',
    name: '餐后2小时血糖',
    unit: 'mmol/L',
    decimals: 1,
    category: 'glucose',
    targetMode: 'range',
    general: { low: 3.9, high: 7.8, label: '正常 <7.8，≥11.1 达糖尿病诊断切点' },
    min: 1,
    max: 40,
    hint: '从进餐第一口开始计时满 2 小时。',
  },
  {
    code: 'hba1c',
    name: '糖化血红蛋白',
    unit: '%',
    decimals: 1,
    category: 'glucose',
    targetMode: 'range',
    general: { high: 6.0, label: '非糖尿病人群 <6.0' },
    min: 3,
    max: 20,
    hint: '反映近 2–3 个月平均血糖。',
  },
  {
    code: 'tc',
    name: '总胆固醇',
    unit: 'mmol/L',
    decimals: 2,
    category: 'lipid',
    targetMode: 'range',
    general: { high: 5.2, label: '合适 <5.2' },
    min: 0.5,
    max: 30,
  },
  {
    code: 'tg',
    name: '甘油三酯',
    unit: 'mmol/L',
    decimals: 2,
    category: 'lipid',
    targetMode: 'range',
    general: { high: 1.7, label: '合适 <1.7' },
    min: 0.1,
    max: 50,
  },
  {
    code: 'ldl',
    name: '低密度脂蛋白胆固醇',
    unit: 'mmol/L',
    decimals: 2,
    category: 'lipid',
    targetMode: 'range',
    general: { high: 3.4, label: '低危 <3.4' },
    byRisk: {
      low: { high: 3.4, label: '低危目标 <3.4' },
      medium: { high: 2.6, label: '中危目标 <2.6' },
      high: { high: 2.6, label: '高危目标 <2.6' },
      veryHigh: { high: 1.8, label: '极高危目标 <1.8' },
    },
    min: 0.1,
    max: 30,
    hint: '目标值按心血管风险分层，由医生确定。',
  },
  {
    code: 'hdl',
    name: '高密度脂蛋白胆固醇',
    unit: 'mmol/L',
    decimals: 2,
    category: 'lipid',
    targetMode: 'range',
    general: { low: 1.0, label: '≥1.0' },
    bySex: {
      male: { low: 1.0, label: '男性 ≥1.0' },
      female: { low: 1.3, label: '女性 ≥1.3' },
    },
    min: 0.1,
    max: 10,
  },
  {
    code: 'ua',
    name: '尿酸',
    unit: 'μmol/L',
    decimals: 0,
    category: 'vital',
    targetMode: 'range',
    general: { high: 420, label: '男性 <420，女性 <360' },
    bySex: {
      male: { high: 420, low: 150, label: '男性 150–420' },
      female: { high: 360, low: 90, label: '女性 90–360' },
    },
    min: 50,
    max: 1500,
    hint: '参考区间分性别，绝经后女性按医生意见调整。',
  },
  {
    code: 'weight',
    name: '体重',
    unit: 'kg',
    decimals: 1,
    category: 'body',
    targetMode: 'trend',
    general: { label: '参考 BMI 18.5–23.9 推算' },
    min: 10,
    max: 400,
    hint: '更适合观察自身趋势。',
  },
  {
    code: 'bmi',
    name: '体质指数',
    unit: 'kg/m²',
    decimals: 1,
    category: 'body',
    targetMode: 'range',
    general: { low: 18.5, high: 23.9, label: '中国成人 18.5–23.9' },
    min: 8,
    max: 100,
    hint: '≥24 超重，≥28 肥胖（中国标准）。',
  },
  {
    code: 'waist',
    name: '腰围',
    unit: 'cm',
    decimals: 0,
    category: 'body',
    targetMode: 'range',
    general: { high: 90, label: '中国成人中心性肥胖切点 男 ≥90 / 女 ≥85' },
    bySex: {
      male: { high: 90, label: '男性 <90' },
      female: { high: 85, label: '女性 <85' },
    },
    min: 30,
    max: 200,
    hint: '肚脐水平、平静呼气末测量；中国成人中心性肥胖切点男 ≥90、女 ≥85 cm。',
  },
  {
    code: 'bodyfat',
    name: '体脂率',
    unit: '%',
    decimals: 1,
    category: 'body',
    targetMode: 'range',
    general: { low: 10, high: 28, label: '健身参考：男 10–20%，女 18–28%（非医学标准）' },
    bySex: {
      male: { low: 10, high: 20, label: '男性 10–20%（健身参考）' },
      female: { low: 18, high: 28, label: '女性 18–28%（健身参考）' },
    },
    min: 3,
    max: 70,
    hint: '体脂秤/皮脂钳结果差异较大，建议固定设备看趋势；该区间为健身参考，不是医学标准。',
  },
  {
    code: 'muscle',
    name: '骨骼肌量',
    unit: 'kg',
    decimals: 1,
    category: 'body',
    targetMode: 'trend',
    general: { label: '观察趋势' },
    min: 5,
    max: 80,
    hint: '不同设备算法差异大，建议固定设备比较趋势；如需医学评估请咨询医生。',
  },
  {
    code: 'protein',
    name: '蛋白质摄入',
    unit: 'g',
    decimals: 0,
    category: 'diet',
    targetMode: 'range',
    general: { label: '参考按体重换算 1.2–1.6 g/kg·d' },
    min: 0,
    max: 400,
    hint: '按当日摄入估算记录；参考区间按体重换算，属运动营养参考，非医学处方。',
  },
  {
    code: 'water',
    name: '饮水量',
    unit: 'ml',
    decimals: 0,
    category: 'diet',
    targetMode: 'range',
    general: {
      low: 1500,
      label: '成人饮水参考 ≥1500 mL/日；中国居民膳食指南（2022）男 1700、女 1500 mL/日，运动/高温需增加',
    },
    min: 0,
    max: 10000,
    hint: '记录当日饮水总量（含白水、茶水等，不含含糖饮料更利于估算）；参考值为人群建议，不是个人处方。',
  },
  {
    code: 'sleep',
    name: '睡眠时长',
    unit: 'h',
    decimals: 1,
    category: 'recovery',
    targetMode: 'range',
    general: { low: 7, high: 9, label: '成人参考 7–9 小时/日' },
    min: 0,
    max: 24,
    hint: '记录主睡眠时长；个体需求不同，更适合观察自身趋势，不构成睡眠处方。',
  },
  {
    code: 'training',
    name: '力量训练时长',
    unit: 'min',
    decimals: 0,
    category: 'activity',
    targetMode: 'trend',
    general: { label: '记录每次时长，按周统计频次' },
    min: 0,
    max: 600,
    hint: '记录单次力量训练时长；参考每周至少 2 天肌肉强化活动（WHO 2020），不构成训练处方。',
  },
])

/** @type {ReadonlyMap<string, MetricDef>} */
const BY_CODE = new Map(METRICS.map((metric) => [metric.code, metric]))

/**
 * Resolve the applicable reference band for one member.
 *
 * Precedence: an explicit per-member target override wins; otherwise the
 * risk-stratified band applies; otherwise the sex-specific band; otherwise the
 * general population band.
 *
 * @param {MetricDef} metric
 * @param {{ sex?: Sex, riskLevel?: RiskLevel, targets?: Record<string, number> }} member
 * @returns {{ band: RefBand, source: 'override'|'risk'|'sex'|'general' }}
 */
export function resolveBand(metric, member = {}) {
  const riskBand = metric.byRisk?.[member.riskLevel]
  const sexBand = metric.bySex?.[member.sex]
  const base = riskBand ?? sexBand ?? metric.general
  const override = member.targets?.[metric.code]
  if (typeof override === 'number' && Number.isFinite(override)) {
    // A single clinician-set number tightens the binding side of the band: the
    // lower bound for floor-only metrics (HDL-C, "the higher the better") and the
    // upper bound for metrics whose band has a ceiling (LDL-C, glucose, waist).
    const floorOnly = typeof base.low === 'number' && typeof base.high !== 'number'
    const label = floorOnly
      ? `个人目标 ≥${formatValue(metric, override)} ${metric.unit}`
      : `个人目标 <${formatValue(metric, override)} ${metric.unit}`
    return {
      band: floorOnly ? { ...base, low: override, label } : { ...base, high: override, label },
      source: 'override',
    }
  }
  if (riskBand) return { band: riskBand, source: 'risk' }
  if (sexBand) return { band: sexBand, source: 'sex' }
  return { band: metric.general, source: 'general' }
}

/**
 * Compare a measured value against its band.
 * @returns {{ status: 'low'|'normal'|'high'|'unknown', band: RefBand, source: string }}
 */
export function evaluate(metric, value, member) {
  const { band, source } = resolveBand(metric, member)
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { status: 'unknown', band, source }
  }
  // Metrics such as weight, muscle mass, protein intake and training minutes have
  // no general bound on their own — their meaning comes from a management goal,
  // so the generic evaluator must not claim they are "normal".
  if (typeof band.low !== 'number' && typeof band.high !== 'number') {
    return { status: 'unknown', band, source }
  }
  if (typeof band.low === 'number' && value < band.low) return { status: 'low', band, source }
  if (typeof band.high === 'number' && value > band.high) return { status: 'high', band, source }
  return { status: 'normal', band, source }
}

/** Format a value at the metric's declared precision. */
export function formatValue(metric, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toFixed(metric.decimals)
}

/** @returns {MetricDef | undefined} */
export function metricOf(code) {
  return BY_CODE.get(code)
}

/** @returns {string[]} */
export function metricCodes() {
  return METRICS.map((metric) => metric.code)
}

/**
 * Validate and range-check a values object. Returns normalized values plus any
 * rejected entries so the caller can report them rather than silently dropping
 * data.
 *
 * @param {Record<string, unknown>} raw
 * @returns {{ values: Record<string, number>, rejected: Array<{ code: string, reason: string }> }}
 */
export function normalizeValues(raw) {
  /** @type {Record<string, number>} */
  const values = {}
  /** @type {Array<{ code: string, reason: string }>} */
  const rejected = []
  for (const [code, input] of Object.entries(raw ?? {})) {
    const metric = BY_CODE.get(code)
    if (!metric) {
      rejected.push({ code, reason: `未知指标代码。可用：${metricCodes().join(', ')}` })
      continue
    }
    const num = typeof input === 'number' ? input : Number(input)
    if (!Number.isFinite(num)) {
      rejected.push({ code, reason: '不是有效数字' })
      continue
    }
    if (typeof metric.min === 'number' && num < metric.min) {
      rejected.push({ code, reason: `低于合理下限 ${metric.min} ${metric.unit}，请确认是否录入错误` })
      continue
    }
    if (typeof metric.max === 'number' && num > metric.max) {
      rejected.push({ code, reason: `高于合理上限 ${metric.max} ${metric.unit}，请确认是否录入错误` })
      continue
    }
    values[code] = num
  }
  return { values, rejected }
}
