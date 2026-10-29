/**
 * Test fixtures: a signed-in user plus an in-memory fake of Supabase (Auth,
 * REST, RPC, Storage) and of the Python API, installed with page.route().
 * Nothing leaves the browser, no keys are needed.
 */
import { test as base, expect, type Page, type Route } from '@playwright/test'

export const SUPABASE = 'https://e2e.supabase.co'
export const API = 'http://api.e2e.test'
export const UID = '22222222-2222-2222-2222-222222222222'
export const PID = '11111111-1111-1111-1111-111111111111'

/** A real (sine tone) WAV file, generated in memory. */
export function makeWav(seconds = 16, rate = 8000): Buffer {
  const samples = seconds * rate
  const buf = Buffer.alloc(44 + samples * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * 8000), 44 + i * 2)
  return buf
}
const AUDIO = makeWav()

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 3600
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', aud: 'authenticated' })}.sig`
export const USER = { id: UID, email: 'singer@example.com', aud: 'authenticated', role: 'authenticated' }
export const SESSION = { access_token: jwt, refresh_token: 'refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: USER }

type Row = Record<string, unknown>
const word = (id: string, line: string, text: string, s: number, e: number, i: number, c = 0.9) => ({
  id, project_id: PID, line_id: line, text, start_ms: s, end_ms: e, word_index: i, confidence: c,
})

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': 'Content-Disposition',
}

export class MockBackend {
  projects: Row[] = [
    {
      id: PID, user_id: UID, title: 'שיר בדיקה', status: 'ready', language: 'he', error_code: null,
      lyrics_version: 1, style: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  ]
  audioFiles: Row[] = [
    { id: 'A1', project_id: PID, storage_path: `${UID}/${PID}/a.wav`, original_name: 'בדיקה.wav', size_bytes: AUDIO.length,
      duration_ms: 16000, detected_format: 'wav', status: 'verified', created_at: new Date().toISOString() },
  ]
  jobs: Row[] = []
  lines: Row[] = [
    { id: 'aaaaaaaa-0000-0000-0000-000000000000', project_id: PID, line_index: 0, start_ms: 2000, end_ms: 4000 },
    { id: 'aaaaaaaa-0000-0000-0000-000000000001', project_id: PID, line_index: 1, start_ms: 4500, end_ms: 6500 },
    { id: 'aaaaaaaa-0000-0000-0000-000000000002', project_id: PID, line_index: 2, start_ms: 12000, end_ms: 14000 },
  ]
  words: Row[] = [
    word('b0000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'שלום', 2000, 2800, 0),
    word('b0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'עולם', 2900, 4000, 1, 0.3),
    word('b0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'זה', 4500, 5000, 2),
    word('b0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'שיר', 5100, 5600, 3),
    word('b0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'קריוקי', 5700, 6500, 4),
    word('b0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002', 'סוף', 12000, 13000, 5),
    word('b0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000002', 'טוב', 13100, 14000, 6),
  ]
  exportJobs: Row[] = []
  lyricSaves: { p_expected_version: number; p_lines: { words: { text: string; start_ms: number; end_ms: number }[] }[] }[] = []
  stylePatches: Row[] = []
  apiCalls: string[] = []
  uploads: { path: string; contentType: string; size: number }[] = []
  forceSaveConflict = false
  /** What POST /uploads/:id/complete answers (to simulate server-side rejection). */
  completeError: string | null = null

  project(id = PID) {
    return this.projects.find((p) => p.id === id)!
  }

  lastSavedText(): string[] {
    return (this.lyricSaves.at(-1)?.p_lines ?? []).map((l) => l.words.map((w) => w.text).join(' '))
  }

  async install(page: Page, signedIn = true) {
    if (signedIn) {
      await page.addInitScript((s) => localStorage.setItem('sb-e2e-auth-token', JSON.stringify(s)), SESSION)
    }
    await page.route(`${SUPABASE}/**`, (route) => this.supabase(route))
    await page.route(`${API}/**`, (route) => this.api(route))
    // Fonts come from Google; keep tests independent of the network.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }))
    // Realtime: accept the socket and stay silent (the app also polls).
    await page.routeWebSocket(/e2e\.supabase\.co\/realtime/, () => {})
  }

  private json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) })
  }

  private filter(rows: Row[], url: URL): Row[] {
    let out = rows
    for (const [key, expr] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue
      const [op, ...rest] = expr.split('.')
      const value = rest.join('.')
      if (op === 'eq') out = out.filter((r) => String(r[key]) === value)
    }
    const order = url.searchParams.get('order')
    if (order?.startsWith('created_at.desc')) out = [...out].reverse()
    return out
  }

  private async supabase(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: CORS })
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = (all: Row[]) => {
      const r = this.filter(all, url)
      return this.json(route, single ? (r[0] ?? null) : r)
    }

    if (p.startsWith('/auth/v1/token')) return this.json(route, SESSION)
    if (p.startsWith('/auth/v1/user')) return this.json(route, USER)
    if (p.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, headers: CORS })
    if (p.startsWith('/auth/v1/signup')) return this.json(route, { user: { ...USER, identities: [{}] }, session: null })
    if (p.startsWith('/auth/v1/recover')) return this.json(route, {})

