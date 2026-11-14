/**
 * Draws the built-in 3D animated backgrounds: each one is a GLSL shader in
 * /backgrounds3d (a 3D scene drawn by ray marching) that is a function of time
 * and loops exactly. Every frame is drawn in a headless browser (WebGL) at a
 * fixed time, so the result does not depend on the computer's speed, then
 * encoded to web/public/backgrounds/<id>.mp4 + <id>.jpg. The worker uses
 * these same files for exported videos.
 *
 *   node scripts/render-3d-backgrounds.mjs [id ...]        (from the web folder)
 *   options: --ss 2 (draw at double size: smooth edges; used for the committed clips)
 *            --crf 27 (quality; star-warp uses 29 to stay small)  --frames N  --size 960x540
 *            --preview 0,3.3,6.6 (a picture of these moments, to look at a scene quickly)
 */
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SHADERS = join(ROOT, 'backgrounds3d')
const OUT = join(ROOT, 'web', 'public', 'backgrounds')
const FPS = 30
const SECONDS = 10 // length of one loop (the shaders use LOOP = 10.0)

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args.splice(i, 2)[1] : fallback
}
const frames = Number(opt('--frames', SECONDS * FPS))
const [W, H] = opt('--size', '960x540').split('x').map(Number)
const crf = opt('--crf', '27')
const ss = Number(opt('--ss', '1')) // supersampling: draw bigger, then shrink (smoother edges)
const outDir = opt('--out', OUT)
const preview = opt('--preview', '') // e.g. 0,3.3,6.6: a picture of these moments instead of a clip
const ids = args.length ? args : readdirSync(SHADERS).filter((f) => f.endsWith('.frag')).map((f) => f.replace('.frag', ''))
const common = readFileSync(join(SHADERS, 'common.glsl'), 'utf8')

function run(cmd, argv, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'inherit'] })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    if (input) input(p.stdin)
  })
}

async function renderOne(browser, id) {
  const page = await browser.newPage()
  const source = `#version 300 es\nprecision highp float;\n${common}\n${readFileSync(join(SHADERS, `${id}.frag`), 'utf8')}`
  const err = await page.evaluate(
    ({ source, w, h }) => {
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
    { source, w: W * ss, h: H * ss },
  )
  if (err) throw new Error(`${id}: ${err}`)

  if (preview) {
    const times = preview.split(',').map(Number)
    await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W * ss}x${H * ss}`,
      '-i', '-', '-vf', `vflip,scale=${W / 2}:${H / 2}:flags=lanczos,tile=${times.length}x1`, '-frames:v', '1', join(outDir, `${id}.png`)],
    async (stdin) => {
      for (const t of times) stdin.write(Buffer.from(await page.evaluate((t) => window.drawFrame(t), t), 'base64'))
      stdin.end()
    })
    await page.close()
    return
  }
  const tmp = join(outDir, `${id}.part.mp4`)
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
  const mp4 = join(outDir, `${id}.mp4`)
  renameSync(tmp, mp4)
  await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-ss', String(Math.min(3, frames / FPS / 3)), '-i', mp4,
    '-frames:v', '1', '-vf', 'scale=240:-2', '-q:v', '4', join(outDir, `${id}.jpg`)])
  await page.close()
  console.log(`${id}: ${((Date.now() - started) / 1000).toFixed(0)} s`)
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const queue = [...ids]
const workers = Number(process.env.JOBS || 2)
await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
  while (queue.length) await renderOne(browser, queue.shift())
}))
await browser.close()
