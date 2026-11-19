import type { ContentPack } from './types'
import { packV1 } from './v1'

/**
 * All content versions shipped with this build. Keep older packs here when
 * adding a new one, so attempts and challenge links that started on an older
 * version can still finish. See README → "הוספת תוכן".
 */
export const PACKS: Record<string, ContentPack> = {
  [packV1.version]: packV1,
}

/** The version new daily vaults use. */
export const CURRENT_VERSION = packV1.version

export function getPack(version: string): ContentPack | undefined {
  return Object.prototype.hasOwnProperty.call(PACKS, version) ? PACKS[version] : undefined
}

export function currentPack(): ContentPack {
  return PACKS[CURRENT_VERSION]
}

export * from './types'