    if (p === '/rest/v1/projects') {
      if (method === 'PATCH') {
        const body = JSON.parse(req.postData() ?? '{}')
        this.stylePatches.push(body)
        for (const r of this.filter(this.projects, url)) Object.assign(r, body)
        return route.fulfill({ status: 204, headers: CORS })
      }
      // projects list embeds audio_files(...)
      return rows(this.projects.map((pr) => ({ ...pr, audio_files: this.audioFiles.filter((a) => a.project_id === pr.id) })))
    }
    if (p === '/rest/v1/audio_files') return rows(this.audioFiles)
    if (p === '/rest/v1/processing_jobs') return rows(this.jobs)
    if (p === '/rest/v1/lyric_lines') return rows(this.lines)
    if (p === '/rest/v1/lyric_words') return rows(this.words)
    if (p === '/rest/v1/export_jobs') return rows(this.exportJobs)
    if (p === '/rest/v1/rpc/save_lyrics') {
      const body = JSON.parse(req.postData() ?? '{}')
      const project = this.project(body.p_project_id)
      if (this.forceSaveConflict || body.p_expected_version !== project.lyrics_version) {
        return this.json(route, { code: 'P0001', message: 'version_conflict', details: null, hint: null }, 400)
      }
      project.lyrics_version = (project.lyrics_version as number) + 1
      this.lyricSaves.push(body)
      return this.json(route, project.lyrics_version)
    }

