/**
 * Management-goal catalog and goal engine.
 *
 * A management goal ("管理目标") is an *intent*: what the member wants to keep
 * under management. It is deliberately separate from the medical condition tags
 * ("疾病标签"), which record facts such as a doctor's diagnosis. Activating a
 * goal never means — and must never be presented as — a diagnosis.
 *
 * The catalog is declarative: adding a new goal means adding one entry here.
 * The service, tools and panel read this catalog, so no other layer needs to
 * change. Targets resolve to a small set of kinds (`lt`, `range`, `perKg`,
 * `weeklyDays`, `trend`) handled by the shared engine below.
 */

import { formatValue, metricOf, resolveBand } from './metrics.js'
import { buildMetabolicProgress } from './metabolic.js'

/** @typedef {'metabolic'|'fitness'} GoalDomain */
/** @typedef {'active'|'paused'|'achieved'} GoalStatus */
/** @typedef {'manual'|'report'} GoalSource */

export const GOAL_STATUSES = /** @type {const} */ ([
  { code: 'active', name: '进行中' },
  { code: 'paused', name: '已暂停' },
  { code: 'achieved', name: '已达成' },
])

export const GOAL_SOURCES = /** @type {const} */ ([
  { code: 'manual', name: '自行设定' },
  { code: 'report', name: '医生建议/报告' },
])

export const GOAL_DOMAINS = /** @type {const} */ ([
  { code: 'metabolic', name: '代谢管理' },
  { code: 'fitness', name: '体态管理' },
])

/**
 * @typedef {object} GoalTargetSpec
 * @property {string} metric
 * @property {'lt'|'range'|'perKg'|'weeklyDays'|'trend'|'observe'} kind
 * @property {number} [low]
 * @property {number} [high]
 * @property {number} [lowPerKg]
 * @property {number} [highPerKg]
 * @property {number} [days]
 * @property {Partial<Record<'male'|'female', { low?: number, high?: number }>>} [bySex]
 * @property {string} note
 */

/**
 * @typedef {object} GoalPlaybookCard
 * @property {string} id
 * @property {string} title
 * @property {string} claim
 * @property {string} source
 * @property {string} takeaway
 * @property {string} boundary
 */

/**
 * @typedef {object} GoalDef
 * @property {string} code
 * @property {string} name
 * @property {string} shortName
 * @property {'metabolic'|'fitness'} domain
 * @property {'season'|'review'} [cycleKind]
 * @property {string} tagline
 * @property {string} audience
 * @property {Array<{ code: string, name: string, metrics: string[], account?: boolean, role?: string }>} dimensions
 * @property {string[]} quickMetrics  High-frequency metrics for the quick-log form.
 * @property {GoalTargetSpec[]} targets
 * @property {{ weeks: number, checkpoints: number[] }} [season]
 * @property {GoalPlaybookCard[]} [playbook]
 * @property {string[]} notes
 * @property {string} disclaimer
 */

