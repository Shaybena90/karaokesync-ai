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
  /** Which opening clip: the KaraokeSync intro or the user's own. */
  introSource: 'builtin' | 'own'
}

/** What the API gets (null = no opening at all). */
export function openingRequest(c: OpeningChoice, ownIntroId: string | null = null) {
  if (!c.intro && !c.titleCard) return null
  return {
    intro: c.intro,
    transition: c.transition,
    title: c.titleCard ? { song: c.song.trim(), artist: c.artist.trim() } : null,
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

const KEY = (projectId: string) => `ks-opening:${projectId}`
const LAST_ARTIST = 'ks-opening:artist'

/** The choice for this song, remembered in this browser (the song's name starts as the project's title). */
export function useOpeningChoice(projectId: string, projectTitle: string) {
  const [choice, setChoice] = useState<OpeningChoice>(() => {
    const base: OpeningChoice = { intro: true, titleCard: true, song: projectTitle, artist: '', transition: 'fade', titleTheme: 'brand', introSource: 'builtin' }
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
