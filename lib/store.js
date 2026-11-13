/**
 * File-backed JSON store for the health-management plugin.
 *
 * The DSH profile in this installation does not mount the storage-domain
 * facility, so the plugin owns its own durable state: one JSON document per
 * data area under the session workspace. Writes are atomic (temp file + rename)
 * so an interrupted write can never leave a half-serialized document, and every
 * read validates shape before returning it.
 */

import { promises as fs } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** Raised when a stored document fails its shape check. */
export class StoreCorruptError extends Error {
  constructor(file, detail) {
    super(`健康数据文件 ${file} 格式损坏：${detail}。为避免覆盖你的数据，写入已中止，请先人工检查该文件。`)
    this.name = 'StoreCorruptError'
  }
}

/**
 * One atomic, validated JSON document.
 */
export class JsonStore {
  /**
   * @param {string} filePath  Absolute path to the document.
   * @param {() => Partial<Record<string, unknown>>} emptyShape  Fresh default document.
   * @param {(raw: unknown) => object} validate  Throws on a malformed document.
   */
  constructor(filePath, emptyShape, validate) {
    this.filePath = resolve(filePath)
    this.emptyShape = emptyShape
    this.validate = validate
    /** @type {object | undefined} */
    this.cache = undefined
    /** Serializes writes so concurrent tool calls cannot interleave. */
    this.writeChain = Promise.resolve()
  }

  async load() {
    try {
      const text = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(text)
      this.cache = this.validate(parsed)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.cache = this.validate({ ...this.emptyShape(), version: 1 })
      } else if (error instanceof SyntaxError) {
        throw new StoreCorruptError(this.filePath, `JSON 解析失败（${error.message}）`)
      } else {
        throw error
      }
    }
    return this.cache
  }

  async read() {
    if (this.cache === undefined) await this.load()
    return this.cache
  }

  /**
   * Apply a mutation and persist atomically.
   * @param {(current: object) => object} mutate  Must return the next document.
   */
  async update(mutate) {
    const run = this.writeChain.then(async () => {
      const current = await this.read()
      const next = this.validate(mutate(current))
      const text = JSON.stringify(next, null, 2)
      const dir = dirname(this.filePath)
      await fs.mkdir(dir, { recursive: true })
      const temp = join(dir, `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
      await fs.writeFile(temp, text, 'utf8')
      await fs.rename(temp, this.filePath)
      this.cache = next
      return next
    })
    // Keep the chain alive after a rejection so later writes still run.
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /** Resolve the document path this store uses. */
  get path() {
    return this.filePath
  }
}

/** Shape check helper: object with a numeric version and the given array/object fields. */
export function expectDocument(raw, spec) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('根节点必须是对象')
  }
  if (typeof raw.version !== 'number') throw new Error('缺少 version 字段')
  for (const [field, kind] of Object.entries(spec)) {
    const value = raw[field]
    if (kind === 'array') {
      if (!Array.isArray(value)) throw new Error(`字段 ${field} 必须是数组`)
    } else if (kind === 'record') {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`字段 ${field} 必须是对象`)
      }
    } else if (kind === 'string') {
      if (typeof value !== 'string') throw new Error(`字段 ${field} 必须是字符串`)
    }
  }
  return raw
}
