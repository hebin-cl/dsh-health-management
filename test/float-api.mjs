/**
 * Host-side integration check for the floating avatar routes.
 *
 * The real HTTP routes sit behind DSH's session authorization, so this test
 * invokes exactly the handlers that `apply()` registers, with a minimal mock of
 * the Host context. It proves the route wiring, JSON shape, persistence and
 * validation without weakening the live server's authorization.
 *
 * Run with: node test/float-api.mjs
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

const dir = await mkdtemp(join(tmpdir(), 'dsh-health-float-api-'))
const routes = new Map()

const ctx = {
  get: () => undefined,
  effect: (fn) => {
    const dispose = fn()
    return () => { if (typeof dispose === 'function') dispose() }
  },
  logger: { info() {}, error() {} },
  workingDirectory: { defaultDirectory: process.cwd() },
  systemPrompt: { section: () => () => {} },
  tools: { register: () => () => {} },
  webServer: {
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  },
}

function fakeResponse() {
  return {
    status: 0,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      this.body = String(body ?? '')
    },
  }
}

try {
  apply(ctx, { dataDir: dir })

  console.log('\n[float api: route registration]')
  check('GET route registered', routes.has('/api/dsh-health/float'))
  check('POST route registered', routes.has('/api/dsh-health/float/settings'))
  check('avatar art route registered', routes.has('/api/dsh-health/avatar-art'))
  check('GET route is a resource route', typeof routes.get('/api/dsh-health/float')?.resource === 'function')
  check('POST route is a handler route', typeof routes.get('/api/dsh-health/float/settings')?.handler === 'function')

  const artResponse = await routes.get('/api/dsh-health/avatar-art').resource()
  const artBytes = await artResponse.arrayBuffer()
  check('avatar art is served as webp', artResponse.headers.get('content-type') === 'image/webp')
  check('avatar art is under 512 KiB', artBytes.byteLength <= 512 * 1024)

  console.log('\n[float api: read]')
  const readResponse = await routes.get('/api/dsh-health/float').resource(
    new Request('http://localhost/api/dsh-health/float'),
  )
  const readBody = await readResponse.json()
  check('GET returns ok', readBody.ok === true)
  check('GET returns complete defaults', readBody.settings?.enabled === true && readBody.settings?.size === 'medium')
  check('GET returns aggregate status', readBody.status?.todayRecordCount === 0 && readBody.status?.memberCount === 1)
  check('status exposes no evaluation payload', !('latest' in readBody.status) && !('conditions' in readBody.status))

  console.log('\n[float api: write]')
  const postRoute = routes.get('/api/dsh-health/float/settings')
  const req = {
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({
        settings: {
          enabled: false,
          intervalMinutes: 999,
          quietHoursEnabled: true,
          quietStart: '23:00',
          quietEnd: '07:00',
          position: { x: 0.2 },
          name: '  小美  ',
          avatarStyle: 'sun',
          avatarImage: 'data:image/png;base64,iVBORw0KGgo=',
        },
      }))
    },
  }
  const res = fakeResponse()
  await postRoute.handler(req, res)
  const saved = JSON.parse(res.body)
  check('POST returns 200', res.status === 200)
  check('POST returns ok', saved.ok === true)
  check('POST applies the boolean', saved.settings?.enabled === false)
  check('POST clamps the interval', saved.settings?.intervalMinutes === 240)
  check('POST keeps quiet hours', saved.settings?.quietHoursEnabled === true && saved.settings?.quietStart === '23:00')
  check('POST merges partial position', saved.settings?.position?.x === 0.2)
  check('POST keeps default position y', saved.settings?.position?.y === 0.42)
  check('POST trims the name', saved.settings?.name === '小美')
  check('POST stores the built-in style', saved.settings?.avatarStyle === 'sun')
  check('POST stores the avatar image', saved.settings?.avatarImage === 'data:image/png;base64,iVBORw0KGgo=')

  const onDisk = JSON.parse(await readFile(join(dir, 'float.json'), 'utf8'))
  check('settings persisted to float.json', onDisk.enabled === false && onDisk.position.x === 0.2)
  check('identity persisted to float.json', onDisk.name === '小美' && onDisk.avatarStyle === 'sun')

  const wrongMethod = fakeResponse()
  await postRoute.handler({ method: 'GET' }, wrongMethod)
  check('POST route rejects GET', wrongMethod.status === 405)

  const tooLarge = fakeResponse()
  await postRoute.handler({
    method: 'POST',
    headers: { 'content-length': String(3 * 1024 * 1024) },
  }, tooLarge)
  check('POST route rejects an oversized body', tooLarge.status === 413)

  const arrayBody = fakeResponse()
  await postRoute.handler({
    method: 'POST',
    async *[Symbol.asyncIterator]() { yield Buffer.from('[1,2]') },
  }, arrayBody)
  check('POST route rejects an array body', arrayBody.status === 400)

  const nullSettings = fakeResponse()
  await postRoute.handler({
    method: 'POST',
    async *[Symbol.asyncIterator]() { yield Buffer.from('{"settings":null}') },
  }, nullSettings)
  check('POST route rejects null settings', nullSettings.status === 400)

  const badJson = fakeResponse()
  await postRoute.handler({
    method: 'POST',
    async *[Symbol.asyncIterator]() { yield Buffer.from('{nope') },
  }, badJson)
  check('POST route rejects malformed JSON', badJson.status === 400)

  const reread = await (await routes.get('/api/dsh-health/float').resource(
    new Request('http://localhost/api/dsh-health/float'),
  )).json()
  check('GET observes the saved settings', reread.settings?.enabled === false && reread.settings?.intervalMinutes === 240)
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : 'FAILED'} · ${passes}/${passes + failures} checks`)
process.exit(failures === 0 ? 0 : 1)
