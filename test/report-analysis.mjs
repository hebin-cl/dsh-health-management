/**
 * Mounts the real plugin against a fake Host context and drives the report
 * interpretation action, end to end: document upload -> model route -> parsed
 * proposal with a fixed disclaimer, model label and no measurement writes.
 *
 * No DSH process, network call, or model provider is involved: the fake `llm`
 * returns a canned JSON reading.
 *
 * Run with: node test/report-analysis.mjs
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

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

/** Real 1x1 transparent PNG. */
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_1X1}`

const REPORT_REPLY = JSON.stringify({
  reportType: 'lab_report',
  summary: '这是一份血脂与血糖报告。',
  indicators: [
    {
      name: '低密度脂蛋白胆固醇',
      abbr: 'LDL-C',
      value: '3.8',
      unit: 'mmol/L',
      reference: '<3.4',
      flag: 'high',
      meaning: '低密度脂蛋白胆固醇是血脂中的一项，用于评估血脂水平。',
      abnormalMeaning: '高于报告参考时，可能与饮食、体重、遗传等因素有关，也可能受近期状态影响；需要结合其他血脂指标和医生判断。',
      suggestion: '可先记录本次结果并携带报告复诊；具体是否需要干预由医生决定。',
    },
    {
      name: '空腹血糖',
      abbr: 'FPG',
      value: '5.2',
      unit: 'mmol/L',
      reference: '3.9–6.1',
      flag: 'normal',
      meaning: '空腹血糖用于观察空腹状态下的血糖水平。',
      abnormalMeaning: '',
      suggestion: '',
    },
  ],
  questions: ['需要结合其他检查一起看吗？', '这些异常项需要复查吗？'],
  generalInfo: ['规律作息；具体方案请咨询医生。'],
  confidence: 'medium',
})

const CATALOGS = {
  vision: [
    { provider: 'vision', id: 'v1', name: 'Vision One', inputModalities: ['text', 'image'] },
    { provider: 'vision', id: 'v2', name: 'Vision Two', inputModalities: ['text', 'image'] },
  ],
  text: [
    { provider: 'text', id: 't1', name: 'Text One', inputModalities: ['text'] },
  ],
}

const dir = await mkdtemp(join(tmpdir(), 'dsh-health-report-'))
try {
  let nextReply = REPORT_REPLY
  const registeredRoutes = new Map()
  const disposers = []
  const services = {
    // A text-only agent default: auto must fall back to the first image model.
    agentDefaultModel: { currentSelection: () => ({ provider: 'text', model: 't1' }) },
    llm: {
      listProviders: () => Object.keys(CATALOGS).map((id) => ({ id, name: `provider-${id}` })),
      listModels: async (provider) => CATALOGS[provider] ?? [],
      resolveModelInfo: async (provider, model) => {
        const found = (CATALOGS[provider] ?? []).find((item) => item.id === model)
        if (!found) throw new Error('未注册的模型')
        return found
      },
      stream() {
        return (async function* streamReply() {
          yield { type: 'text-delta', index: 0, text: nextReply }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    },
    attachments: {
      saveImage: async ({ mediaType, data }) => ({
        attachmentId: 'attachment-report-1',
        mediaType,
        bytes: data.length,
        width: 1,
        height: 1,
      }),
    },
  }

  const ctx = {
    workingDirectory: { defaultDirectory: dir },
    logger: { info() {}, error() {} },
    get(name) {
      return services[name]
    },
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    systemPrompt: { section: () => () => {} },
    tools: { register: () => () => {} },
    webServer: {
      register(route) {
        registeredRoutes.set(route.path, route)
        return () => {}
      },
    },
  }

  apply(ctx, { dataDir: dir })

  /** Invoke the same POST /api/dsh-health/action route the panel uses. */
  function callAction(action, args = {}) {
    const route = registeredRoutes.get('/api/dsh-health/action')
    if (!route?.handler) throw new Error('action route was not registered')
    return new Promise((resolve, reject) => {
      const body = Buffer.from(JSON.stringify({ action, args }), 'utf8')
      const req = {
        method: 'POST',
        headers: { 'content-length': String(body.length) },
        async *[Symbol.asyncIterator]() {
          yield body
        },
      }
      const res = {
        writeHead(status) {
          res.status = status
        },
        end(text) {
          try {
            resolve({ status: res.status, body: JSON.parse(text) })
          } catch (error) {
            reject(error)
          }
        },
      }
      Promise.resolve(route.handler(req, res)).catch(reject)
    })
  }

  console.log('\n[report analysis: catalog]')
  const firstCatalog = await callAction('getReportModels')
  check('the report catalog answers over the panel route',
    firstCatalog.status === 200 && firstCatalog.body.ok, firstCatalog)
  check('the report preference starts as auto',
    firstCatalog.body.settings?.mode === 'auto', firstCatalog.body.settings)
  check('the picker offers both image models',
    firstCatalog.body.routes?.length === 2
    && firstCatalog.body.routes.every((route) => route.provider === 'vision'), firstCatalog.body.routes)
  check('a text-only default falls back to the first image model',
    firstCatalog.body.resolved?.model === 'v1' && firstCatalog.body.resolved?.source === 'auto',
    firstCatalog.body.resolved)

  console.log('\n[report analysis: pinning is independent from the meal model]')
  const pinned = await callAction('setReportSettings', {
    settings: { mode: 'fixed', provider: 'vision', model: 'v2' },
  })
  check('a pinned report model is accepted',
    pinned.body.ok && pinned.body.resolved?.source === 'fixed'
    && pinned.body.resolved?.modelName === 'Vision Two', pinned.body)
  const reportStoreFile = JSON.parse(await readFile(join(dir, 'report-model.json'), 'utf8'))
  check('the report choice is stored in report-model.json',
    reportStoreFile.mode === 'fixed' && reportStoreFile.model === 'v2', reportStoreFile)
  let estimateFileMissing = false
  try {
    await readFile(join(dir, 'estimate.json'), 'utf8')
  } catch {
    estimateFileMissing = true
  }
  check('switching the report model does not create estimate.json', estimateFileMissing)

  console.log('\n[report analysis: image document]')
  const imageDoc = await callAction('uploadDocument', {
    member: '我',
    type: 'lab_report',
    title: '血脂与血糖报告',
    docDate: '2026-11-10',
    fileName: 'report.png',
    dataBase64: PNG_DATA_URL,
  })
  check('the report image is uploaded and registered', imageDoc.body.ok, imageDoc.body)
  const imageId = imageDoc.body.document?.id
  const fileRoute = registeredRoutes.get('/api/dsh-health/document-file')
  const fileResponse = await fileRoute.resource(new Request(
    `http://localhost/api/dsh-health/document-file?member=${encodeURIComponent('我')}&id=${imageId}`,
  ))
  check('the report preview route serves the stored image',
    fileResponse.status === 200
    && (fileResponse.headers.get('content-type') ?? '').startsWith('image/png'),
    { status: fileResponse.status, type: fileResponse.headers.get('content-type') })
  const analyzed = await callAction('analyzeDocument', { member: '我', id: imageId })
  check('the report is interpreted through the panel action', analyzed.body.ok === true, analyzed.body)
  check('the analysis labels the model that produced it',
    analyzed.body.analysis?.model?.provider === 'vision'
    && analyzed.body.analysis.model.model === 'v2'
    && analyzed.body.analysis.model.modelName === 'Vision Two'
    && analyzed.body.analysis.model.source === 'fixed', analyzed.body.analysis?.model)
  check('the analysis keeps report indicators and their flags',
    analyzed.body.analysis?.indicators?.length === 2
    && analyzed.body.analysis.indicators[0].flag === 'high'
    && analyzed.body.analysis.indicators[0].reference === '<3.4', analyzed.body.analysis?.indicators)
  check('the analysis carries the three explanation fields and no per-row question',
    analyzed.body.analysis.indicators[0].meaning
    && analyzed.body.analysis.indicators[0].abnormalMeaning
    && analyzed.body.analysis.indicators[0].suggestion
    && !('doctorQuestion' in analyzed.body.analysis.indicators[0])
    && !('plain' in analyzed.body.analysis.indicators[0]), analyzed.body.analysis.indicators[0])
  check('the analysis carries the fixed disclaimer and asks for a doctor',
    /不构成诊断/.test(analyzed.body.disclaimer ?? '')
    && /医生/.test(analyzed.body.disclaimer ?? '')
    && /实际诊断/.test(analyzed.body.disclaimer ?? ''), analyzed.body.disclaimer)
  check('the analysis states the privacy boundary',
    /不会写入/.test(analyzed.body.privacy ?? ''), analyzed.body.privacy)
  check('the analysis offers fixed, safe next steps',
    Array.isArray(analyzed.body.analysis?.nextSteps)
    && analyzed.body.analysis.nextSteps.length === 3
    && /医生/.test(analyzed.body.analysis.nextSteps[0])
    && /不要根据 AI 解读自行用药/.test(analyzed.body.analysis.nextSteps[2]),
    analyzed.body.analysis?.nextSteps)

  const recordsAfter = await (async () => {
    try {
      const raw = await readFile(join(dir, 'records.json'), 'utf8')
      return JSON.parse(raw).records?.length ?? 0
    } catch {
      return 0
    }
  })()
  check('interpretation alone writes no measurement record', recordsAfter === 0, recordsAfter)

  console.log('\n[report analysis: safety boundaries]')
  const prescription = await callAction('uploadDocument', {
    member: '我',
    type: 'prescription',
    title: '门诊处方',
    fileName: 'rx.png',
    dataBase64: PNG_DATA_URL,
  })
  const prescriptionResult = await callAction('analyzeDocument', {
    member: '我', id: prescription.body.document?.id,
  })
  check('a prescription is refused instead of interpreted',
    prescriptionResult.body.ok === false && /处方/.test(prescriptionResult.body.error),
    prescriptionResult.body)

  const pdfBase64 = Buffer.from('%PDF-1.4\n% test\n').toString('base64')
  const pdfDoc = await callAction('uploadDocument', {
    member: '我',
    type: 'lab_report',
    title: 'PDF 报告',
    fileName: 'report.pdf',
    dataBase64: pdfBase64,
  })
  const pdfResult = await callAction('analyzeDocument', { member: '我', id: pdfDoc.body.document?.id })
  check('a PDF gets a screenshot/photo instruction',
    pdfResult.body.ok === false && /PDF/.test(pdfResult.body.error), pdfResult.body)

  const textDoc = await callAction('uploadDocument', {
    member: '我',
    type: 'lab_report',
    title: '文本报告',
    fileName: 'report.txt',
    dataBase64: Buffer.from('低密度脂蛋白胆固醇 3.8 mmol/L 参考 <3.4').toString('base64'),
  })
  const textResult = await callAction('analyzeDocument', { member: '我', id: textDoc.body.document?.id })
  check('a text report is interpreted', textResult.body.ok === true, textResult.body)
  check('the text report is marked as text input',
    textResult.body.analysis?.sourceKind === 'text', textResult.body.analysis)
  check('the text report keeps a source preview for the left pane',
    /低密度脂蛋白/.test(textResult.body.analysis?.sourceText ?? ''), textResult.body.analysis?.sourceText)

  nextReply = JSON.stringify({
    reportType: 'lab_report',
    summary: '报告已读取。',
    indicators: [{
      name: '低密度脂蛋白胆固醇',
      value: '3.8',
      unit: 'mmol/L',
      reference: '<3.4',
      flag: 'high',
      meaning: '可能是糖尿病。',
      abnormalMeaning: '建议服用他汀。',
      suggestion: '建议停药并调整剂量。',
    }],
    questions: [],
    generalInfo: ['建议停用目前的药物。', '规律作息。'],
    confidence: 'low',
  })
  const sanitized = await callAction('analyzeDocument', { member: '我', id: imageId })
  check('diagnosis/medication wording is replaced with a neutral sentence',
    sanitized.body.ok === true
    && !/糖尿病|他汀/.test(JSON.stringify(sanitized.body.analysis.indicators)),
    sanitized.body.analysis?.indicators)
  check('prescriptive general info is dropped',
    sanitized.body.ok === true
    && sanitized.body.analysis.generalInfo.length === 1
    && sanitized.body.analysis.generalInfo[0] === '规律作息。', sanitized.body.analysis?.generalInfo)

  nextReply = 'not json'
  const malformed = await callAction('analyzeDocument', { member: '我', id: imageId })
  check('a malformed model reply fails cleanly',
    malformed.body.ok === false && /格式|JSON/.test(malformed.body.error), malformed.body)

  for (const dispose of disposers) {
    try { dispose() } catch { /* ignore */ }
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log(`\n${passes} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
