/**
 * Host half of the health-management plugin.
 *
 * Registers the agent-facing tools and the safety section that forbids
 * diagnosis, medication and treatment advice. All writes go through one shared
 * HealthService so the tools and the Web panel cannot diverge.
 */

import { readFile, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HealthService,
  DISCLAIMER,
  GOAL_DISCLAIMER,
  MAX_MEMBERS,
  CONTEXTS,
  RELATIONS,
  RISK_LEVELS,
  MEAL_TYPES,
  DOCUMENT_TYPES,
  METRIC_CATEGORIES,
} from './lib/service.js'
import { METRICS } from './lib/metrics.js'
import { conditionCodes } from './lib/conditions.js'
import { GOALS, GOAL_SOURCES, GOAL_STATUSES, goalCodes } from './lib/goals.js'
import { CommunityStore } from './lib/community.js'
import { VENUE_REGION, YUYANG_VENUES } from './lib/venues.js'
import { FloatSettingsStore, floatStatus } from './lib/float.js'
import {
  EstimateSettingsStore,
  normalizeEstimateSettings,
  buildEstimateCatalog,
  updateEstimateSettings,
  resolveEstimateRoute,
} from './lib/estimate.js'

export const name = 'dsh-health-management'
export const inject = ['tools', 'systemPrompt', 'webServer', 'workingDirectory']

/** Section name that carries the medical safety boundary into every step. */
const SAFETY_SECTION = 'health-management-safety'

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const HERO_ART_PATH = join(PLUGIN_DIR, 'assets', 'hero-torso.webp')
let heroArtCache
let heroArtMtime = 0
const AVATAR_ART_PATH = join(PLUGIN_DIR, 'assets', 'avatar-muscle-king.webp')
let avatarArtCache
let avatarArtMtime = 0

const text = (value) => [{ type: 'text', text: value }]

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ dataDir?: string }} config
 */
