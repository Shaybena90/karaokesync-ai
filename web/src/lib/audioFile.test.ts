import { describe, expect, it } from 'vitest'
import { checkLocalFile, extensionOf, sniffFormat } from './audioFile'
import { directionOf, formatBytes, formatDuration } from './format'

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))

describe('audio file checks', () => {
  it('sniffs real formats from magic bytes', () => {
    expect(sniffFormat(bytes('ID3', [4, 0, 0, 0]))).toBe('mp3')
    expect(sniffFormat(bytes([0xff, 0xfb, 0x90, 0x64]))).toBe('mp3')
    expect(sniffFormat(bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '))).toBe('wav')
    expect(sniffFormat(bytes([0, 0, 0, 0x20], 'ftypM4A '))).toBe('m4a')
    expect(sniffFormat(bytes([0x89], 'PNG', [13, 10, 26, 10]))).toBeNull()
    expect(sniffFormat(bytes())).toBeNull()
  })

  it('checks extension, size and content', async () => {
    const mp3 = new File([bytes('ID3', new Array(60).fill(0))], 'song.MP3')
    expect(await checkLocalFile(mp3, 1000)).toEqual({ ok: true, format: 'mp3' })
    expect(await checkLocalFile(new File(['x'], 'a.flac'), 1000)).toEqual({ ok: false, code: 'unsupported_extension' })
    expect(await checkLocalFile(new File([], 'a.mp3'), 1000)).toEqual({ ok: false, code: 'empty_file' })
    expect(await checkLocalFile(mp3, 10)).toEqual({ ok: false, code: 'file_too_large' })
    const renamed = new File([bytes([0x89], 'PNG', new Array(60).fill(0))], 'evil.mp3')
    expect(await checkLocalFile(renamed, 1000)).toEqual({ ok: false, code: 'not_audio' })
    const wavAsMp3 = new File([bytes('RIFF', [0, 0, 0, 0], 'WAVE', new Array(60).fill(0))], 'x.mp3')
    expect(await checkLocalFile(wavAsMp3, 1000)).toEqual({ ok: false, code: 'format_mismatch' })
  })

  it('extension helper', () => {
    expect(extensionOf('a.b.wav')).toBe('wav')
    expect(extensionOf('noext')).toBeNull()
  })
})

describe('formatting', () => {
  it('formats durations and sizes', () => {
    expect(formatDuration(83_500)).toBe('1:23')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
    expect(formatDuration(null)).toBe('–:––')
    expect(formatBytes(5 * 1024 * 1024, 'en')).toBe('5.0 MB')
    expect(formatBytes(512, 'en')).toBe('512 B')
  })

  it('knows the direction of lyric languages', () => {
    expect(directionOf('he')).toBe('rtl')
    expect(directionOf('en')).toBe('ltr')
    expect(directionOf(null)).toBe('auto')
  })
})