/** @type {ReadonlyArray<GoalDef>} */
export const GOALS = Object.freeze([
  {
    code: 'metabolic',
    name: '代谢综合征管理',
    shortName: '代谢',
    domain: 'metabolic',
    cycleKind: 'review',
    tagline: '把测、吃、动、睡存进四个账户，12 周一个复查周期，复诊带走一页纸',
    audience: '想长期管理代谢指标、或医生建议关注代谢风险的人。目标由自己设定，属管理意愿，不是诊断。',
    dimensions: [
      {
        code: 'core',
        name: '核心五项',
        metrics: ['waist', 'sbp', 'dbp', 'fpg', 'tg', 'hdl'],
        account: false,
        role: '对账单',
      },
      {
        code: 'extra',
        name: '附加项',
        metrics: ['ua', 'ldl', 'hba1c', 'ppg', 'bmi', 'weight', 'sugary'],
        account: false,
        role: '参考',
      },
      {
        code: 'behaviour',
        name: '行为账户',
        metrics: ['activity', 'sleep', 'kcal', 'protein'],
        account: false,
        role: '可存入',
      },
    ],
    quickMetrics: ['sbp', 'dbp', 'fpg', 'waist'],
    targets: [
      {
        metric: 'waist',
        kind: 'range',
        bySex: { male: { high: 90 }, female: { high: 85 } },
        note: '代谢组分切点：男 ≥90 / 女 ≥85 cm；管理参考常更低（男 <85 / 女 <80，见高血压食养指南），个人目标以医生确定为准。',
      },
      {
        metric: 'sbp',
        kind: 'lt',
        high: 130,
        note: '代谢组分切点 ≥130/85 mmHg；家庭血压参考界值 135/85，诊室参考界值 140/90；个人目标以医生确定为准。',
      },
      {
        metric: 'dbp',
        kind: 'lt',
        high: 85,
        note: '代谢组分切点 ≥130/85 mmHg；个人目标以医生确定为准。',
      },
      {
        metric: 'fpg',
        kind: 'range',
        low: 3.9,
        high: 6.1,
        note: '参考 3.9–6.1 mmol/L；代谢组分切点 ≥6.1；≥7.0 需医生结合临床进一步评估。',
      },
      { metric: 'tg', kind: 'lt', high: 1.7, note: '参考 <1.7 mmol/L；代谢组分切点 ≥1.7。' },
      {
        metric: 'hdl',
        kind: 'range',
        low: 1.04,
        note: '代谢组分参考 ≥1.04 mmol/L（不分性别）；血脂指南另有性别参考（男 ≥1.0 / 女 ≥1.3），个人目标以医生确定为准。',
      },
      {
        metric: 'bmi',
        kind: 'range',
        low: 18.5,
        high: 23.9,
        note: '中国成人参考 BMI 18.5–23.9；只作参考，个人目标以医生确定为准。',
      },
      {
        metric: 'ua',
        kind: 'range',
        bySex: { male: { high: 420 }, female: { high: 360 } },
        note: '参考：男 <420 / 女 <360 μmol/L；痛风者的控制目标由医生个体化设定。',
      },
      {
        metric: 'ldl',
        kind: 'range',
        high: 3.4,
        note: '一般人群参考 <3.4 mmol/L；按心血管风险分层的目标由医生设定，本工具不判断风险层级。',
      },
      {
        metric: 'hba1c',
        kind: 'lt',
        high: 6.0,
        note: '非糖尿病人群参考 <6.0%；已确诊者的控制目标由医生个体化设定。',
      },
      { metric: 'ppg', kind: 'lt', high: 7.8, note: '参考 <7.8 mmol/L；≥11.1 需医生结合临床进一步评估。' },
      {
        metric: 'activity',
        kind: 'weeklyDays',
        days: 5,
        note: '参考每周 150–300 分钟中等强度活动（WHO 2020 / 中国人群身体活动指南 2021）；只做行为记录，不构成运动处方。',
      },
      {
        metric: 'sleep',
        kind: 'range',
        low: 7,
        high: 9,
        note: '成人睡眠公开参考 7–9 小时/日；个体需求不同，只记录与观察趋势。',
      },
      {
        metric: 'weight',
        kind: 'observe',
        note: '只观察趋势与个人基线，不设通用目标。',
      },
    ],
    season: { weeks: 12, checkpoints: [4, 8, 12] },
    playbook: [
      {
        id: 'what',
        title: '五项组合，不是单项判决',
        claim: 'CDS 的五项组合标准是：腰围、血糖、血压、甘油三酯、HDL-C 五项中达到 3 项及以上；这是人群标准，不是对个人的判决。',
        source: '中华医学会糖尿病学分会标准；《成人代谢综合征防控健康教育专家共识》（2024）解读。',
        takeaway: '本工具逐项展示参考与记录覆盖，不计算你符合几项。',
        boundary: '单项异常不等于患病；是否患病请医生结合临床判断。',
      },
      {
        id: 'bp',
        title: '单次血压不算数',
        claim: '家庭血压规范：每天早、晚各 1 次，每次 2–3 遍、间隔 1–2 分钟，连续 7 天；去掉第 1 天，取后 6 天均值。家庭血压参考界值 135/85。',
        source: '《中国高血压防治指南（2024年修订版）》；家庭血压监测指南（2019）。',
        takeaway: '对账单显示近 7 天均值、测量天数与晨晚均值；单次读数标「仅参考」。',
        boundary: '不因单次读数下结论；不删除高值，复测与就医由医生判断。',
      },
      {
        id: 'waist',
        title: '两个腰围数字',
        claim: '代谢组分切点：男 ≥90 / 女 ≥85 cm；高血压食养指南的管理参考更低：男 <85 / 女 <80 cm。',
        source: 'CDS 五项；《成人高血压食养指南（2023年版）》。',
        takeaway: '对账单显示组分参考；个人目标可在目标设置里改成医生给的值。',
        boundary: '管理参考不是诊断切点，别把两个数字混用。',
      },
      {
        id: 'lab',
        title: '化验单是快照',
        claim: 'HbA1c 反映检测前约 8–12 周平均血糖；血脂复查频率因风险而异（高危人群常 3–6 个月），具体听医生安排。',
        source: '《中国糖尿病防治指南（2024版）》；《中国血脂管理指南（2023年）》。',
        takeaway: '化验单一次录完，对账单显示最近值与较上次变化，不解读报告。',
        boundary: '复查项目与频率以医生安排为准；本工具不判断报告好坏。',
      },
      {
        id: 'plate',
        title: '国家膳食规范只做参考',
        claim: '《中国居民膳食指南（2022）》：盐 <5 g、油 25–30 g、添加糖 <50 g（最好 <25 g）、蔬菜 ≥300 g、奶 ≥300 mL、饮水男 1700 / 女 1500 mL。',
        source: '中国营养学会《中国居民膳食指南（2022）》。',
        takeaway: '只展示参考卡；记录一餐就是存款，不生成食谱、不算热量缺口。',
        boundary: '特殊人群（孕期、肾病等）请咨询医生或注册营养师。',
      },
      {
        id: 'move',
        title: '150 分钟',
        claim: '成年人参考：每周 150–300 分钟中等强度活动，或等量高强度活动，每周至少 2 天肌肉力量活动。',
        source: 'WHO 2020；《中国人群身体活动指南（2021）》。',
        takeaway: '只记录活动分钟与天数，不生成动作、组数或训练计划。',
        boundary: '关节疼痛、慢病或特殊情况运动前请咨询医生。',
      },
      {
        id: 'family',
        title: '家庭是执行单元',
        claim: '公开报道显示，异地子女代看报告、老人不会用手机、家庭口味冲突，是代谢管理落地的常见阻碍。',
        source: '调研：公开报道与用户讨论（详见 docs/代谢管理-重设计.md）。',
        takeaway: '成员切换 + 就诊摘要可复制，方便家人陪诊时使用；不自动共享数据。',
        boundary: '不越权共享、不远程判断病情；隐私由用户自己决定。',
      },
      {
        id: 'replace',
        title: '一个替换，不是一张禁食清单',
        claim: '网络传播里最有效的部分，是把营养学翻译成「今天能做的一个替换」：白水换甜饮、整果换果汁、鸡蛋换燕窝。',
        source: '偏口鱼博士内容调研（二次转述，非临床共识）；中国居民膳食指南（2022）关于添加糖与果汁的说明。',
        takeaway: '记录做到的一个替换即可；不评分、不贴「干净/垃圾」标签。',
        boundary: '绝对化、恐吓式与单一归因说法不进入产品；食物不评价人。',
      },
      {
        id: 'boundary',
        title: '这是记录工具，不是处方',
        claim: '以上内容来自中国指南、国家膳食规范、WHO 公开文件与公开传播材料，只用于记录与对照。',
        source: '本工具对调研材料的边界说明。',
        takeaway: '不诊断、不调药、不生成食谱/训练计划/补剂建议，不承诺效果。',
        boundary: '是否患病、个人目标值与复查安排请以医生意见为准。',
      },
    ],
    notes: [
      '代谢对账簿：测 / 吃 / 动 / 睡四个行为账户可计分；核心指标只做参考区间与趋势的对账单。',
      '12 周一个复查周期；周期只给节奏，不承诺效果。不诊断、不调药、不生成食谱或训练计划；合并疾病、孕期或特殊情况请咨询医生。',
      '不计算「符合几项」；指标达到参考切点不等于患病，是否患病请医生判断。',
    ],
    disclaimer: '代谢管理为个人管理意愿，参考区间来自中国指南、国家膳食规范与 WHO 公开文件，不构成医疗诊断、治疗或用药建议；是否患病、个人目标值与复查安排请以医生意见为准。',
  },
  {
    code: 'lean_muscle',
    name: '薄肌管理',
    shortName: '薄肌',
    domain: 'fitness',
    tagline: '把训练、大餐、睡眠和饮水存进账户，12 周一个赛季',
    audience: '以低体脂、肌肉线条为体态目标的人。目标由自己设定，属体态管理，不是医疗诊断。',
    dimensions: [
      { code: 'training', name: '大练', metrics: ['training'], account: true, role: '本金' },
      { code: 'protein', name: '大餐', metrics: ['protein'], account: true, role: '原料' },
      { code: 'sleep', name: '大睡', metrics: ['sleep'], account: true, role: '修复' },
      { code: 'water', name: '大水', metrics: ['water'], account: true, role: '基础' },
      {
        code: 'body',
        name: '体成分',
        metrics: ['weight', 'bodyfat', 'muscle', 'waist'],
        account: false,
        role: '对账单',
      },
    ],
    quickMetrics: ['training', 'protein', 'sleep', 'water'],
    targets: [
      {
        metric: 'training',
        kind: 'weeklyDays',
        days: 2,
        note: '参考：WHO 2020 建议成年人每周至少 2 天肌肉强化活动；个人目标可在目标设置里调整，不构成训练处方。',
      },
      {
        metric: 'protein',
        kind: 'perKg',
        lowPerKg: 1.2,
        highPerKg: 1.6,
        note: '运动营养公开参考 1.2–1.6 g/kg 体重/日，按最新体重换算；仅供记录参考，不是处方。',
      },
      {
        metric: 'water',
        kind: 'range',
        low: 1500,
        note: '中国居民膳食指南（2022）成人饮水量参考：男 1700 mL、女 1500 mL/日；运动/高温需增加。只记录，不强制。',
      },
      {
        metric: 'sleep',
        kind: 'range',
        low: 7,
        high: 9,
        note: '成人睡眠公开参考 7–9 小时/日；个体需求不同，只记录与观察趋势。',
      },
      {
        metric: 'bodyfat',
        kind: 'observe',
        bySex: { male: { low: 10, high: 20 }, female: { low: 18, high: 28 } },
        note: '健身参考区间（男 10–20%、女 18–28%），非医学标准；只观察趋势与参考区间，不做达标评分。',
      },
      {
        metric: 'weight',
        kind: 'observe',
        note: '只观察趋势与个人基线，不设通用目标。',
      },
      {
        metric: 'muscle',
        kind: 'observe',
        note: '只观察趋势；不同设备算法差异大，建议固定设备比较。',
      },
      {
        metric: 'waist',
        kind: 'observe',
        bySex: { male: { high: 90 }, female: { high: 85 } },
        note: '参考中国成人中心性肥胖切点（男 ≥90 / 女 ≥85 cm）；只观察趋势，不做达标评分。',
      },
    ],
    season: { weeks: 12, checkpoints: [4, 8, 12] },
    playbook: [
      {
        id: 'what',
        title: '薄肌不是越瘦越好',
        claim: '网络主张：精瘦、体脂较低、肌肉线条明显、视觉维度合理，而不是体脂越低越好。',
        source: '邵艾伦《为什么我劝所有男人练薄肌？》（B 站，2026-08）；二次报道：远川研究所、17173。',
        takeaway: '体脂只做参考区间与趋势，不做达标评分；账户只记录可控行为。',
        boundary: '体脂过低有健康风险；参考区间不是目标值，也不是医学标准。',
      },
      {
        id: 'loop',
        title: '行动—结果要看得见',
        claim: '「健身最重要的是让人重新建立行动与结果之间的联系：今天去训练，明天增加重量，长期坚持，身体就会变化。」',
        source: '远川研究所转述邵艾伦；薄肌理论出圈的核心表达之一。',
        takeaway: '产品给行为计分，给结果只做「对账单」；每周对账，让投入可见。',
        boundary: '身体变化受睡眠、压力、设备、水分等影响，不把结果简单归因于某一次行动。',
      },
      {
        id: 'account',
        title: '身体账户，不是身体负债',
        claim: '「肌肉是个人银行账户 / 战略储备资源；吃蛋白质练肌肉相当于存款。」',
        source: '远川研究所转述邵艾伦；孙宇晨对谈中称身体是长期资产。',
        takeaway: '四个行为账户（大练 / 大餐 / 大睡 / 大水）；体成分是对账单，不是道德分数。',
        boundary: '账户是隐喻，不是金融或医学承诺；不把身体部位分成「好 / 坏」。',
      },
      {
        id: 'rules',
        title: '四条简单规则',
        claim: '网络流行「大水、大睡、大练、大防」与「小糖、小钠、小辣」；把健康压缩成日常小规则。',
        source: '远川研究所、17173 对「大理论」体系的整理。',
        takeaway: '只保留可记录的练 / 吃 / 睡 / 水四个账户；不生成食谱，不贴「干净 / 垃圾食物」标签。',
        boundary: '规则越简单越容易走极端；出现进食焦虑或强迫倾向时应暂停并咨询专业人士。',
      },
      {
        id: 'season',
        title: '12 周一个赛季',
        claim: '网络主张「3–6 个月」「每天 40 分钟」；这是创作者的经验表达，不是可复现的效果承诺。',
        source: '17173、远川研究所对邵艾伦主张的转述。',
        takeaway: '用 12 周赛季给出起点、检查点与结算，制造节奏与完成感。',
        boundary: '赛季只提供时间盒，不承诺任何身体变化；40 分钟不是处方。',
      },
      {
        id: 'compare',
        title: '只和自己比',
        claim: '「黄毛理论」强调松弛感与主体性；「自己爽了才是第一要义」。',
        source: '邵艾伦《你需要黄毛思维》；孙宇晨 × 邵艾伦对谈。',
        takeaway: '只用个人基线与自己的照片，不做排行榜、不做他人身材对比。',
        boundary: '主体性不等于否定医学建议；有健康问题时仍应咨询医生。',
      },
      {
        id: 'anti',
        title: '允许波动，拒绝内耗',
        claim: '「偶尔来上那么两口小甜水也不是什么禁忌。」',
        source: '17173 对「大理论」实践者的采访与评论。',
        takeaway: '断更不惩罚、可暂停、允许波动；教练只谈行动，不评价身体。',
        boundary: '不鼓励极端节食、脱水或过量训练；出现不适请停止并咨询医生。',
      },
      {
        id: 'boundary',
        title: '这是记录工具，不是处方',
        claim: '以上均为网络观点与公开报道，不是医学、训练或营养共识。',
        source: '本工具对调研材料的边界说明。',
        takeaway: '只做记录、参考区间与趋势展示；不提供诊断、训练计划、食谱或补剂建议。',
        boundary: '孕期、合并疾病、进食障碍或特殊人群，请咨询医生或注册营养师。',
      },
    ],
    notes: [
      '薄肌账户：大练 / 大餐 / 大睡 / 大水四个行为账户可计分；体成分只做参考区间与趋势的对账单。',
      '12 周一个赛季；赛季只给节奏，不承诺效果。不生成个性化训练计划、食谱或补剂建议；合并疾病、孕期或进食障碍等情况请咨询医生或注册营养师。',
    ],
    disclaimer: '薄肌管理为个人体态目标，参考区间来自运动与营养公开共识，非医学标准，不构成医疗、营养或训练处方；体成分变化不构成效果承诺。',
  },
])

