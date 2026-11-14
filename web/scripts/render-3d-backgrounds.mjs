/**
 * Draws the built-in 3D clips: each one is a GLSL shader in /backgrounds3d (a
 * 3D scene drawn by ray marching) that is a function of time. Every frame is
 * drawn in a headless browser (WebGL) at a fixed time, so the result does not
 * depend on the computer's speed, then encoded to an MP4 + a small JPG.
 * The worker uses these same files for exported videos.
 *
 *   node scripts/render-3d-backgrounds.mjs [id ...]        (from the web folder)
 *   options: --ss 2 (draw at double size: smooth edges; used for the committed clips)
 *            --crf 27 (quality; star-warp uses 29 to stay small)  --frames N  --size 960x540
 *            --preview 0,3.3,6.6 (a picture of these moments, to look at a scene quickly)
 *
 * A shader can set, in comment lines at its top:
 *   // @seconds 8                       length (default 10: a loop)
 *   // @out intro                       folder under web/public (default: backgrounds)
 *   // @sizes intro=1280x720 intro-9x16=720x1280   one file per size (default: <id>=--size)
 *   // @text Karaoke Sync               3D text: a distance map of it in `uniform sampler2D uText`
 *   // @font ../server/fonts/Rubik.ttf  the text's font (relative to /backgrounds3d)
 *   // @audio audio/intro.lavfi         a sound track made by FFmpeg from this graph
 */
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SHADERS = join(ROOT, 'backgrounds3d')
const PUBLIC = join(ROOT, 'web', 'public')
const FPS = 30

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : fallback
}
const framesOpt = opt('--frames', '')
const sizeOpt = opt('--size', '960x540')
const crf = opt('--crf', '27')
const ss = Number(opt('--ss', '1')) // supersampling: draw bigger, then shrink (smoother edges)
const outOpt = opt('--out', '')
const preview = opt('--preview', '') // e.g. 0,3.3,6.6: a picture of these moments instead of a clip
const ids = args.length ? args : readdirSync(SHADERS).filter((f) => f.endsWith('.frag')).map((f) => f.replace('.frag', ''))
const common = readFileSync(join(SHADERS, 'common.glsl'), 'utf8')
// `#include "lib/x.glsl"` lines pull in shared pieces (the 3D logo, the speaker).
const withIncludes = (src) =>
  src.replace(/^#include "([\w/.-]+)"\s*$/gm, (_, file) => withIncludes(readFileSync(join(SHADERS, file), 'utf8')))
const directive = (src, name) => src.match(new RegExp(`^//\\s*@${name}\\s+(.+)$`, 'm'))?.[1].trim() ?? null

function run(cmd, argv, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'inherit'] })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    if (input) input(p.stdin)
  })
}

/** Set up the shader in a page; with @text, also a signed distance map of the text. */
async function preparePage(page, source, w, h, text) {
  return page.evaluate(
    async ({ source, w, h, text }) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const gl = c.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false })
      const sh = (type, src) => {
        const s = gl.createShader(type)
        gl.shaderSource(s, src)
        gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
        return s
      }
      try {
        const prog = gl.createProgram()
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'))
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, source))
        gl.linkProgram(prog)
        gl.useProgram(prog)
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
        const loc = gl.getAttribLocation(prog, 'p')
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
        gl.uniform2f(gl.getUniformLocation(prog, 'uRes'), w, h)

        if (text) {
          // Text drawn big on a 4:1 canvas, then turned into distances (in pixels, + outside, - inside).
          const font = new FontFace('ShaderFont', Uint8Array.from(atob(text.font), (ch) => ch.charCodeAt(0)))
          await font.load()
          document.fonts.add(font)
          const TW = 2048, TH = 512, SPREAD = 48
          const tc = document.createElement('canvas')
          tc.width = TW
          tc.height = TH
          const ctx = tc.getContext('2d')
          let size = 300
          ctx.font = `800 ${size}px ShaderFont`
          size = Math.min(size, (size * TW * 0.92) / ctx.measureText(text.text).width)
          ctx.font = `800 ${size}px ShaderFont`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#fff'
          ctx.fillText(text.text, TW / 2, TH / 2 + size * 0.06)
          const alpha = ctx.getImageData(0, 0, TW, TH).data
          const INF = 1e20
          const edt = (grid) => {   // squared Euclidean distance transform (Felzenszwalb & Huttenlocher)
            const n = Math.max(TW, TH), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
            const pass = (offset, stride, len) => {
              for (let i = 0; i < len; i++) f[i] = grid[offset + i * stride]
              let k = 0
              v[0] = 0; z[0] = -INF; z[1] = INF
              for (let q = 1; q < len; q++) {
                let s
                do { const r = v[k]; s = (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r) } while (s <= z[k] && --k > -1)
                k++; v[k] = q; z[k] = s; z[k + 1] = INF
              }
              k = 0
              for (let q = 0; q < len; q++) {
                while (z[k + 1] < q) k++
                const r = v[k]
                d[q] = (q - r) * (q - r) + f[r]
              }
              for (let i = 0; i < len; i++) grid[offset + i * stride] = d[i]
            }
            for (let x = 0; x < TW; x++) pass(x, TW, TH)
            for (let y = 0; y < TH; y++) pass(y * TW, 1, TW)
          }
          const outside = new Float64Array(TW * TH), inside = new Float64Array(TW * TH)
          for (let i = 0; i < TW * TH; i++) {
            const on = alpha[i * 4 + 3] > 127
            outside[i] = on ? 0 : INF
            inside[i] = on ? INF : 0
          }
          edt(outside)
          edt(inside)
          const sdf = new Float32Array(TW * TH)
          for (let i = 0; i < TW * TH; i++) sdf[i] = Math.max(-SPREAD, Math.min(SPREAD, Math.sqrt(outside[i]) - Math.sqrt(inside[i])))
          const tex = gl.createTexture()
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, tex)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, TW, TH, 0, gl.RED, gl.FLOAT, sdf)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          gl.uniform1i(gl.getUniformLocation(prog, 'uText'), 0)
        }

        const uTime = gl.getUniformLocation(prog, 'uTime')
        const pixels = new Uint8Array(w * h * 4)
        window.drawFrame = (t) => {
          gl.uniform1f(uTime, t)
          gl.drawArrays(gl.TRIANGLES, 0, 3)
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          let s = ''
          for (let i = 0; i < pixels.length; i += 0x8000) s += String.fromCharCode.apply(null, pixels.subarray(i, i + 0x8000))
          return btoa(s)
        }
        return null
      } catch (e) {
        return String(e.message || e)
      }
    },
    { source, w, h, text },
  )
}