export function apply(ctx, config) {
  const baseDir = config?.dataDir
    ? config.dataDir
    : join(ctx.workingDirectory?.defaultDirectory ?? process.cwd(), '.dsh-health')

  const service = new HealthService(baseDir)
  // Local preview of the invite-only squad service. Same API shape as the
  // future remote service; only aggregate behaviour snapshots are stored.
  const community = new CommunityStore(join(baseDir, 'community.json'))
  // Floating-avatar preferences (show/hide, reminder cadence, saved position).
  // Kept beside the health documents so the Web panel can read them without a
  // profile-file edit and every browser window sees the same state.
  const floatStore = new FloatSettingsStore(join(baseDir, 'float.json'))
  // Which model reads the meal photo. A device preference (the user's own
  // provider/budget), not health data; `auto` keeps the historical behaviour.
  const estimateStore = new EstimateSettingsStore(join(baseDir, 'estimate.json'))

  // Report what the profile actually mounts, so the storage decision is based
  // on evidence rather than on the config directory's `absent` status.
  const storageProbe = {
    hasStorage: ctx.get('storage') !== undefined,
    backends: (() => {
      try {
        return ctx.storage?.backend?.names?.() ?? 'no storage service'
      } catch (error) {
        return `error: ${String(error?.message ?? error)}`
      }
    })(),
    hasStorageDomain: ctx.get('storageDomain') !== undefined,
  }
  ctx.logger?.info?.(`[health-management] storage probe: ${JSON.stringify(storageProbe)}`)

  // Load the data documents once at activation so the first tool call does not
  // pay for it; a load failure is retried on the next call and surfaced to the model.
  const ready = service.init().catch((error) => {
    ctx.logger?.error?.(`[health-management] data documents failed to initialize: ${String(error)}`)
  })
  const tool = createTool(ready)

  // ---------------------------------------------------------------- prompt

  ctx.effect(() =>
    ctx.systemPrompt.section({
      name: SAFETY_SECTION,
      order: 250,
      text: [
        '## 健康管理数据',
        '',
        '你可以帮助用户管理家庭成员的健康：记录与查看指标（血压、血糖、血脂、心率、体重、尿酸、腰围、体脂率、骨骼肌量、蛋白质摄入、热量摄入、力量训练时长、中等强度活动时长、含糖饮料、饮水量、睡眠时长），按管理目标展示目标差距与记录覆盖度，并归档健康档案。',
        '',
        '**饮食记录：** 面板里每餐可记录餐次、热量、蛋白质与备注，并可附一张照片（拍照估算由面板完成，估算结果必须由用户确认后才保存）。热量只记录与展示，不做达标判定，不给出热量缺口建议；食物不贴「干净/垃圾」等标签，不按食物评价用户。',
        '',
        '**管理目标（Goal）**表示用户「想管理什么」，是意愿而不是诊断，与疾病标签相互独立。现有目标模板：',
        ...GOALS.map((goal) => `- ${goal.name}（${goal.code}）：${goal.tagline}。`),
        '可以激活/暂停目标、设置该目标的个人目标值、展示目标差距与记录覆盖度。',
        '薄肌管理在产品里呈现为「薄肌账户」：大练 / 大餐 / 大睡 / 大水四个行为账户可计分；体脂率、体重、骨骼肌量、腰围等体成分只做参考区间与趋势的「对账单」，不设达标评分；12 周一个赛季，可开启新赛季。描述时区分「行为账户的存入情况」与「体成分的变化」，不要把体成分变化表述为效果承诺或诊断依据。',
        '代谢综合征管理在产品里呈现为「代谢对账簿」：测 / 吃 / 动 / 睡四个行为账户可计分（本周存入格数与周对账）；12 周一个复查周期；腰围、血压、空腹血糖、甘油三酯、HDL-C 等核心指标只做参考区间、均值与趋势的「对账单」，**不计算「符合几项」、不判断是否患病、不做 CKM 或任何危险分层**；另有「就诊摘要」把家庭监测、最近化验、行为覆盖整理成一页可复制文本，供用户带给医生。描述时区分「行为存入」与「指标变化」，单次读数不单独下结论（血压优先讲近 7 天均值与测量天数）。',
        '不得因为指标数值建议用户激活某个目标；是否管理某个目标由用户决定，可建议咨询医生。',
        '',
        '**禁止事项（不可违反）：**',
        '- 不得给出任何用药建议、停药建议、剂量调整建议。',
        '- 不得给出任何诊断结论或疾病判断。',
        '- 不得给出任何治疗方案。',
        '- 不得基于这些数据推断患有或可能患有某种疾病。',
        '- 不得输出代谢综合征、糖尿病、高脂血症、高尿酸血症等疾病结论，也不得输出「符合 N 项」「CKM 分期」或任何危险分层。',
        '- 不得把管理目标的设定、达标或未达标表述为疾病诊断依据。',
        '- 薄肌等体态目标：不得生成个性化训练计划、动作/组数、食谱或补剂建议，不承诺效果；只做记录、参考区间与趋势的展示。',
        '- 代谢目标：不得生成个性化食谱、热量处方、运动处方或训练计划，不得推荐补剂；膳食与活动只展示国家/WHO 公开参考数字。',
        '- 不得对体脂、体重、体型做道德评价或身体羞辱；不得使用排行榜或与他人身材/指标比较；不得把食物分成「干净/垃圾」并据此评判用户。',
        '',
        '**允许：**',
        '- 描述数据的变化趋势与波动。',
        '- 指出某项指标高于或低于参考区间，并说明参考区间的来源。',
        '- 展示管理目标的目标值、当前值、差距与记录覆盖度（描述性统计）。',
        '- 展示薄肌账户的存入笔数、周对账、赛季结算等描述性统计。',
        '- 展示代谢对账簿的行为账户存入、周对账、复查周期、核心指标参考区间与趋势、就诊摘要。',
        '- 建议用户携带这些数据去咨询医生。',
        '',
        '**归属规则：** 记录数据时必须确认属于哪位家庭成员。家庭成员多于一位而用户未指明时，必须先询问，绝不能自行猜测归属。',
        '**录入确认：** 从图片识别出的数值必须先展示给用户确认，禁止把识别结果直接写入记录。',
        '',
        `管理目标说明：${GOAL_DISCLAIMER}`,
        `免责声明（向用户展示任何健康数据结论时应一并说明）：${DISCLAIMER}`,
      ].join('\n'),
    }),
  )

  // ---------------------------------------------------------------- tools

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_member_create',
      description:
        '新增家庭成员。必须提供姓名和性别（尿酸与 HDL 的参考区间分性别）。最多 8 位成员。关系字段用于维护亲属关系。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '成员称呼，如「我」' },
          sex: { type: 'string', enum: ['male', 'female'], description: '性别，必填' },
          relation: {
            type: 'string',
            enum: RELATIONS.map((item) => item.code),
            description: `与本人的关系：${RELATIONS.map((item) => `${item.code}=${item.name}`).join('，')}`,
          },
          birthYear: { type: 'integer', description: '出生年份，可选' },
          height: {
            type: 'number',
            description: '身高（cm，选填，80–250），用于录入体重时自动计算 BMI',
          },
          riskLevel: {
            type: 'string',
            enum: RISK_LEVELS.map((item) => item.code),
            description: `心血管风险分层（选填，默认 unknown=未评估；该字段只影响 LDL 等参考区间，不代表诊断）：${RISK_LEVELS.map((item) => `${item.code}=${item.name}`).join('，')}`,
          },
          targets: {
            type: 'object',
            description: '医生设定的个人目标值，覆盖通用参考区间，如 {"ldl": 1.8}',
            additionalProperties: { type: 'number' },
          },
          note: { type: 'string', description: '备注，如既往病史（仅记录，不作判断）' },
        },
        required: ['name', 'sex'],
        additionalProperties: false,
      },
      execute: (args) => service.createMember(args),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_member_list',
      description: '列出全部家庭成员及其风险分层和个人目标值。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const members = await service.listMembers()
        return { ok: true, total: members.length, maxMembers: MAX_MEMBERS, members }
      },
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_member_update',
      description: '修改家庭成员资料：称呼、性别、关系、身高、风险分层、出生年份、个人目标值或备注。只修改提供的字段。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id' },
          name: { type: 'string' },
          sex: { type: 'string', enum: ['male', 'female'] },
          relation: { type: 'string', enum: RELATIONS.map((item) => item.code) },
          height: {
            type: ['number', 'null'],
            description: '身高（cm，选填，80–250）；传 null 表示清除，用于自动计算 BMI',
          },
          riskLevel: {
            type: 'string',
            enum: RISK_LEVELS.map((item) => item.code),
            description: `心血管风险分层（选填，默认 unknown=未评估；该字段只影响 LDL 等参考区间，不代表诊断）`,
          },
          birthYear: { type: 'integer' },
          targets: {
            type: 'object',
            description: '要合并的个人目标值；值设为 null 表示删除该目标',
            additionalProperties: { type: ['number', 'null'] },
          },
          note: { type: 'string' },
        },
        required: ['member'],
        additionalProperties: false,
      },
      execute: (args) => {
        const { member, ...patch } = args
        return service.updateMember(member, patch)
      },
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_record',
      description:
        '记录一次测量或健康日志。一次可包含多个指标（例如同时量的血压、心率），也用于记录体成分、饮食与训练。多个成员时必须指明记录属于谁；无法确定时返回错误，不会猜测。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
          measuredAt: {
            type: 'string',
            description: '测量/记录时间，如「2026-11-10 07:12」「今天 7:12」「昨天 20点」。省略则为当前时间',
          },
          context: {
            type: 'string',
            enum: CONTEXTS.map((item) => item.code),
            description: `情境：${CONTEXTS.map((item) => `${item.code}=${item.name}`).join('，')}`,
          },
          mealType: {
            type: 'string',
            enum: MEAL_TYPES.map((item) => item.code),
            description: `记一餐时的餐次（选填）：${MEAL_TYPES.map((item) => `${item.code}=${item.name}`).join('，')}`,
          },
          values: {
            type: 'object',
            description: `指标数值，键为指标代码：${METRICS.map((metric) => `${metric.code}(${metric.name})`).join(' ')}`,
            additionalProperties: { type: 'number' },
          },
          source: {
            type: 'string',
            enum: ['text', 'image', 'form'],
            description: '录入来源，默认 text',
          },
          note: { type: 'string', description: '备注' },
        },
        required: ['values'],
        additionalProperties: false,
      },
      execute: (args) => service.record(args),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_meal_list',
      description:
        '列出某位成员的饮食记录（餐次、热量、蛋白质、备注、条目与照片元数据），按时间倒序。只做记录展示，不做热量达标判断，不给出饮食或热量建议。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
          from: { type: 'string', description: '起始时间，如 2026-11-01' },
          to: { type: 'string', description: '结束时间，如 2026-11-14' },
          limit: { type: 'integer', description: '最多返回条数，默认 60，上限 200' },
        },
        additionalProperties: false,
      },
      execute: (args) => service.listMeals(args.member, { from: args.from, to: args.to, limit: args.limit }),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_query',
      description: '按成员、时间范围或指标查询测量记录，返回原始记录，不做解读。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；省略则查询全部成员' },
          from: { type: 'string', description: '起始时间，如 2026-08-01' },
          to: { type: 'string', description: '结束时间，如 2026-11-10' },
          metrics: {
            type: 'array',
            items: { type: 'string' },
            description: '只返回包含这些指标代码的记录',
          },
          limit: { type: 'integer', description: '最多返回条数，默认 50，上限 500' },
        },
        additionalProperties: false,
      },
      execute: (args) => service.query(args),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_stats',
      description:
        '计算某个成员某项指标的描述性统计（样本数、均值、中位数、最大最小、P90、达标数、按天变化斜率）。只返回数字，不返回任何解读或建议。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
          metric: { type: 'string', description: '指标代码，如 sbp、ldl、fpg' },
          from: { type: 'string', description: '起始时间' },
          to: { type: 'string', description: '结束时间' },
        },
        required: ['metric'],
        additionalProperties: false,
      },
      execute: (args) => service.stats(args),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_metrics',
      description: `列出可记录的指标（分类：${METRIC_CATEGORIES.map((item) => item.name).join('、')}）及针对某个成员解析后的参考区间（按性别、风险分层、个人目标值解析）。`,
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id' },
        },
        additionalProperties: false,
      },
      execute: (args) => service.metricCatalog(args.member),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_goal_list',
      description:
        '列出管理目标模板，以及某位成员当前的目标状态。管理目标表示用户「想管理什么」，不等于诊断；疾病标签才代表医生诊断或用户确认的事实。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
        },
        additionalProperties: false,
      },
      execute: async (args) => {
        const templates = service.goalTemplates()
        if (args.member) return service.listGoals(args.member)
        const members = await service.listMembers()
        if (members.length === 1) return service.listGoals(members[0].id)
        return {
          ok: true,
          total: 0,
          goals: [],
          templates: templates.templates,
          disclaimer: templates.disclaimer,
          needsMember: members.length > 1,
          error:
            members.length > 1
              ? `家里有 ${members.length} 位成员，请指明要查看谁的管理目标：${members.map((item) => item.name).join('、')}`
              : undefined,
          members: members.map((item) => item.name),
        }
      },
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_goal_set',
      description:
        '为成员激活或更新一个管理目标。目标表示「要管理什么」，不是诊断；source=report 仅用于医生已建议该目标的情况。targets 为该目标的个人目标值（覆盖模板参考值，值设为 null 表示删除），键为指标代码。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
          code: {
            type: 'string',
            enum: goalCodes(),
            description: `目标代码：${GOALS.map((goal) => `${goal.code}=${goal.name}`).join('，')}`,
          },
          status: {
            type: 'string',
            enum: GOAL_STATUSES.map((item) => item.code),
            description: `目标状态，默认 active：${GOAL_STATUSES.map((item) => `${item.code}=${item.name}`).join('，')}`,
          },
          source: {
            type: 'string',
            enum: GOAL_SOURCES.map((item) => item.code),
            description: `来源，默认 manual：${GOAL_SOURCES.map((item) => `${item.code}=${item.name}`).join('，')}`,
          },
          targets: {
            type: 'object',
            description: '该目标的个人目标值，如 {"sbp": 130}、{"bodyfat": 15}',
            additionalProperties: { type: ['number', 'null'] },
          },
          note: { type: 'string', description: '备注，如医生建议内容' },
        },
        required: ['code'],
        additionalProperties: false,
      },
      execute: (args) => {
        const { member, ...input } = args
        return service.setGoal(member, input)
      },
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_goal_remove',
      description: '移除成员的一个管理目标（按目标代码或绑定 id）。只删除目标绑定，不删除测量记录。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
          code: { type: 'string', description: '目标代码或绑定 id' },
        },
        required: ['code'],
        additionalProperties: false,
      },
      execute: (args) => service.removeGoal(args.member, args.code),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_goal_overview',
      description:
        '展示成员的管理目标进度：每个目标的目标值 vs 最新值、差距、数据覆盖度，以及近 7/30 天的追踪维度（记录次数、记录日均值、训练天数等）。薄肌目标返回赛季、四个行为账户、周对账单与赛季结算；代谢目标返回复查周期、测/吃/动/睡四个行为账户、周对账、核心指标对账单与就诊摘要（均为描述性统计）。不构成诊断或建议。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
        },
        additionalProperties: false,
      },
      execute: (args) => service.goalOverview(args.member),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_goal_review',
      description:
        '查看某成员管理目标的周期 / 周报 / 对账单。薄肌返回赛季、四账户、体成分基线与变化；代谢返回复查周期、四账户、指标对账单、最近化验、周期复盘与就诊摘要。只返回描述性统计，不做效果判断，不构成诊断、训练或营养建议。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
          code: {
            type: 'string',
            enum: goalCodes(),
            description: `目标代码：${GOALS.map((goal) => `${goal.code}=${goal.name}`).join('，')}`,
          },
        },
        additionalProperties: false,
      },
      execute: (args) => service.goalReview(args.member, { code: args.code }),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_goal_visit_summary',
      description:
        '生成某成员代谢目标的「就诊摘要」：家庭监测、最近化验、行为记录、记录覆盖、想问医生的问题与免责声明。只汇总用户自行记录的事实与参考区间，不含诊断、治疗、用药、食谱或训练建议；建议用户复制后带给医生。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
          code: {
            type: 'string',
            enum: goalCodes(),
            description: '目标代码，默认 metabolic',
          },
        },
        additionalProperties: false,
      },
      execute: (args) => service.goalVisitSummary(args.member, { code: args.code ?? 'metabolic' }),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_goal_start_season',
      description:
        '为周期制目标（薄肌赛季 / 代谢复查周期）开启新周期：周期序号 +1、起点重置为现在，历史记录与照片不删除。仅在用户明确要求开启新周期/新赛季时调用。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id；只有一个成员时可省略' },
          code: {
            type: 'string',
            enum: goalCodes(),
            description: `目标代码，默认 lean_muscle：${GOALS.map((goal) => `${goal.code}=${goal.name}`).join('，')}`,
          },
        },
        additionalProperties: false,
      },
      execute: (args) => service.startGoalSeason(args.member, args.code ?? 'lean_muscle'),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_record_delete',
      description: '删除一条测量记录（按记录 id）。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '记录 id' } },
        required: ['id'],
        additionalProperties: false,
      },
      execute: (args) => service.deleteRecord(args.id),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_member_delete',
      description:
        '删除一位家庭成员及其全部数据（测量记录、疾病标签、档案、管理目标）。有数据时必须显式传 cascade=true 确认。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id' },
          cascade: {
            type: 'boolean',
            description: '确认级联删除其全部数据；有数据时为 true 才执行',
          },
        },
        required: ['member'],
        additionalProperties: false,
      },
      execute: (args) => service.deleteMember(args.member, args.cascade),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_condition_list',
      description: '列出某位成员的疾病标签（来源：报告诊断 report / 手动 manual / 指标识别后确认 recognized）。',
      parameters: {
        type: 'object',
        properties: { member: { type: 'string', description: '成员称呼或 id' } },
        additionalProperties: false,
      },
      execute: (args) => service.listConditions(args.member),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_condition_add',
      description:
        '为成员添加疾病标签。source=report 表示转录报告中的医生诊断；manual 表示用户手动添加；recognized 表示指标候选经用户确认后添加。绝不基于数值自动推断打标。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id' },
          code: {
            type: 'string',
            enum: conditionCodes(),
            description: `疾病代码：${conditionCodes().join(', ')}`,
          },
          source: {
            type: 'string',
            enum: ['report', 'manual', 'recognized'],
            description: '标签来源，必填',
          },
          note: { type: 'string', description: '备注，如诊断出处、日期' },
        },
        required: ['member', 'code', 'source'],
        additionalProperties: false,
      },
      execute: (args) => service.addCondition(args.member, { code: args.code, source: args.source, note: args.note }),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_condition_remove',
      description: '移除成员的一个疾病标签（按标签 id 或疾病代码）。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id' },
          code: { type: 'string', description: '标签 id 或疾病代码' },
        },
        required: ['member', 'code'],
        additionalProperties: false,
      },
      execute: (args) => service.removeCondition(args.member, args.code),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_condition_suggest',
      description:
        '根据成员最新指标值给出候选疾病提示（如血压达 140/90）。仅提示，不落库、不诊断；用户确认后再用 health_condition_add 添加。',
      parameters: {
        type: 'object',
        properties: { member: { type: 'string', description: '成员称呼或 id' } },
        additionalProperties: false,
      },
      execute: (args) => service.suggestConditionsForMember(args.member),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_condition_targets',
      description:
        '按疾病标签列出目标指标与当前指标，展示达标差距。目标为指南推荐并由医生个体化调整，不构成诊断。',
      parameters: {
        type: 'object',
        properties: { member: { type: 'string', description: '成员称呼或 id' } },
        additionalProperties: false,
      },
      execute: (args) => service.conditionTargets(args.member),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_document_list',
      description: '列出某位成员的健康档案（病历、处方、检验报告、影像等），可按类型过滤。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id' },
          type: { type: 'string', description: `档案类型：${DOCUMENT_TYPES.map((t) => t.code).join(', ')}` },
        },
        additionalProperties: false,
      },
      execute: (args) => service.listDocuments(args.member, { type: args.type }),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_document_add',
      description: '登记一份健康档案的元数据（病历/处方/检验报告等）。文件本身需先存放到数据目录，再由本工具登记。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id' },
          type: {
            type: 'string',
            enum: DOCUMENT_TYPES.map((t) => t.code),
            description: `档案类型：${DOCUMENT_TYPES.map((t) => `${t.code}=${t.name}`).join('，')}`,
          },
          title: { type: 'string', description: '档案标题，如「2026-11 体检报告」' },
          docDate: { type: 'string', description: '档案日期，如 2026-11-10' },
          note: { type: 'string', description: '备注' },
          filePath: { type: 'string', description: '文件存放路径（相对或绝对）' },
          fileName: { type: 'string', description: '原始文件名' },
          size: { type: 'number', description: '文件大小（字节）' },
        },
        required: ['member', 'type'],
        additionalProperties: false,
      },
      execute: (args) => service.addDocument(args.member, args),
    })),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_document_remove',
      description: '删除一份健康档案的元数据（按档案 id）。',
      parameters: {
        type: 'object',
        properties: {
          member: { type: 'string', description: '成员称呼或 id' },
          id: { type: 'string', description: '档案 id' },
        },
        required: ['member', 'id'],
        additionalProperties: false,
      },
      execute: (args) => service.removeDocument(args.member, args.id),
    })),
  )

  // -------------------------------------------------- host request gate
  //
  // Routes registered on the bare `webServer` never pass through the host's
  // own Host/Origin fence and browser login, so a page open in the user's
  // browser could call this panel's routes. Ask the host's Connection service
  // for the verdict it would give its own API (#603) and answer with it. A
  // host that predates that service keeps the routes exactly as they were.

  /** @returns {number|undefined} the host's rejection status for this request. */
  function admissionStatus(request) {
    const connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
    const gate = connection?.requestRejection
    if (typeof gate !== 'function') return undefined
    try {
      const status = gate.call(connection, request)
      return typeof status === 'number' ? status : undefined
    } catch {
      return 500
    }
  }

  /** @returns {Response|undefined} a refusal to answer with, or undefined to proceed. */
  function refusal(request) {
    const status = admissionStatus(request)
    if (status === undefined) return undefined
    return new Response(status === 401 ? '登录后才能访问健康数据。' : '请求未被宿主接纳。', {
      status,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  }

  /** @returns {boolean} true when the request was refused and answered here. */
  function refuseHandler(req, res) {
    const status = admissionStatus(req)
    if (status === undefined) return false
    writeJson(res, status, {
      ok: false,
      error: status === 401 ? '登录后才能访问健康数据。' : '请求未被宿主接纳。',
    })
    return true
  }

  // -------------------------------------------------- panel-facing HTTP routes
  //
  // The Web panel is a plain browser module with no Host RPC handle, so the
  // Host serves its data over same-origin routes that call the same
  // HealthService the tools use. Read uses GET; mutations use POST so a stray
  // GET or prefetch can never change data. All state is local to this machine.

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/overview',
      resource: async (request) => {
        const denied = refusal(request)
        if (denied) return denied
        await ready
        const url = new URL(request.url, 'http://localhost')
        const member = url.searchParams.get('member') ?? undefined
        try {
          return json(await service.overview(member))
        } catch (error) {
          return json({ ok: false, error: String(error?.message ?? error) }, 500)
        }
      },
    }),
  )

  // -------------------------------------------------- floating avatar (Web)
  //
  // The avatar itself is a Client decoration, but its preferences are profile
  // data: the Settings section writes them here so show/hide and the saved
  // position survive a reload and every DSH Web window agrees. Status is
  // aggregate-only (see lib/float.js) so a reminder can never be derived from
  // an abnormal measurement.

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/float',
      resource: async (request) => {
        const denied = refusal(request)
        if (denied) return denied
        try {
          await ready
          const [settings, status] = await Promise.all([
            floatStore.get(),
            floatStatus(service),
          ])
          return json({ ok: true, settings, status })
        } catch (error) {
          return json({ ok: false, error: String(error?.message ?? error) }, 500)
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/float/settings',
      handler: async (req, res) => {
        if (refuseHandler(req, res)) return
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, error: '只接受 POST。' })
          return
        }
        // Settings can carry a small inlined avatar image; allow 2 MiB total
        // while the per-image limit stays much smaller in lib/float.js.
        if (Number(req.headers?.['content-length'] ?? 0) > 2 * 1024 * 1024) {
          writeJson(res, 413, { ok: false, error: '请求体过大。' })
          return
        }
        let body
        try {
          const raw = await readBody(req)
          body = raw ? JSON.parse(raw) : {}
        } catch {
          writeJson(res, 400, { ok: false, error: '设置 JSON 解析失败。' })
          return
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          writeJson(res, 400, { ok: false, error: '设置格式无效。' })
          return
        }
        const patch = Object.prototype.hasOwnProperty.call(body, 'settings') ? body.settings : body
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
          writeJson(res, 400, { ok: false, error: '设置格式无效。' })
          return
        }
        try {
          const settings = await floatStore.save(patch)
          writeJson(res, 200, { ok: true, settings })
        } catch (error) {
          // A failed disk write is a server-side failure, not bad input.
          writeJson(res, 500, { ok: false, error: String(error?.message ?? error) })
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/photo',
      resource: async (request) => {
        const denied = refusal(request)
        if (denied) return denied
        await ready
        const url = new URL(request.url, 'http://localhost')
        const id = url.searchParams.get('id')
        if (!id) return new Response('缺少照片 id。', { status: 400 })
        try {
          const file = await service.photoFile(id)
          if (!file) return new Response('照片不存在。', { status: 404 })
          return new Response(file.buffer, {
            headers: {
              'content-type': file.mime,
              'content-length': String(file.buffer.length),
              'cache-control': 'no-store',
              'x-content-type-options': 'nosniff',
            },
          })
        } catch (error) {
          return new Response(String(error?.message ?? error), { status: 500 })
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/hero-art',
      resource: async (request) => {
        const denied = refusal(request)
        if (denied) return denied
        try {
          const info = await stat(HERO_ART_PATH)
          if (!heroArtCache || info.mtimeMs !== heroArtMtime) {
            heroArtCache = await readFile(HERO_ART_PATH)
            heroArtMtime = info.mtimeMs
          }
          return new Response(heroArtCache, {
            headers: {
              'content-type': 'image/webp',
              'content-length': String(heroArtCache.length),
              'cache-control': 'public, max-age=86400',
              'x-content-type-options': 'nosniff',
            },
          })
        } catch {
          return new Response('hero art not found', { status: 404 })
        }
      },
    }),
  )

  // Default portrait for the muscle-king avatar. Served as a plugin asset so
  // the default image never bloats float.json or the Client bundle.
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/avatar-art',
      resource: async (request) => {
        const denied = refusal(request)
        if (denied) return denied
        try {
          const info = await stat(AVATAR_ART_PATH)
          if (!avatarArtCache || info.mtimeMs !== avatarArtMtime) {
            avatarArtCache = await readFile(AVATAR_ART_PATH)
            avatarArtMtime = info.mtimeMs
          }
          return new Response(avatarArtCache, {
            headers: {
              'content-type': 'image/webp',
              'content-length': String(avatarArtCache.length),
              'cache-control': 'public, max-age=86400',
              'x-content-type-options': 'nosniff',
            },
          })
        } catch {
          return new Response('avatar art not found', { status: 404 })
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/action',
      // WebRoute (handler) rather than WebResourceRoute: resource routes only
      // answer GET/HEAD (405 otherwise), while mutations arrive via POST.
      handler: async (req, res) => {
        if (refuseHandler(req, res)) return
        await ready
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, error: '只接受 POST。' })
          return
        }
        try {
          const raw = await readBody(req)
          const body = raw ? JSON.parse(raw) : {}
          const { action, args = {} } = body ?? {}
          const result = await runAction(service, action, args, ctx, { estimateStore })
          writeJson(res, 200, result)
        } catch (error) {
          writeJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/venues',
      resource: async (request) => {
        const denied = refusal(request)
        if (denied) return denied
        return json({
          ok: true,
          data: { region: VENUE_REGION, venues: YUYANG_VENUES },
        })
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/clipboard',
      handler: async (req, res) => {
        if (refuseHandler(req, res)) return
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, error: '只接受 POST。' })
          return
        }
        try {
          const raw = await readBody(req)
          const body = raw ? JSON.parse(raw) : {}
          const text = String(body?.text ?? '').trim().toUpperCase()
          if (!/^[A-Z2-9]{6}$/.test(text)) {
            writeJson(res, 400, { ok: false, error: '只允许复制 6 位小队邀请码。' })
            return
          }
          await copyToSystemClipboard(text)
          writeJson(res, 200, { ok: true })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: String(error?.message ?? error) })
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/community/leaderboard',
      resource: async (request) => {
        const denied = refusal(request)
        if (denied) return denied
        await ready
        const url = new URL(request.url, 'http://localhost')
        const code = url.searchParams.get('code') ?? ''
        return json(await community.leaderboard({ code }))
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/dsh-health/community',
      handler: async (req, res) => {
        if (refuseHandler(req, res)) return
        await ready
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, error: '只接受 POST。' })
          return
        }
        try {
          const raw = await readBody(req)
          const body = raw ? JSON.parse(raw) : {}
          const { action, alias, code, token, snapshot } = body ?? {}
          let result
          if (action === 'create') result = await community.create({ alias, snapshot })
          else if (action === 'join') result = await community.join({ code, alias, snapshot })
          else if (action === 'snapshot') result = await community.updateSnapshot({ code, token, snapshot })
          else if (action === 'leave') result = await community.leave({ code, token })
          else result = { ok: false, error: `未知操作「${action}」。` }
          writeJson(res, 200, result)
        } catch (error) {
          writeJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register(tool({
      name: 'health_diagnose',
      description: '诊断用：报告健康数据的存储位置，以及当前 profile 的存储服务挂载情况。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => ({
        ok: true,
        dataPaths: {
          ...service.dataPaths,
          community: join(baseDir, 'community.json'),
          float: floatStore.path,
          estimate: estimateStore.path,
        },
        storage: storageProbe,
      }),
    })),
  )

  return { service, dataPaths: service.dataPaths }
}