const GOAL_BY_CODE = new Map(GOALS.map((goal) => [goal.code, goal]))
const STATUS_BY_CODE = new Map(GOAL_STATUSES.map((item) => [item.code, item]))
const SOURCE_BY_CODE = new Map(GOAL_SOURCES.map((item) => [item.code, item]))
const DOMAIN_BY_CODE = new Map(GOAL_DOMAINS.map((item) => [item.code, item]))

/** @returns {GoalDef | undefined} */
export function goalOf(code) {
  return GOAL_BY_CODE.get(code)
}

/** @returns {string[]} */
export function goalCodes() {
  return GOALS.map((goal) => goal.code)
}

export const statusName = (code) => STATUS_BY_CODE.get(code)?.name ?? code
export const sourceName = (code) => SOURCE_BY_CODE.get(code)?.name ?? code
export const domainName = (code) => DOMAIN_BY_CODE.get(code)?.name ?? code

/** Every metric a goal can show or target. */
export function goalMetricCodes(goal) {
  const codes = new Set()
  for (const dimension of goal.dimensions) for (const code of dimension.metrics) codes.add(code)
  for (const target of goal.targets) codes.add(target.metric)
  return [...codes]
}

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/**
 * Resolve one goal's targets for a member.
 *
 * Precedence for every bound: the goal's personal target (stored on the member
 * goal) wins, then the member-level personal target, then the goal template
 * (sex-aware), then the metric's own reference band.
 *
 * @param {GoalDef} goal
 * @param {{ sex?: 'male'|'female', riskLevel?: string, targets?: Record<string, number> }} member
 * @param {Record<string, number>} goalTargets  Per-goal personal overrides.
 * @returns {Array<object>}
 */
