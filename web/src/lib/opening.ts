import { useEffect, useState } from 'react'

/** Same names as TRANSITIONS in server/karaokesync/exports/opening.py. */
export const TRANSITIONS = [
  'fade', 'fadeblack', 'fadewhite', 'dissolve', 'circleopen', 'circleclose', 'radial', 'pixelize',
  'zoomin', 'slideleft', 'smoothleft', 'hblur', 'diagtl', 'squeezeh', 'horzopen', 'none',
] as const
export type Transition = (typeof TRANSITIONS)[number]

export interface OpeningChoice {
  intro: boolean
  titleCard: boolean
  song: string
  artist: string
  transition: Transition
}

/** What the API gets (null = no opening at all). */
export function openingRequest(c: OpeningChoice) {
  if (!c.intro && !c.titleCard) return null
  return {
    intro: c.intro,
    transition: c.transition,
    title: c.titleCard ? { song: c.song.trim(), artist: c.artist.trim() } : null,
  }
}

export const openingProblem = (c: OpeningChoice) => (c.titleCard && !c.song.trim() ? 'export.opening.needSong' : null)

const KEY = (projectId: string) => `ks-opening:${projectId}`
const LAST_ARTIST = 'ks-opening:artist'

/** The choice for this song, remembered in this browser (the song's name starts as the project's title). */
export function useOpeningChoice(projectId: string, projectTitle: string) {
  const [choice, setChoice] = useState<OpeningChoice>(() => {
    const base: OpeningChoice = { intro: true, titleCard: true, song: projectTitle, artist: '', transition: 'fade' }
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