/**
 * Dispatch a panel mutation to the HealthService. One entry point for every
 * write the panel offers, so the panel and the agent tools share the same
 * validation and failure messages.
 */
async function runAction(service, action, args, ctx, stores = {}) {
  switch (action) {
    case 'createMember':
      return service.createMember(args)
    case 'updateMember':
      return service.updateMember(args.member, args.patch ?? {})
    case 'deleteMember':
      return service.deleteMember(args.member, args.cascade)
    case 'record':
      return service.record(args)
    case 'deleteRecord':
      return service.deleteRecord(args.id)
    case 'saveMeal':
      return service.saveMeal(args.member, args)
    case 'deleteMeal':
      return service.deleteMeal(args.member, args.id)
    case 'estimateMeal':
      return estimateMeal(ctx, service, args, stores.estimateStore)
    case 'getEstimateModels':
      return estimateCatalog(ctx, stores.estimateStore)
    case 'setEstimateSettings':
      return saveEstimateSettings(ctx, stores.estimateStore, args)
    case 'addCondition':
      return service.addCondition(args.member, { code: args.code, source: args.source, note: args.note })
    case 'removeCondition':
      return service.removeCondition(args.member, args.code)
    case 'setGoal':
      return service.setGoal(args.member, args)
    case 'startSeason':
      return service.startGoalSeason(args.member, args.code)
    case 'removeGoal':
      return service.removeGoal(args.member, args.code)
    case 'addDocument':
      return service.addDocument(args.member, args)
    case 'uploadDocument':
      return service.uploadDocument(args.member, args)
    case 'removeDocument':
      return service.removeDocument(args.member, args.id)
    case 'uploadPhoto':
      return service.uploadPhoto(args.member, args)
    case 'removePhoto':
      return service.removePhoto(args.member, args.id)
    default:
      return { ok: false, error: `未知操作「${action}」。` }
  }
}