export function resolveGoalTargets(goal, member = {}, goalTargets = {}) {
  return goal.targets.map((spec) => {
    const metric = metricOf(spec.metric)
    // Body-composition rows are statements, not targets: a clinician-set
    // member-level number must not turn them into pass/fail bounds either.
    const bandMember =
      spec.kind === 'observe' ? { sex: member.sex, riskLevel: member.riskLevel } : member
    const { band, source } = resolveBand(metric, bandMember)
    const sexSpec = spec.bySex?.[member.sex] ?? {}
    // Per-kg, weekly-frequency and trend rows carry no fixed bound of their own:
    // a member-level target for the underlying metric must not leak into `high`.
    // `observe` rows *do* carry a reference band for display, but never a score.
    const carriesBounds =
      spec.kind !== 'perKg' && spec.kind !== 'weeklyDays' && spec.kind !== 'trend'
    const base = {
      metric: spec.metric,
      kind: spec.kind,
      days: num(spec.days),
      note: spec.note,
      low: carriesBounds ? num(spec.low) ?? num(sexSpec.low) ?? num(band.low) : undefined,
      high: carriesBounds ? num(spec.high) ?? num(sexSpec.high) ?? num(band.high) : undefined,
      bandLabel: carriesBounds ? band.label : undefined,
      bandSource: carriesBounds ? source : undefined,
      lowPerKg: num(spec.lowPerKg),
      highPerKg: num(spec.highPerKg),
      source: 'template',
    }
    const goalOverride = num(goalTargets?.[spec.metric])
    // Per-kg and weekly-frequency targets have their own unit semantics (g/day
    // derived from weight; days per week), so a member-level "personal target"
    // for those metrics would be ambiguous. Only the goal's own target applies.
    const memberOverride =
      base.kind === 'weeklyDays' || base.kind === 'perKg' ? undefined : num(member.targets?.[spec.metric])
    const override = goalOverride ?? memberOverride
    if (override === undefined) return base
    // `observe` is a statement row: a personal number must never turn it into a
    // pass/fail target (the whole point is that body composition is not scored).
    if (base.kind === 'trend' || base.kind === 'observe') return base
    if (base.kind === 'weeklyDays') {
      return { ...base, days: override, source: goalOverride !== undefined ? 'goal-override' : 'member-override' }
    }
    if (base.kind === 'perKg') {
      return { ...base, kind: 'lt', high: override, lowPerKg: undefined, highPerKg: undefined, source: goalOverride !== undefined ? 'goal-override' : 'member-override' }
    }
    // Range targets keep the loose side from the template; a single personal
    // number tightens the binding side (an upper bound for most metrics, the
    // lower bound when the template defines only a minimum, e.g. HDL-C).
    if (base.kind === 'range') {
      const hasLow = typeof base.low === 'number'
      const hasHigh = typeof base.high === 'number'
      if (hasLow && !hasHigh) {
        return { ...base, low: override, source: goalOverride !== undefined ? 'goal-override' : 'member-override' }
      }
      return { ...base, high: override, source: goalOverride !== undefined ? 'goal-override' : 'member-override' }
    }
    return { ...base, high: override, source: goalOverride !== undefined ? 'goal-override' : 'member-override' }
  })
}

/** Latest weight in kg, used by per-kg targets. */
function latestWeight(latestByMetric) {
  const entry = latestByMetric?.weight
  return entry && typeof entry.value === 'number' ? entry.value : undefined
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

function parseAt(text) {
  return new Date(String(text).replace(' ', 'T')).getTime()
}

function dayKey(text) {
  return String(text).slice(0, 10)
}

/** Local calendar day key (YYYY-MM-DD) for a Date. */
function localDayKey(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The last `count` local calendar days, including today. "近 7 天" means today
 * plus the previous six calendar days, so a record from eight days ago never
 * counts and one from seven days ago only counts when it is yesterday.
 */
function recentDayKeySet(now, count) {
  const base = new Date(now)
  const set = new Set()
  for (let offset = 0; offset < count; offset += 1) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset, 12)
    set.add(localDayKey(day))
  }
  return set
}

/** Attach a unit without a space for percent values, which reads better in Chinese. */
function attachUnit(text, unit) {
  if (!unit) return text
  return unit === '%' ? `${text}%` : `${text} ${unit}`
}

/**
 * Render a target bound at a readable precision: integer metrics stay integer,
 * one-decimal metrics drop a trailing .0, and two-decimal metrics (LDL-C, HDL-C)
 * keep one decimal so a 1.0 mmol/L minimum never reads as a bare 1.
 */
function formatBound(value, metric) {
  const decimals = metric?.decimals ?? 0
  if (decimals >= 2) return value.toFixed(1)
  const text = value.toFixed(decimals)
  return text.endsWith('.0') ? text.slice(0, -2) : text
}

/**
 * Render a target as human text, resolving per-kg and sex-aware bounds.
 * @returns {string}
 */
export function describeTarget(spec, metric, weight) {
  const unit = metric?.unit ?? ''
  const fmt = (value) => formatBound(value, metric)
  if (spec.kind === 'weeklyDays') return `近 7 天 ≥ ${fmt(spec.days) ?? 0} 天`
  if (spec.kind === 'trend') return '观察趋势'
  if (spec.kind === 'observe') {
    const low = typeof spec.low === 'number' ? fmt(spec.low) : null
    const high = typeof spec.high === 'number' ? fmt(spec.high) : null
    if (low !== null && high !== null) return `${attachUnit(`参考 ${low}–${high}`, unit)}（只观察）`
    if (high !== null) return `${attachUnit(`参考 <${high}`, unit)}（只观察）`
    if (low !== null) return `${attachUnit(`参考 ≥${low}`, unit)}（只观察）`
    return '只观察趋势'
  }
  if (spec.kind === 'lt') {
    return typeof spec.high === 'number' ? attachUnit(`目标 <${fmt(spec.high)}`, unit) : '观察趋势'
  }
  if (spec.kind === 'perKg') {
    const low = spec.lowPerKg
    const high = spec.highPerKg
    if (typeof weight !== 'number') return '按最新体重换算（待补体重）'
    if (typeof low === 'number' && typeof high === 'number') {
      return `${attachUnit(`目标 ${fmt(low * weight)}–${fmt(high * weight)}`, unit)}/日`
    }
  }
  const low = typeof spec.low === 'number' ? fmt(spec.low) : null
  const high = typeof spec.high === 'number' ? fmt(spec.high) : null
  if (low !== null && high !== null) return attachUnit(`目标 ${low}–${high}`, unit)
  if (high !== null) return attachUnit(`目标 <${high}`, unit)
  if (low !== null) return attachUnit(`目标 ≥${low}`, unit)
  return '观察趋势'
}

/**
 * Template text for a member-agnostic goal catalog: when a target is
 * sex-specific, both sexes are shown so the reference is never blank.
 */
