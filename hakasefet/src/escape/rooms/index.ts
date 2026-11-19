import type { Category, RoomDef } from '../types'
import { ayalon } from './ayalon'
import { jerusalem } from './jerusalem'
import { bletchley } from './bletchley'
import { lab } from './lab'
import { station } from './station'
import { museum } from './museum'

/** All escape rooms. Add a room: create a file here and list it. */
export const ROOMS: RoomDef[] = [ayalon, jerusalem, bletchley, lab, station, museum]

export const CATEGORIES: Category[] = ['מחתרות', 'מלחמות ישראל', 'מלחמת העולם השנייה', 'מדע ודמיון']

export function getRoom(id: string): RoomDef | undefined {
  return ROOMS.find((r) => r.id === id)
}