// ---------------------------------------------------------------------------
// Meal photo estimation
//
// The panel sends one compressed photo; the Host asks a vision-capable model for
// a structured estimate. This path is read-only by design: the photo is handed
// to the model and never written to the health data documents. The user must
// confirm the estimate in the panel before `saveMeal` stores anything.
// ---------------------------------------------------------------------------

const ESTIMATE_TIMEOUT_MS = 30_000
const ESTIMATE_MAX_IMAGE_BYTES = 12 * 1024 * 1024

const MEAL_ESTIMATE_SYSTEM = [
  '你是饮食记录助手，只负责根据照片估算这一餐的热量、蛋白质和主要食物条目。',
  '只输出一个 JSON 对象，不要 markdown 代码块，不要解释。',
  '不评价食物好坏，不提供饮食建议，不做热量缺口计算。',
].join('\n')

function mealEstimatePrompt(mealType, note) {
  const slot = MEAL_TYPES.find((item) => item.code === mealType)?.name ?? '未指定'
  return [
    '请观察这张餐食照片，估算这一餐的热量与蛋白质，并列出主要食物条目。',
    `餐次：${slot}`,
    note ? `用户备注：${String(note).slice(0, 200)}` : '',
    '只输出一个 JSON 对象，格式如下：',
    '{"items":[{"name":"米饭","portion":"一碗","kcal":230}],"kcal":620,"kcalLow":520,"kcalHigh":720,"protein":30,"confidence":"medium"}',
    '要求：kcal / kcalLow / kcalHigh 为整数（kcal），protein 为整数（g），items 最多 8 条；',
    '必须满足 kcalLow <= kcal <= kcalHigh；不确定时 confidence 填 "low"。',
    '只做估算，不评价食物，不给出任何饮食建议。',
  ].filter(Boolean).join('\n')
}

