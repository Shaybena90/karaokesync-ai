import type { RoomDef } from '../types'
import { lab } from './lab'
import { station } from './station'
import { museum } from './museum'

/** All escape rooms, easiest first. Add a room: create a file here and list it. */
export const ROOMS: RoomDef[] = [lab, station, museum]

export function getRoom(id: string): RoomDef | undefined {
  return ROOMS.find((r) => r.id === id)
}