async function renderOne(browser, id) {
  const raw = readFileSync(join(SHADERS, `${id}.frag`), 'utf8')
  const source = `#version 300 es\nprecision highp float;\n${common}\n${withIncludes(raw)}`
  const seconds = Number(directive(raw, 'seconds') ?? 10)
  const frames = Number(framesOpt || seconds * FPS)
  const outDir = outOpt || join(PUBLIC, directive(raw, 'out') ?? 'backgrounds')
  const sizes = (directive(raw, 'sizes') ?? `${id}=${sizeOpt}`).split(/\s+/).map((s) => {
    const [name, size] = s.split('=')
    const [w, h] = size.split('x').map(Number)
    return { name, w, h }
  })
  const textLine = directive(raw, 'text')
  const text = textLine
    ? { text: textLine, font: readFileSync(join(SHADERS, directive(raw, 'font') ?? '../server/fonts/Rubik.ttf')).toString('base64') }
    : null
  const audio = directive(raw, 'audio')

  for (const { name, w: W, h: H } of sizes) {
    const page = await browser.newPage()
    const err = await preparePage(page, source, W * ss, H * ss, text)
    if (err) throw new Error(`${id}: ${err}`)

    if (preview) {
      const times = preview.split(',').map(Number)
      await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W * ss}x${H * ss}`,
        '-i', '-', '-vf', `vflip,scale=${W / 2}:${H / 2}:flags=lanczos,tile=${times.length}x1`, '-frames:v', '1', join(outDir, `${name}.png`)],
      async (stdin) => {
        for (const t of times) stdin.write(Buffer.from(await page.evaluate((t) => window.drawFrame(t), t), 'base64'))
        stdin.end()
      })
      await page.close()
      continue
    }
    const tmp = join(outDir, `${name}.part.mp4`)
    const started = Date.now()
    await run(
      'ffmpeg',
      ['-nostdin', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W * ss}x${H * ss}`, '-r', String(FPS),
        '-i', '-', '-vf', `vflip,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', crf,
        '-g', String(FPS * 2), '-movflags', '+faststart', '-an', tmp],
      async (stdin) => {
        for (let i = 0; i < frames; i++) {
          const b64 = await page.evaluate((t) => window.drawFrame(t), i / FPS)
          if (!stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => stdin.once('drain', r))
        }
        stdin.end()
      },
    )
    const mp4 = join(outDir, `${name}.mp4`)
    if (audio) {
      // Add the sound track (made by FFmpeg from a filter graph: deterministic, no files needed).
      const graph = readFileSync(join(SHADERS, audio), 'utf8').split('\n').filter((l) => !l.trim().startsWith('#')).join('').replace(/\s+/g, '')
      await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', tmp, '-f', 'lavfi', '-i', graph, '-map', '0:v', '-map', '1:a',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', String(frames / FPS), '-movflags', '+faststart', mp4])
      unlinkSync(tmp)
    } else {
      renameSync(tmp, mp4)
    }
    await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-ss', String(Math.min(audio ? seconds * 0.6 : 3, frames / FPS / 2)), '-i', mp4,
      '-frames:v', '1', '-vf', `scale=${W >= H ? 240 : 136}:-2`, '-q:v', '4', join(outDir, `${name}.jpg`)])
    await page.close()
    console.log(`${name}: ${((Date.now() - started) / 1000).toFixed(0)} s`)
  }
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const queue = [...ids]
const workers = Number(process.env.JOBS || 2)
await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
  while (queue.length) await renderOne(browser, queue.shift())
}))
await browser.close()