function describeTemplateTarget(spec, metric) {
  if (!spec.bySex) return describeTarget(spec, metric)
  const unit = metric?.unit ?? ''
  const fmt = (value) => formatBound(value, metric)
  const parts = []
  for (const sex of ['male', 'female']) {
    const sexSpec = spec.bySex[sex]
    if (!sexSpec) continue
    const label = sex === 'male' ? '男' : '女'
    const low = typeof sexSpec.low === 'number' ? fmt(sexSpec.low) : null
    const high = typeof sexSpec.high === 'number' ? fmt(sexSpec.high) : null
    if (low !== null && high !== null) parts.push(attachUnit(`${label} ${low}–${high}`, unit))
    else if (high !== null) parts.push(attachUnit(`${label} <${high}`, unit))
    else if (low !== null) parts.push(attachUnit(`${label} ≥${low}`, unit))
  }
  if (parts.length === 0) return describeTarget(spec, metric)
  const joined = parts.join(' / ')
  return spec.kind === 'observe' ? `${joined}（只观察）` : joined
}

/** Render a signed delta with the metric's unit, e.g. "-1.5 %" or "+0.8 kg". */
function formatSignedDelta(delta, metric) {
  const text = formatBound(Math.abs(delta), metric)
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
  return attachUnit(`${sign}${text}`, metric?.unit ?? '')
}

/**
 * Evaluate one resolved target against the member's data.
 *
 * `observe` rows are intentionally not scored: body composition is displayed
 * against a reference band and a season baseline, never as pass/fail.
 *
 * @param {object} spec  Resolved target from resolveGoalTargets.
 * @param {{ latestByMetric: Record<string, { value: number, measuredAt: string }>, records: Array<object>, now?: number, seasonStart?: number|null }} context
 * @returns {object} Target row for the progress view.
 */
export function evaluateGoalTarget(spec, context) {
  const metric = metricOf(spec.metric)
  const latest = context.latestByMetric?.[spec.metric]
  const current = latest && typeof latest.value === 'number' ? latest.value : undefined
  const weight = latestWeight(context.latestByMetric ?? {})
  const now = context.now ?? Date.now()
  const row = {
    metric: spec.metric,
    name: metric?.name ?? spec.metric,
    unit: metric?.unit ?? '',
    kind: spec.kind,
    low: typeof spec.low === 'number' ? spec.low : null,
    high: typeof spec.high === 'number' ? spec.high : null,
    days: typeof spec.days === 'number' ? spec.days : null,
    targetDisplay: describeTarget(spec, metric, weight),
    note: spec.note ?? '',
    source: spec.source,
    current: current ?? null,
    currentDisplay: current !== undefined ? formatValue(metric, current) : null,
    measuredAt: latest?.measuredAt ?? null,
    status: 'unknown',
  }

  if (spec.kind === 'observe') {
    const series = (context.records ?? [])
      .filter((record) => typeof record.values[spec.metric] === 'number')
      .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1))
    const seasonStart = typeof context.seasonStart === 'number' ? context.seasonStart : -Infinity
    const seasonSeries = series.filter((record) => parseAt(record.measuredAt) >= seasonStart)
    const baseline = seasonSeries[0] ?? null
    const latestInSeason = seasonSeries[seasonSeries.length - 1] ?? null
    const latestValue = latestInSeason?.values[spec.metric]
    if (latestInSeason) {
      row.current = latestValue
      row.currentDisplay = formatValue(metric, latestValue)
      row.measuredAt = latestInSeason.measuredAt
    }
    row.band = {
      low: row.low,
      high: row.high,
      label: spec.bandLabel ?? '',
      source: spec.bandSource ?? 'template',
    }
    row.baseline = baseline
      ? { value: baseline.values[spec.metric], measuredAt: baseline.measuredAt }
      : null
    // A single record is both the season baseline and the latest value: there
    // is nothing to compare yet, so the delta is "—" instead of a fake 0.
    const comparable = Boolean(baseline && latestInSeason && baseline !== latestInSeason)
    row.singleMeasurement = Boolean(baseline && latestInSeason && !comparable)
    if (comparable && latestValue !== undefined) {
      const delta = Number((latestValue - baseline.values[spec.metric]).toFixed(metric?.decimals ?? 1))
      row.deltaSinceBaseline = delta
      row.deltaDisplay = formatSignedDelta(delta, metric)
    } else {
      row.deltaSinceBaseline = null
      row.deltaDisplay = null
    }
    // Keep the 30-day delta for compatibility with the old trend cards.
    const recent = series.filter((record) => now - parseAt(record.measuredAt) <= MONTH_MS)
    if (recent.length >= 2) {
      const first = recent[0]
      const last = recent[recent.length - 1]
      row.delta30 = Number((last.values[spec.metric] - first.values[spec.metric]).toFixed(metric?.decimals ?? 1))
    }
    row.status = 'observe'
    return row
  }

  if (spec.kind === 'trend') {
    const series = (context.records ?? [])
      .filter((record) => typeof record.values[spec.metric] === 'number')
      .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1))
    const recent = series.filter((record) => now - parseAt(record.measuredAt) <= MONTH_MS)
    if (recent.length >= 2) {
      const first = recent[0]
      const last = recent[recent.length - 1]
      row.delta30 = Number((last.values[spec.metric] - first.values[spec.metric]).toFixed(metric?.decimals ?? 1))
      row.delta30From = first.measuredAt
      row.delta30To = last.measuredAt
    }
    row.status = 'trend'
    return row
  }

  if (spec.kind === 'weeklyDays') {
    const training = (context.records ?? []).filter(
      (record) => typeof record.values[spec.metric] === 'number' && record.values[spec.metric] > 0,
    )
    const week = recentDayKeySet(now, 7)
    const days = new Set(
      training.filter((record) => week.has(dayKey(record.measuredAt))).map((record) => dayKey(record.measuredAt)),
    )
    // No training ever recorded means "no data", not "missed the target"; a
    // member who only trained before this week legitimately shows 0 of 7 days.
    if (training.length === 0) {
      row.current = null
      row.currentDisplay = null
      row.targetDisplay = `近 7 天 ≥ ${spec.days} 天（暂无训练记录）`
      row.status = 'unknown'
      return row
    }
    row.current = days.size
    row.currentDisplay = String(days.size)
    row.measuredAt = latest?.measuredAt ?? null
    row.targetDisplay = `近 7 天 ≥ ${spec.days} 天（已记录 ${days.size} 天）`
    row.status = days.size >= (spec.days ?? 0) ? 'normal' : 'low'
    return row
  }

  if (spec.kind === 'perKg') {
    if (typeof weight !== 'number') {
      row.status = 'pending'
      return row
    }
    const lowExact = spec.lowPerKg * weight
    const highExact = spec.highPerKg * weight
    // Round only for display; judge against the exact gram range so a value just
    // below the floor is never accepted because the floor was rounded down.
    row.low = Number(lowExact.toFixed(0))
    row.high = Number(highExact.toFixed(0))
    row.targetDisplay = `目标 ${row.low}–${row.high} ${metric?.unit ?? ''}/日（按体重 ${weight} kg 换算）`
    if (current === undefined) {
      row.status = 'unknown'
      return row
    }
    row.status = current < lowExact ? 'low' : current > highExact ? 'high' : 'normal'
    return row
  }

  if (current === undefined) {
    row.status = 'unknown'
    return row
  }
  if (spec.kind === 'range') {
    if (typeof row.low === 'number' && current < row.low) row.status = 'low'
    // A high-only range renders as "目标 <X" (waist), so X itself is above; a
    // two-sided range renders as "L–H" and H itself is still inside.
    else if (
      typeof row.high === 'number' &&
      (typeof row.low === 'number' ? current > row.high : current >= row.high)
    ) {
      row.status = 'high'
    } else row.status = 'normal'
  } else {
    // `lt` renders as "目标 < X", so a value equal to X has not met the target.
    row.status = typeof row.high === 'number' ? (current >= row.high ? 'high' : 'normal') : 'unknown'
  }
  return row
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Local midnight for a timestamp or Date. */
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

