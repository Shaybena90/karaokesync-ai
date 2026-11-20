import type { Category, RoomDef } from '../types'
import { ayalon } from './ayalon'
import { jerusalem } from './jerusalem'
import { bletchley } from './bletchley'
import { lab } from './lab'
import { station } from './station'
import { museum } from './museum'
import { phone } from './collection/phone'
import { bank } from './collection/bank'
import { loop } from './collection/loop'
import { hotel } from './collection/hotel'
import { orbit } from './collection/orbit'
import { evidence } from './collection/evidence'

/** The escape-room collection (solo rooms; the two-player room lives in src/pair). */
export const COLLECTION: RoomDef[] = [phone, bank, loop, hotel, orbit, evidence]

/** The earlier themed rooms ("more rooms"). */
export const CLASSIC: RoomDef[] = [ayalon, jerusalem, bletchley, lab, station, museum]

/** All solo escape rooms. Add a room: create a file here and list it. */
export const ROOMS: RoomDef[] = [...COLLECTION, ...CLASSIC]

export const CATEGORIES: Category[] = ['חדרי בריחה', 'מחתרות', 'מלחמות ישראל', 'מלחמת העולם השנייה', 'מדע ודמיון']

export function getRoom(id: string): RoomDef | undefined {
  return ROOMS.find((r) => r.id === id)
}