/** Decode a data URL / base64 image and verify it by magic bytes. */
function decodeImageData(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, error: '缺少照片数据，请重新选择图片。' }
  }
  const raw = input.includes(',') ? input.slice(input.indexOf(',') + 1) : input
  let buffer
  try {
    buffer = Buffer.from(raw, 'base64')
  } catch {
    return { ok: false, error: '照片数据解码失败，请重新选择图片。' }
  }
  if (buffer.length === 0) return { ok: false, error: '照片内容为空，请重新选择图片。' }
  if (buffer.length > ESTIMATE_MAX_IMAGE_BYTES) {
    return { ok: false, error: '照片过大，请压缩到 12 MB 以内再试。' }
  }
  const mediaType = detectImageMediaType(buffer)
  if (!mediaType) return { ok: false, error: '只支持 JPEG / PNG / WebP 图片。' }
  return { ok: true, buffer, mediaType }
}

/** Detect the real image type from magic bytes (never trust the data URL). */
function detectImageMediaType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'image/png'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

/**
 * Model catalog + current preference for the "记一餐" picker. Read-only: it
 * only reports what the `llm` service already knows and which route an estimate
 * would use right now, so the panel can show the model before spending a call.
 */
async function estimateCatalog(ctx, store) {
  return buildEstimateCatalog({
    llm: ctx?.get?.('llm'),
    store,
    getDefaultSelection: () => ctx?.get?.('agentDefaultModel')?.currentSelection?.(),
  })
}