    if (p.startsWith('/storage/v1/object/upload/sign/')) {
      this.uploads.push({ path: p, contentType: req.headers()['content-type'] ?? '', size: req.postDataBuffer()?.length ?? 0 })
      return this.json(route, { Key: p })
    }
    if (p.startsWith('/storage/v1/object/sign/exports/')) return this.json(route, { signedURL: '/__video?token=t' })
    if (p.startsWith('/storage/v1/object/sign/')) return this.json(route, { signedURL: '/__audio?token=t' })
    if (p.startsWith('/storage/v1/__video')) {
      this.apiCalls.push(`VIDEO download=${url.searchParams.get('download')}`)
      return route.fulfill({ status: 200, headers: { 'content-type': 'video/mp4' }, body: 'x' })
    }
    if (p.startsWith('/storage/v1/__audio')) return this.serveAudio(route)
    return route.fulfill({ status: 404, headers: CORS, body: '' })
  }

  /** Audio with HTTP Range support (needed for seeking), like Supabase Storage. */
  private serveAudio(route: Route) {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()['range'] ?? '')
    const headers = { ...CORS, 'accept-ranges': 'bytes', 'content-type': 'audio/wav' }
    if (!range) return route.fulfill({ status: 200, headers, body: AUDIO })
    const start = Number(range[1])
    const end = range[2] ? Number(range[2]) : AUDIO.length - 1
    return route.fulfill({
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${AUDIO.length}` },
      body: AUDIO.subarray(start, end + 1),
    })
  }

  private async api(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    this.apiCalls.push(`${method} ${p}${url.search}`)

    if (p === '/limits') {
      return this.json(route, { max_upload_bytes: 50 * 1024 * 1024, max_audio_duration_seconds: 600, allowed_extensions: ['mp3', 'wav', 'm4a'], max_uploads_per_day: 20 })
    }
    if (p === '/uploads' && method === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      const id = '33333333-3333-3333-3333-333333333333'
      this.projects.push({ id, user_id: UID, title: body.file_name.replace(/\.[^.]+$/, ''), status: 'awaiting_upload', language: null,
        error_code: null, lyrics_version: 0, style: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      const ext = body.file_name.split('.').pop()
      this.audioFiles.push({ id: 'A2', project_id: id, storage_path: `${UID}/${id}/x.${ext}`, original_name: body.file_name,
        size_bytes: body.size_bytes, duration_ms: null, status: 'pending', created_at: new Date().toISOString() })
      return this.json(route, {
        project_id: id, audio_file_id: 'A2',
        upload_url: `${SUPABASE}/storage/v1/object/upload/sign/audio/${UID}/${id}/x.${ext}?token=t`,
        content_type: ext === 'wav' ? 'audio/wav' : 'audio/mpeg',
      }, 201)
    }
    const complete = /^\/uploads\/([^/]+)\/complete$/.exec(p)
    if (complete) {
      const project = this.project(complete[1])
      if (this.completeError) {
        Object.assign(project, { status: 'failed', error_code: this.completeError })
        return this.json(route, { project_id: project.id, status: 'failed', job_id: null, duration_ms: null, error_code: this.completeError })
      }
      Object.assign(project, { status: 'queued' })
      this.jobs.push({ id: 'J1', project_id: project.id, status: 'queued', stage: 'queued', progress: 0, attempts: 0, max_attempts: 3,
        error_code: null, created_at: new Date().toISOString() })
      return this.json(route, { project_id: project.id, status: 'queued', job_id: 'J1', duration_ms: 16000, error_code: null })
    }
    const del = /^\/projects\/([^/]+)$/.exec(p)
    if (del && method === 'DELETE') {
      this.projects = this.projects.filter((x) => x.id !== del[1])
      return route.fulfill({ status: 204, headers: CORS })
    }
    const text = /^\/projects\/([^/]+)\/export\/(srt|lrc|ass)$/.exec(p)
    if (text) {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' }, body: `﻿${text[2]} file` })
    }
    const exportsMatch = /^\/projects\/([^/]+)\/exports$/.exec(p)
    if (exportsMatch && method === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      const job: Row = { id: 'e1', project_id: exportsMatch[1], format: 'mp4', options: { aspect: body.aspect, resolution: body.resolution },
        status: 'queued', progress: 0, output_path: null, error_code: null, created_at: new Date().toISOString(), finished_at: null }
      this.exportJobs.unshift(job)
      setTimeout(() => Object.assign(job, { status: 'running', progress: 42 }), 1000)
      setTimeout(() => Object.assign(job, { status: 'succeeded', progress: 100, output_path: `${UID}/${PID}/e1.mp4` }), 3000)
      return this.json(route, job, 201)
    }
    return this.json(route, { detail: 'not_found' }, 404)
  }
}

export const test = base.extend<{ backend: MockBackend; signedIn: boolean }>({
  signedIn: [true, { option: true }],
  backend: async ({ page, signedIn }, use) => {
    const backend = new MockBackend()
    await backend.install(page, signedIn)
    await use(backend)
  },
})

export { expect }

/** The page must never scroll sideways (a classic mobile RTL bug). */
export async function expectNoHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(scroll, 'horizontal overflow').toBeLessThanOrEqual(client + 1)
}

export const isMobileProject = (name: string) => name !== 'desktop'
