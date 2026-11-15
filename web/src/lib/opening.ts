import { useEffect, useState } from 'react'

/** Same names as TRANSITIONS in server/karaokesync/exports/opening.py. */
export const TRANSITIONS = [
  'fade', 'fadeblack', 'fadewhite', 'dissolve', 'circleopen', 'circleclose', 'radial', 'pixelize',
  'zoomin', 'slideleft', 'smoothleft', 'hblur', 'diagtl', 'squeezeh', 'horzopen', 'none',
] as const
export type Transition = (typeof TRANSITIONS)[number]

/** Title card designs — same ids as THEMES in server/karaokesync/exports/opening.py. */
export const TITLE_THEMES = [
  { id: 'brand', he: 'סגול KaraokeSync', en: 'KaraokeSync purple' },
  { id: 'gold', he: 'זהב יוקרתי', en: 'Luxury gold' },
  { id: 'neon', he: 'ניאון', en: 'Neon' },
  { id: 'stage', he: 'במה', en: 'Stage' },
  { id: 'space', he: 'חלל', en: 'Space' },
  { id: 'sunset', he: 'שקיעה', en: 'Sunset' },
  { id: 'minimal', he: 'מינימליסטי', en: 'Minimal' },
] as const
export type TitleThemeId = (typeof TITLE_THEMES)[number]['id']
const THEME_IDS: readonly string[] = TITLE_THEMES.map((t) => t.id)
export const titleSample = (id: string) => `/intro/title-${id}-sample.jpg`

export interface OpeningChoice {
  intro: boolean
  titleCard: boolean
  song: string
  artist: string
  transition: Transition
  titleTheme: TitleThemeId
  /** Letter sizes on the title card, in percent of the design's size. */
  artistSize: number
  songSize: number
  /** Which opening clip: the KaraokeSync intro or the user's own. */
  introSource: 'builtin' | 'own'
}

/** What the API gets (null = no opening at all). */
export function openingRequest(c: OpeningChoice, ownIntroId: string | null = null) {
  if (!c.intro && !c.titleCard) return null
  return {
    intro: c.intro,
    transition: c.transition,
    title: c.titleCard ? { song: c.song.trim(), artist: c.artist.trim(), artist_size: c.artistSize, song_size: c.songSize } : null,
    title_theme: c.titleTheme,
    intro_media_id: c.intro && c.introSource === 'own' && ownIntroId ? ownIntroId : null,
  }
}

export const openingProblem = (c: OpeningChoice, hasOwnIntro = true) =>
  c.titleCard && !c.song.trim()
    ? 'export.opening.needSong'
    : c.intro && c.introSource === 'own' && !hasOwnIntro
      ? 'export.opening.needOwnIntro'
      : null

export const TITLE_SIZE = { min: 50, max: 160, step: 10 } as const
const titleSize = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(TITLE_SIZE.max, Math.max(TITLE_SIZE.min, Math.round(v / 10) * 10)) : 100

const KEY = (projectId: string) => `ks-opening:${projectId}`
const LAST_ARTIST = 'ks-opening:artist'

/** The choice for this song, remembered in this browser (the song's name starts as the project's title). */
export function useOpeningChoice(projectId: string, projectTitle: string) {
  const [choice, setChoice] = useState<OpeningChoice>(() => {
    const base: OpeningChoice = { intro: true, titleCard: true, song: projectTitle, artist: '', transition: 'fade', titleTheme: 'brand', introSource: 'builtin', artistSize: 100, songSize: 100 }
    try {
      const saved = JSON.parse(localStorage.getItem(KEY(projectId)) ?? 'null')
      const artist = localStorage.getItem(LAST_ARTIST) ?? ''
      if (saved && typeof saved === 'object') {
        return {
          intro: typeof saved.intro === 'boolean' ? saved.intro : base.intro,
          titleCard: typeof saved.titleCard === 'boolean' ? saved.titleCard : base.titleCard,
          song: typeof saved.song === 'string' ? saved.song.slice(0, 120) : base.song,
          artist: typeof saved.artist === 'string' ? saved.artist.slice(0, 120) : artist,
          transition: (TRANSITIONS as readonly string[]).includes(saved.transition) ? saved.transition : base.transition,
          titleTheme: THEME_IDS.includes(saved.titleTheme) ? saved.titleTheme : base.titleTheme,
          introSource: saved.introSource === 'own' ? 'own' : 'builtin',
          artistSize: titleSize(saved.artistSize),
          songSize: titleSize(saved.songSize),
        }
      }
      return { ...base, artist }
    } catch {
      return base
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(KEY(projectId), JSON.stringify(choice))
      if (choice.artist.trim()) localStorage.setItem(LAST_ARTIST, choice.artist.trim())
    } catch {
      /* private window: not remembered */
    }
  }, [projectId, choice])
  return [choice, setChoice] as const
}

/**
 * Whether 1080p would look blocky for a song this long: exported videos must fit
 * the storage limit (48 MB on Supabase's free plan), so a long video gets few
 * bits per second. Same numbers as best_resolution() in server/karaokesync/exports/video.py,
 * which then makes the video in 720p instead.
 */
export function starved1080p(songMs: number, c: OpeningChoice | null, maxMb = 48): boolean {
  if (songMs <= 0) return false
  const parts = c ? [c.intro ? 8000 : 0, c.titleCard ? 6500 : 0].filter(Boolean) : []
  const blend = c?.transition === 'none' ? 34 : 1800
  const lead = parts.length ? parts.reduce((a, b) => a + b, 0) - blend * parts.length : 0
  const seconds = (songMs + lead) / 1000
  const budget = ((maxMb * 1024 * 1024 * 8) / 1000) * 0.9
  const perSecond = budget / seconds
  const audio = perSecond >= 2000 ? 192 : perSecond >= 600 ? 128 : 96
  return (budget - audio * seconds) / (seconds + 2) < 2800
}

/** A big export is stored in parts ("<path>.parts3" -> "<path>.part0".."part2"); see server/karaokesync/export_parts.py. */
export function exportParts(outputPath: string): string[] {
  const m = /^(.*)\.parts(\d+)$/.exec(outputPath)
  if (!m) return [outputPath]
  return Array.from({ length: Number(m[2]) }, (_, k) => `${m[1]}.part${k}`)
}