/**
 * Persist the model preference. A pinned route is verified against the `llm`
 * service (registered route + declared image input) before it is stored, so a
 * typo cannot silently turn every estimate into a failure.
 */
async function saveEstimateSettings(ctx, store, args) {
  return updateEstimateSettings({
    llm: ctx?.get?.('llm'),
    store,
    patch: args?.settings ?? args,
    getDefaultSelection: () => ctx?.get?.('agentDefaultModel')?.currentSelection?.(),
  })
}

/** Parse the model reply strictly; any missing or out-of-range number fails. */
function parseMealEstimate(text) {
  const raw = String(text ?? '').trim()
  if (raw === '') return { ok: false, error: '模型没有返回估算结果，请手动填写热量。' }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return { ok: false, error: '估算结果格式无法解析，请手动填写热量。' }
  }
  let parsed
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return { ok: false, error: '估算结果不是有效 JSON，请手动填写热量。' }
  }
  const kcal = Number(parsed?.kcal)
  const kcalLow = Number(parsed?.kcalLow)
  const kcalHigh = Number(parsed?.kcalHigh)
  const protein = parsed?.protein === undefined || parsed?.protein === null ? NaN : Number(parsed.protein)
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > 5000) {
    return { ok: false, error: '估算热量超出 0–5000 kcal 范围，请手动填写热量。' }
  }
  if (
    !Number.isFinite(kcalLow) || kcalLow < 0
    || !Number.isFinite(kcalHigh) || kcalHigh > 5000
    || !(kcalLow <= kcal && kcal <= kcalHigh)
  ) {
    return { ok: false, error: '估算热量区间不完整或与热量不一致，请手动填写热量。' }
  }
  if (!Number.isFinite(protein) || protein < 0 || protein > 400) {
    return { ok: false, error: '估算蛋白质超出 0–400 g 范围，请手动填写。' }
  }
  const items = []
  if (Array.isArray(parsed.items)) {
    for (const rawItem of parsed.items.slice(0, 20)) {
      if (!rawItem || typeof rawItem !== 'object') continue
      const name = String(rawItem.name ?? '').trim()
      if (!name) continue
      const item = { name: name.slice(0, 100) }
      if (rawItem.portion !== undefined && rawItem.portion !== null && String(rawItem.portion).trim() !== '') {
        item.portion = String(rawItem.portion).trim().slice(0, 100)
      }
      if (rawItem.kcal !== undefined && rawItem.kcal !== null && rawItem.kcal !== '') {
        const itemKcal = Number(rawItem.kcal)
        if (Number.isFinite(itemKcal) && itemKcal >= 0 && itemKcal <= 5000) item.kcal = itemKcal
      }
      items.push(item)
    }
  }
  const confidence = typeof parsed.confidence === 'string' && parsed.confidence.trim() !== ''
    ? parsed.confidence.trim().slice(0, 20)
    : 'unknown'
  return {
    ok: true,
    estimate: {
      items,
      kcal,
      kcalLow,
      kcalHigh,
      protein,
      confidence,
    },
  }
}

