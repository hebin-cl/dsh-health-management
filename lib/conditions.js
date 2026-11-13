/**
 * Disease catalog, candidate-recognition rules, and per-disease target sets.
 *
 * The catalog drives three features:
 * - condition tags on a member (source: report | manual | recognized);
 * - candidate suggestion when a metric crosses a recognition threshold;
 * - the per-disease "target vs current" gap view.
 *
 * Recognition rules are CANDIDATE hints only. They never assign a tag on their
 * own — the recognized path requires the user to confirm a doctor-diagnosed
 * condition first. Thresholds follow current Chinese guideline diagnostic or
 * management cut-points and are labeled as such.
 */

/**
 * @typedef {'hypertension'|'diabetes'|'hyperlipidemia'|'hyperuricemia'|'obesity'} ConditionCode
 */

/**
 * @typedef {object} TargetSpec
 * @property {string} metric  Metric code the target applies to.
 * @property {string} kind    'lt' | 'range' — how to render the target.
 * @property {number} [high]  Upper bound for `lt`, or upper bound of `range`.
 * @property {number} [low]   Lower bound for `range`.
 * @property {string} note    Source/individualization caveat.
 */

/**
 * @typedef {object} ConditionDef
 * @property {ConditionCode} code
 * @property {string} name
 * @property {string} [shortName]
 * @property {string[]} metrics  Metric codes relevant to this condition.
 * @property {object} recognize  Candidate recognition rule.
 * @property {string} recognize.note  Caveat shown with any candidate.
 * @property {Array<{ metric: string, sex?: 'male'|'female', ge?: number, le?: number }>} recognize.anyOf
 *   A candidate is suggested when ANY rule matches the member's latest value.
 * @property {TargetSpec[]} targets  Management targets for the condition.
 */

/** @type {ReadonlyArray<ConditionDef>} */
export const CONDITIONS = Object.freeze([
  {
    code: 'hypertension',
    name: '高血压',
    shortName: '血压',
    metrics: ['sbp', 'dbp'],
    recognize: {
      note: '血压多次达到或超过 140/90 mmHg 提示可能为高血压，需以医生诊断为准。',
      anyOf: [
        { metric: 'sbp', ge: 140 },
        { metric: 'dbp', ge: 90 },
      ],
    },
    targets: [
      { metric: 'sbp', kind: 'lt', high: 140, note: '一般人群目标 <140/90，可耐受者可更严格，以医生确定为准' },
      { metric: 'dbp', kind: 'lt', high: 90, note: '同上' },
    ],
  },
  {
    code: 'diabetes',
    name: '糖尿病',
    shortName: '血糖',
    metrics: ['fpg', 'ppg', 'hba1c'],
    recognize: {
      note: '空腹 ≥7.0、餐后2h ≥11.1 或糖化 ≥6.5% 为糖尿病诊断切点，需以医生诊断为准。',
      anyOf: [
        { metric: 'fpg', ge: 7.0 },
        { metric: 'ppg', ge: 11.1 },
        { metric: 'hba1c', ge: 6.5 },
      ],
    },
    targets: [
      { metric: 'hba1c', kind: 'lt', high: 7.0, note: '一般成人控制目标 <7.0%，个体化以医生确定为准' },
      { metric: 'fpg', kind: 'range', low: 4.4, high: 7.0, note: '一般成人空腹控制目标 4.4–7.0 mmol/L' },
      { metric: 'ppg', kind: 'lt', high: 10.0, note: '非空腹控制目标 <10.0 mmol/L' },
    ],
  },
  {
    code: 'hyperlipidemia',
    name: '血脂异常',
    shortName: '血脂',
    metrics: ['tc', 'tg', 'ldl', 'hdl'],
    recognize: {
      note: 'TC ≥6.2、TG ≥2.3、LDL-C ≥4.1 或 HDL-C 偏低提示血脂异常，需以医生诊断为准。',
      anyOf: [
        { metric: 'tc', ge: 6.2 },
        { metric: 'tg', ge: 2.3 },
        { metric: 'ldl', ge: 4.1 },
        { metric: 'hdl', sex: 'male', le: 1.0 },
        { metric: 'hdl', sex: 'female', le: 1.3 },
      ],
    },
    targets: [
      { metric: 'ldl', kind: 'lt', high: 3.4, note: 'LDL-C 目标按心血管风险分层（低危<3.4 / 中高危<2.6 / 极高危<1.8）' },
      { metric: 'tc', kind: 'lt', high: 5.2, note: '总胆固醇合适水平 <5.2 mmol/L' },
      { metric: 'tg', kind: 'lt', high: 1.7, note: '甘油三酯合适水平 <1.7 mmol/L' },
    ],
  },
  {
    code: 'hyperuricemia',
    name: '高尿酸血症',
    shortName: '尿酸',
    metrics: ['ua'],
    recognize: {
      note: '非同日两次空腹尿酸男 >420、女 >360 μmol/L 为高尿酸血症切点，需以医生诊断为准。',
      anyOf: [
        { metric: 'ua', sex: 'male', ge: 420 },
        { metric: 'ua', sex: 'female', ge: 360 },
      ],
    },
    targets: [
      { metric: 'ua', kind: 'lt', high: 360, note: '一般管理目标 <360 μmol/L，痛风患者可能更严格，以医生确定为准' },
    ],
  },
  {
    code: 'obesity',
    name: '超重/肥胖',
    shortName: '体重',
    metrics: ['bmi', 'weight'],
    recognize: {
      note: 'BMI ≥24 为超重、≥28 为肥胖（中国标准），需结合医生评估。',
      anyOf: [
        { metric: 'bmi', ge: 24 },
      ],
    },
    targets: [
      { metric: 'bmi', kind: 'range', low: 18.5, high: 23.9, note: '中国成人健康体重 BMI 18.5–23.9' },
    ],
  },
])