/** One local calendar day of a record, normalized to YYYY-MM-DD. */
function recordDay(record) {
  return formatDateText(startOfLocalDay(parseAt(record.measuredAt)))
}

/** Season window derived from the binding; old bindings fall back to startedAt. */
function seasonWindow(goal, binding, now) {
  const weeks = goal.season?.weeks ?? 12
  const rawStart = num(binding.seasonStartedAt) ?? num(binding.startedAt) ?? now
  const startDay = startOfLocalDay(rawStart)
  const today = startOfLocalDay(now)
  const elapsedDays = Math.max(1, dayDiff(startDay, today) + 1)
  const totalDays = weeks * 7
  const capped = Math.min(elapsedDays, totalDays)
  const ended = elapsedDays >= totalDays
  const week = Math.min(weeks, Math.floor((elapsedDays - 1) / 7) + 1)
  return {
    weeks,
    startDay,
    today,
    elapsedDays,
    totalDays,
    capped,
    ended,
    week,
    daysLeft: Math.max(0, totalDays - elapsedDays),
  }
}

/** Sum one metric for a local day; sleep takes the max so a nap never doubles it. */
function aggregateDayValue(records, metric, day) {
  const key = formatDateText(day)
  const values = []
  for (const record of records) {
    if (typeof record.values?.[metric] !== 'number') continue
    if (recordDay(record) !== key) continue
    values.push(record.values[metric])
  }
  if (values.length === 0) return undefined
  if (metric === 'sleep') return Math.max(...values)
  return values.reduce((sum, value) => sum + value, 0)
}

/**
 * Whether one account-day counts as "存入". Accounts reward the minimum
 * effective dose: training > 0, protein above the per-kg floor, water above the
 * floor, sleep above the floor. Reference upper bounds stay informational and
 * never punish a user for "overshooting" a behaviour.
 */
function accountDayMet(spec, value, weight) {
  if (typeof value !== 'number') return false
  if (spec.kind === 'weeklyDays') return value > 0
  if (spec.kind === 'perKg') {
    if (typeof weight !== 'number') return null
    return value >= spec.lowPerKg * weight
  }
  if (typeof spec.low === 'number') return value >= spec.low
  if (typeof spec.high === 'number') return value <= spec.high
  return true
}

/** One-line description of the deposit threshold (lower bound), for the UI. */
function accountDepositLine(spec, metric, weight) {
  const unit = metric?.unit ?? ''
  if (spec.kind === 'weeklyDays') return `每周 ≥${spec.days ?? 0} 天`
  if (spec.kind === 'perKg') {
    return typeof weight === 'number'
      ? `≥${formatBound(spec.lowPerKg * weight, metric)} ${unit}/日`
      : '待补体重'
  }
  if (typeof spec.low === 'number') return `≥${formatBound(spec.low, metric)} ${unit}/日`
  if (typeof spec.high === 'number') return `≤${formatBound(spec.high, metric)} ${unit}/日`
  return '记录即可'
}

/** Build the four behaviour accounts (练 / 吃 / 睡 / 水) for one goal. */
function buildAccounts(goal, resolved, records, latestByMetric, season) {
  const weight = latestWeight(latestByMetric)
  const weekDays = []
  for (let offset = -6; offset <= 0; offset += 1) weekDays.push(addLocalDays(season.today, offset))
  const seasonDays = []
  for (let offset = 0; offset < season.capped; offset += 1) seasonDays.push(addLocalDays(season.startDay, offset))

  const accounts = []
  for (const dimension of goal.dimensions.filter((item) => item.account)) {
    const metricCode = dimension.metrics[0]
    const spec = resolved.find((item) => item.metric === metricCode)
    if (!spec) continue
    const metric = metricOf(metricCode)
    const pending = spec.kind === 'perKg' && typeof weight !== 'number'
    const makeDay = (day) => {
      const value = aggregateDayValue(records, metricCode, day)
      const metRaw = accountDayMet(spec, value, weight)
      return {
        date: formatDateText(day),
        weekday: weekdayLabel(day),
        value: value ?? null,
        display: value === undefined ? null : formatValue(metric, value),
        met: metRaw === true,
        hasRecord: value !== undefined,
        pending: metRaw === null,
      }
    }
    const days = weekDays.map(makeDay)
    const seasonEntries = seasonDays.map(makeDay)
    const metWeek = days.filter((day) => day.met).length
    const deposits = seasonEntries.filter((day) => day.met).length
    const targetDays = spec.kind === 'weeklyDays' ? spec.days ?? 0 : 7
    accounts.push({
      code: dimension.code,
      name: dimension.name,
      role: dimension.role ?? '',
      metric: metricCode,
      unit: metric?.unit ?? '',
      kind: spec.kind,
      targetDisplay: describeTarget(spec, metric, weight),
      depositLine: accountDepositLine(spec, metric, weight),
      pending,
      today: days[days.length - 1],
      week: {
        met: metWeek,
        target: targetDays,
        max: 7,
        label: `${metWeek}/${targetDays} 天`,
        days,
      },
      season: {
        deposits,
        max: season.capped,
        rate: season.capped > 0 ? Number((deposits / season.capped).toFixed(2)) : 0,
        label: `${deposits} 笔`,
      },
    })
  }
  return accounts
}

/** The last 7 days plus evidence counts, shared by the hero and the ledger. */
function buildWeekly(accounts, records, photoDates, season) {
  const start = addLocalDays(season.today, -6)
  const inWindow = (text) => {
    const day = startOfLocalDay(parseAt(text))
    return dayDiff(start, day) >= 0 && dayDiff(day, season.today) >= 0
  }
  const photoDays = new Set(
    photoDates.filter((item) => inWindow(item.takenAt)).map((item) => formatDateText(startOfLocalDay(parseAt(item.takenAt)))),
  ).size
  const recordDays = new Set(records.filter((record) => inWindow(record.measuredAt)).map(recordDay)).size
  const deposits = accounts.reduce((sum, account) => sum + account.week.met, 0)
  return {
    start: formatDateText(start),
    end: formatDateText(season.today),
    deposits,
    max: accounts.length * 7,
    photoDays,
    recordDays,
  }
}