/**
 * Estimate one meal from a photo. Nothing is persisted on any path: the panel
 * only gets a proposal, and only a later `saveMeal` writes to the health data.
 */
async function estimateMeal(ctx, service, { member, dataBase64, note, mealType } = {}, estimateStore) {
  const failure = (error) => ({ ok: false, error, canManual: true })
  let resolved
  try {
    resolved = await service.resolveMember(member)
  } catch (error) {
    return failure(`无法确认成员：${String(error?.message ?? error)}`)
  }
  if (!resolved.ok) return { ...resolved, canManual: true }
  const image = decodeImageData(dataBase64)
  if (!image.ok) return failure(image.error)

  const llm = ctx?.get?.('llm')
  const attachments = ctx?.get?.('attachments')
  if (!llm || !attachments) {
    return failure('当前没有可用的视觉模型，请手动填写热量。')
  }
  let settings
  try {
    settings = await estimateStore.get()
  } catch {
    settings = normalizeEstimateSettings({})
  }
  let route
  try {
    route = await resolveEstimateRoute(settings, llm, {
      getDefaultSelection: () => ctx?.get?.('agentDefaultModel')?.currentSelection?.(),
    })
  } catch {
    route = undefined
  }
  if (!route) {
    return failure(settings.mode === 'fixed'
      ? `当前配置的估算模型「${settings.provider}/${settings.model}」不可用，请在「记一餐」里改回自动选择或换一个模型。`
      : '当前没有可用的视觉模型，请手动填写热量。')
  }

  let attachment
  try {
    const ext = image.mediaType === 'image/png' ? 'png' : image.mediaType === 'image/webp' ? 'webp' : 'jpg'
    attachment = await attachments.saveImage({
      data: image.buffer,
      mediaType: image.mediaType,
      name: `meal-${Date.now()}.${ext}`,
    })
  } catch (error) {
    return failure(`照片无法用于估算：${String(error?.message ?? error)}`)
  }

  const signal = typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ESTIMATE_TIMEOUT_MS)
    : undefined
  let text = ''
  try {
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      system: MEAL_ESTIMATE_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: mealEstimatePrompt(mealType, note) },
          { type: 'image', attachment },
        ],
      }],
      maxTokens: 800,
      temperature: 0.2,
      signal,
    })
    for await (const chunk of stream) {
      if (chunk?.type === 'text-delta') {
        text += chunk.text ?? ''
      } else if (chunk?.type === 'finish') {
        const kind = chunk.reason?.kind
        if (kind === 'error' || kind === 'aborted') {
          throw new Error(chunk.reason?.failure?.message ?? '模型调用失败。')
        }
      }
    }
  } catch (error) {
    const name = error?.name
    if (name === 'TimeoutError' || name === 'AbortError') {
      return failure('估算超时，请手动填写热量。')
    }
    return failure(`估算失败：${String(error?.message ?? error)}`)
  }

  const parsed = parseMealEstimate(text)
  if (!parsed.ok) return failure(parsed.error)
  return {
    ok: true,
    estimate: {
      ...parsed.estimate,
      provider: route.provider,
      providerName: route.providerName,
      model: route.model,
      modelName: route.modelName,
      source: route.source,
    },
    privacy: '照片仅用于本次估算，不会写入饮食记录，也不会用于训练；只有你确认并保存后才会写入本机。',
  }
}