/** @type {ReadonlyMap<ConditionCode, ConditionDef>} */
const BY_CODE = new Map(CONDITIONS.map((condition) => [condition.code, condition]))

/** @returns {ConditionDef | undefined} */
export function conditionOf(code) {
  return BY_CODE.get(code)
}

/** @returns {ConditionCode[]} */
export function conditionCodes() {
  return CONDITIONS.map((condition) => condition.code)
}

/**
 * Evaluate candidate conditions for a member from their latest values.
 *
 * @param {Record<string, { value: number } | undefined>} latestByMetric
 * @param {{ sex?: 'male'|'female' }} member
 * @returns {Array<{ code: ConditionCode, name: string, note: string, matched: Array<{ metric: string, reason: string }> }>}
 */
export function suggestConditions(latestByMetric, member = {}) {
  const suggestions = []
  for (const condition of CONDITIONS) {
    const matched = []
    for (const rule of condition.recognize.anyOf) {
      if (rule.sex !== undefined && rule.sex !== member.sex) continue
      const entry = latestByMetric[rule.metric]
      if (!entry || typeof entry.value !== 'number') continue
      const value = entry.value
      if (typeof rule.ge === 'number' && value >= rule.ge) {
        matched.push({ metric: rule.metric, reason: `${rule.metric} ${value} 达到切点 ${rule.ge}` })
      }
      if (typeof rule.le === 'number' && value <= rule.le) {
        matched.push({ metric: rule.metric, reason: `${rule.metric} ${value} 低于切点 ${rule.le}` })
      }
    }
    if (matched.length > 0) {
      suggestions.push({
        code: condition.code,
        name: condition.name,
        note: condition.recognize.note,
        matched,
      })
    }
  }
  return suggestions
}

/**
 * Resolve a condition's management targets for one member, merging the
 * member's personal overrides (from their `targets` map) where present.
 *
 * @param {ConditionDef} condition
 * @param {{ targets?: Record<string, number> }} member
 * @returns {TargetSpec[]}
 */
export function resolveTargets(condition, member = {}) {
  return condition.targets.map((target) => {
    const override = member.targets?.[target.metric]
    if (typeof override === 'number' && Number.isFinite(override)) {
      if (target.kind === 'range') {
        return { ...target, low: undefined, high: override, note: '个人目标（医生设定）' }
      }
      return { ...target, high: override, note: '个人目标（医生设定）' }
    }
    return { ...target }
  })
}