/** Descriptive season statement. No effect claims, no pass/fail judgement. */
function buildSeasonReview(goal, resolved, accounts, records, latestByMetric, photoDates, season) {
  const startMs = season.startDay.getTime()
  const byAccount = accounts.map((account) => ({
    code: account.code,
    name: account.name,
    deposits: account.season.deposits,
    max: account.season.max,
    rate: account.season.rate,
    label: `${account.season.deposits} 笔`,
  }))
  const deposits = byAccount.reduce((sum, item) => sum + item.deposits, 0)
  const max = byAccount.reduce((sum, item) => sum + item.max, 0)
  const training = accounts.find((account) => account.metric === 'training')
  const trainingSpec = resolved.find((item) => item.metric === 'training')
  const weeksElapsed = Math.max(1, Math.ceil(season.elapsedDays / 7))
  const trainingTarget = (trainingSpec?.days ?? 0) * Math.min(weeksElapsed, season.weeks)

  const seasonPhotos = photoDates.filter((item) => {
    const day = startOfLocalDay(parseAt(item.takenAt))
    return dayDiff(season.startDay, day) >= 0 && dayDiff(day, season.today) >= 0
  })
  const photoDays = new Set(seasonPhotos.map((item) => formatDateText(startOfLocalDay(parseAt(item.takenAt))))).size
  const recordDays = new Set(records.filter((record) => {
    const day = startOfLocalDay(parseAt(record.measuredAt))
    return dayDiff(season.startDay, day) >= 0 && dayDiff(day, season.today) >= 0
  }).map(recordDay)).size

  const body = resolved
    .filter((spec) => spec.kind === 'observe')
    .map((spec) => {
      const metric = metricOf(spec.metric)
      const series = records
        .filter((record) => typeof record.values[spec.metric] === 'number')
        .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1))
      const seasonSeries = series.filter((record) => parseAt(record.measuredAt) >= startMs)
      const baseline = seasonSeries[0] ?? null
      const latestRecord = series[series.length - 1] ?? null
      // One record cannot be compared with itself; report no delta until the
      // next body-composition record lands in this season.
      const comparable = Boolean(baseline && latestRecord && baseline !== latestRecord)
      const delta = comparable
        ? Number((latestRecord.values[spec.metric] - baseline.values[spec.metric]).toFixed(metric?.decimals ?? 1))
        : null
      return {
        metric: spec.metric,
        name: metric?.name ?? spec.metric,
        unit: metric?.unit ?? '',
        baseline: baseline ? baseline.values[spec.metric] : null,
        baselineAt: baseline?.measuredAt ?? null,
        latest: latestRecord?.values[spec.metric] ?? null,
        latestAt: latestRecord?.measuredAt ?? null,
        single: Boolean(baseline && latestRecord && !comparable),
        delta,
        deltaDisplay: delta === null ? null : formatSignedDelta(delta, metric),
        band: {
          low: typeof spec.low === 'number' ? spec.low : null,
          high: typeof spec.high === 'number' ? spec.high : null,
          label: spec.bandLabel ?? '',
        },
      }
    })

  return {
    ended: season.ended,
    week: season.week,
    weeks: season.weeks,
    weeksElapsed,
    days: season.elapsedDays,
    deposits,
    max,
    rate: max > 0 ? Number((deposits / max).toFixed(2)) : 0,
    byAccount,
    trainingDays: training?.season.deposits ?? 0,
    trainingTarget,
    photoCount: seasonPhotos.length,
    photoDays,
    recordDays,
    body,
    note: '体成分受设备、饮水、进食等影响，变化仅供记录参考，不构成效果承诺。',
  }
}

/**
 * Build the goal dashboard payload for one binding.
 *
 * @param {object} binding   Stored member goal.
 * @param {GoalDef} goal     Template.
 * @param {object} member    Member document.
 * @param {Array<object>} ownedRecords  Records owned by the member.
 * @param {Record<string, { value: number, measuredAt: string }>} latestByMetric
 * @param {number} [now]
 * @param {Array<{ takenAt: string }>} [photoDates]  Progress photo dates for evidence counts.
 * @returns {object}
 */