/** Windows-local clipboard bridge for the invite-code copy button. */
function copyToSystemClipboard(text) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('本机剪贴板复制仅支持 Windows 预览环境。'))
      return
    }
    const child = spawn('clip.exe', [], {
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    })
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      finish(new Error('复制超时。'))
    }, 2500)
    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (code === 0) finish(null)
      else finish(new Error(`clip.exe 退出码 ${code}`))
    })
    child.stdin.end(text, 'utf8')
  })
}

/** Minimal JSON response helper for the panel routes. */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Write a JSON body to a Node ServerResponse (used by the POST action route). */
function writeJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

/** Read a Node IncomingMessage body as UTF-8 text. */
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Build a tool definition bound to this activation's readiness promise, so the
 * first call waits for the data documents instead of racing the initial load.
 */
function createTool(ready) {
  return ({ name, description, parameters, execute }) => ({
    name,
    description,
    parameters,
    output: {
      schema: { type: 'object' },
      render: (_args, value) => text(JSON.stringify(value, null, 2)),
    },
    async execute(args) {
      await ready
      // Tool results must be lossless JSON: round-trip through stringify so
      // `undefined` fields, NaN, and non-plain values can never reach wire.
      return toLosslessJson(await execute(args ?? {}))
    },
  })
}

/** Normalize a result into lossless JSON (no undefined, NaN, or class instances). */
function toLosslessJson(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) return null
    if (item === undefined) return null
    return item
  }))
}

export { DISCLAIMER, GOAL_DISCLAIMER, MAX_MEMBERS }
