import type { ContentPack } from '../types'
import { sportsQuestions } from './questions-sports'
import { musicQuestions } from './questions-music'
import { generalQuestions } from './questions-general'
import { mysteries } from './mysteries'

export const packV1: ContentPack = {
  version: '2026.1',
  epoch: '2026-11-01',
  questions: [...sportsQuestions, ...musicQuestions, ...generalQuestions],
  mysteries,
}