export function buildGoalProgress(
  binding,
  goal,
  member,
  ownedRecords,
  latestByMetric,
  now = Date.now(),
  photoDates = [],
) {
  const resolved = resolveGoalTargets(goal, member, binding.targets)
  const season = goal.season ? seasonWindow(goal, binding, now) : null
  const seasonStart = season ? season.startDay.getTime() : null
  const targets = resolved.map((spec) =>
    evaluateGoalTarget(spec, { latestByMetric, records: ownedRecords, now, seasonStart }),
  )
  const scored = targets.filter((row) => row.kind !== 'trend' && row.kind !== 'observe')
  const week = recentDayKeySet(now, 7)
  const lastRecordAt = ownedRecords.reduce(
    (latest, record) => (!latest || record.measuredAt > latest ? record.measuredAt : latest),
    null,
  )
  const monthAgo = now - MONTH_MS
  const recordDays7 = new Set(ownedRecords.filter((record) => week.has(dayKey(record.measuredAt))).map(recordDay)).size
  const recordDays30 = new Set(
    ownedRecords.filter((record) => parseAt(record.measuredAt) >= monthAgo).map(recordDay),
  ).size
  const photoDays7 = new Set(
    photoDates
      .filter((item) => week.has(dayKey(item.takenAt)))
      .map((item) => formatDateText(startOfLocalDay(parseAt(item.takenAt)))),
  ).size

  const dimensions = goal.dimensions.map((dimension) => ({
    code: dimension.code,
    name: dimension.name,
    account: Boolean(dimension.account),
    role: dimension.role ?? '',
    metrics: dimension.metrics.map((code) => {
      const metric = metricOf(code)
      const rows = ownedRecords
        .filter((record) => typeof record.values[code] === 'number')
        .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1))
      const latest = latestByMetric[code]
      const recent7 = rows.filter((record) => week.has(dayKey(record.measuredAt)))
      const recent30 = rows.filter((record) => now - parseAt(record.measuredAt) <= MONTH_MS)
      const days7 = new Set(recent7.map((record) => dayKey(record.measuredAt))).size
      const avg7 = recent7.length > 0
        ? recent7.reduce((sum, record) => sum + record.values[code], 0) / recent7.length
        : null
      return {
        code,
        name: metric?.name ?? code,
        unit: metric?.unit ?? '',
        latest: latest?.value ?? null,
        display: latest ? formatValue(metric, latest.value) : null,
        measuredAt: latest?.measuredAt ?? null,
        count7: recent7.length,
        count30: recent30.length,
        days7,
        avg7: avg7 === null ? null : Number(avg7.toFixed(metric?.decimals ?? 1)),
        daysSinceLast: latest?.measuredAt
          ? Math.floor((now - parseAt(latest.measuredAt)) / DAY_MS)
          : null,
      }
    }),
  }))

  // The metabolic goal has its own ledger engine: behaviour accounts plus the
  // indicator statement, review cycle and visit summary. Lean-muscle keeps the
  // account/season engine below. Keeping them separate means neither redesign
  // can silently change the other goal's numbers.
  const metabolic = goal.code === 'metabolic' && season
    ? buildMetabolicProgress({
        goal,
        binding,
        member,
        records: ownedRecords,
        season,
        resolved,
        now,
      })
    : null
  const accounts = metabolic?.accounts ?? (season ? buildAccounts(goal, resolved, ownedRecords, latestByMetric, season) : [])
  const weekly = metabolic?.weekly ?? (season ? buildWeekly(accounts, ownedRecords, photoDates, season) : null)
  const seasonReview = metabolic
    ? null
    : season
      ? buildSeasonReview(goal, resolved, accounts, ownedRecords, latestByMetric, photoDates, season)
      : null
  const seasonEndDay = season ? addLocalDays(season.startDay, season.totalDays - 1) : null
  const seasonNo = num(binding.seasonNo) ?? 1
  const cycleKind = goal.cycleKind ?? 'season'

  // Keep account target rows consistent with the daily ledger: the row shows
  // today's aggregate (sum for training/protein/water, max for sleep), and its
  // status follows the *deposit floor* rather than the reference upper bound.
  const accountByMetric = new Map(accounts.map((account) => [account.metric, account]))
  for (const row of targets) {
    const account = accountByMetric.get(row.metric)
    if (!account) continue
    // Metabolic account rows describe the weekly behaviour target (days), not the
    // raw metric target: keep the goal card consistent with the ledger.
    if (goal.code === 'metabolic') row.targetDisplay = account.targetDisplay
    if (row.kind === 'weeklyDays') {
      const hasAny = account.week.days.some((day) => day.hasRecord)
      row.current = hasAny ? account.week.met : null
      row.currentDisplay = hasAny ? String(account.week.met) : null
      row.measuredAt = hasAny ? account.week.days.find((day) => day.hasRecord).date : null
      row.status = !hasAny
        ? 'unknown'
        : account.week.met >= account.week.target
          ? 'normal'
          : 'low'
      continue
    }
    const today = account.today
    row.current = today?.value ?? null
    row.currentDisplay = today?.display ?? null
    row.measuredAt = today?.hasRecord ? today.date : null
    if (account.pending) {
      row.status = 'pending'
      continue
    }
    if (!today?.hasRecord) {
      row.status = 'unknown'
      continue
    }
    const weight = latestWeight(latestByMetric)
    const resolvedSpec = resolved.find((item) => item.metric === row.metric)
    const floor = resolvedSpec?.kind === 'perKg' && typeof weight === 'number'
      ? resolvedSpec.lowPerKg * weight
      : row.low
    row.status = typeof floor === 'number' && today.value < floor ? 'low' : 'normal'
  }

  const isWeeklyAccount = (account) => account.cadence === 'weekly' || account.metric === 'training'
  const met = accounts.length > 0
    ? accounts.filter((account) =>
        isWeeklyAccount(account)
          ? account.week.met >= account.week.target
          : account.today?.met === true).length
    : targets.filter((row) => row.kind !== 'trend' && row.kind !== 'observe' && row.status === 'normal').length
  const measured = accounts.length > 0
    ? accounts.filter((account) => account.week.days.some((day) => day.hasRecord)).length
    : targets.filter((row) => row.kind !== 'trend' && row.kind !== 'observe' && row.measuredAt !== null).length
  const evaluable = accounts.length > 0
    ? accounts.length
    : targets.filter((row) => row.kind !== 'trend' && row.kind !== 'observe').length

  return {
    id: binding.id,
    code: goal.code,
    name: goal.name,
    shortName: goal.shortName,
    domain: goal.domain,
    domainName: domainName(goal.domain),
    tagline: goal.tagline,
    audience: goal.audience,
    status: binding.status,
    statusName: statusName(binding.status),
    source: binding.source,
    sourceName: sourceName(binding.source),
    note: binding.note ?? '',
    startedAt: binding.startedAt ?? null,
    updatedAt: binding.updatedAt ?? null,
    season: season
      ? {
          no: seasonNo,
          kind: cycleKind,
          weeks: season.weeks,
          week: season.week,
          day: season.elapsedDays,
          days: season.totalDays,
          daysLeft: season.daysLeft,
          progress: Number((season.capped / season.totalDays).toFixed(2)),
          startedAt: formatDateText(season.startDay),
          endsAt: formatDateText(seasonEndDay),
          ended: season.ended,
          label: cycleKind === 'review'
            ? `第 ${seasonNo} 个复查周期 · 第 ${season.week} 周 / ${season.weeks} 周`
            : `第 ${seasonNo} 赛季 · 第 ${season.week} 周 / ${season.weeks} 周`,
          checkpoints: (goal.season?.checkpoints ?? []).map((checkpointWeek) => ({
            week: checkpointWeek,
            label: `W${checkpointWeek}`,
            reached: season.elapsedDays >= checkpointWeek * 7,
            hint: cycleKind === 'review'
              ? checkpointWeek >= season.weeks
                ? '复查准备'
                : checkpointWeek === 4
                  ? '第一次对账'
                  : '第二次对账'
              : null,
          })),
        }
      : null,
    accounts,
    weekly,
    seasonReview,
    metabolic,
    playbook: (goal.playbook ?? []).map((card) => ({ ...card })),
    targets,
    dimensions,
    coverage: {
      met,
      measured,
      evaluable,
      // `ratio` keeps its old meaning (share of scored rows that have data);
      // `metRatio` is the share that currently meets its behaviour target.
      ratio: evaluable > 0 ? Number((measured / evaluable).toFixed(2)) : 0,
      metRatio: evaluable > 0 ? Number((met / evaluable).toFixed(2)) : 0,
      lastRecordAt,
      recordDays7,
      recordDays30,
      photoDays7,
      depositRate7: weekly && weekly.max > 0 ? Number((weekly.deposits / weekly.max).toFixed(2)) : 0,
    },
    notes: goal.notes,
    disclaimer: goal.disclaimer,
  }
}

/** Panel/tool-facing template summary (no member-specific values). */
export function describeGoalTemplate(goal) {
  return {
    code: goal.code,
    name: goal.name,
    shortName: goal.shortName,
    domain: goal.domain,
    domainName: domainName(goal.domain),
    cycleKind: goal.cycleKind ?? null,
    tagline: goal.tagline,
    audience: goal.audience,
    dimensions: goal.dimensions.map((dimension) => ({
      ...dimension,
      metrics: [...dimension.metrics],
      account: Boolean(dimension.account),
      role: dimension.role ?? '',
    })),
    quickMetrics: [...goal.quickMetrics],
    targets: goal.targets.map((spec) => {
      const metric = metricOf(spec.metric)
      return {
        metric: spec.metric,
        name: metric?.name ?? spec.metric,
        unit: metric?.unit ?? '',
        kind: spec.kind,
        low: typeof spec.low === 'number' ? spec.low : null,
        high: typeof spec.high === 'number' ? spec.high : null,
        days: typeof spec.days === 'number' ? spec.days : null,
        targetDisplay: describeTemplateTarget(spec, metric),
        note: spec.note,
      }
    }),
    season: goal.season ? { weeks: goal.season.weeks, checkpoints: [...goal.season.checkpoints] } : null,
    playbook: (goal.playbook ?? []).map((card) => ({ ...card })),
    notes: [...goal.notes],
    disclaimer: goal.disclaimer,
  }
}
