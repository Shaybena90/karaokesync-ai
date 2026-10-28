/**
 * Client-side checks before uploading. These give quick feedback only — the
 * server repeats a stricter verification (magic bytes + ffprobe) after upload,
 * because anything in the browser can be bypassed.
 */
export type AudioFormat = 'mp3' | 'wav' | 'm4a'

export const ACCEPT_ATTR = '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a'

const M4A_BRANDS = ['M4A ', 'M4B ', 'mp42', 'mp41', 'isom', 'iso2', 'dash', 'MSNV', 'M4V ']

export function extensionOf(name: string): AudioFormat | null {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return ext === 'mp3' || ext === 'wav' || ext === 'm4a' ? ext : null
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end))
}

export function sniffFormat(head: Uint8Array): AudioFormat | null {
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WAVE') return 'wav'
  if (head.length >= 12 && ascii(head, 4, 8) === 'ftyp' && M4A_BRANDS.includes(ascii(head, 8, 12))) return 'm4a'
  if (head.length >= 3 && ascii(head, 0, 3) === 'ID3') return 'mp3'
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0) return 'mp3'
  return null
}

export interface LocalCheckOk {
  ok: true
  format: AudioFormat
}
export interface LocalCheckError {
  ok: false
  code: 'unsupported_extension' | 'empty_file' | 'file_too_large' | 'not_audio' | 'format_mismatch'
}

export async function checkLocalFile(file: File, maxBytes: number): Promise<LocalCheckOk | LocalCheckError> {
  const ext = extensionOf(file.name)
  if (!ext) return { ok: false, code: 'unsupported_extension' }
  if (file.size === 0) return { ok: false, code: 'empty_file' }
  if (file.size > maxBytes) return { ok: false, code: 'file_too_large' }
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  const sniffed = sniffFormat(head)
  if (!sniffed) return { ok: false, code: 'not_audio' }
  if (sniffed !== ext) return { ok: false, code: 'format_mismatch' }
  return { ok: true, format: ext }
}

/** Duration in ms read by the browser's own decoder, or null if it cannot tell. */
export function readDuration(file: File, timeoutMs = 10000): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    const url = URL.createObjectURL(file)
    const done = (value: number | null) => {
      clearTimeout(timer)
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = setTimeout(() => done(null), timeoutMs)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null)
    audio.onerror = () => done(null)
    audio.src = url
  })
}
