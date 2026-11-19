/** Shop catalog for "החדר שלי". Rendering lives in src/ui/RoomScene.tsx. */
export type Slot = 'wall' | 'floor' | 'rug' | 'lamp' | 'plant' | 'poster' | 'shelf' | 'window'

export interface RoomItem {
  id: string
  slot: Slot
  name: string
  price: number
  emoji: string
}

export const SLOT_LABEL: Record<Slot, string> = {
  wall: 'קיר', floor: 'רצפה', rug: 'שטיח', lamp: 'תאורה', plant: 'צמח', poster: 'תמונה', shelf: 'מדף', window: 'חלון',
}

export const ROOM_ITEMS: RoomItem[] = [
  { id: 'wall-night', slot: 'wall', name: 'קיר כחול לילה', price: 0, emoji: '🟦' },
  { id: 'wall-stars', slot: 'wall', name: 'טפט כוכבים', price: 40, emoji: '✨' },
  { id: 'wall-gold', slot: 'wall', name: 'פסי זהב', price: 60, emoji: '🟨' },
  { id: 'floor-wood', slot: 'floor', name: 'פרקט עץ', price: 0, emoji: '🪵' },
  { id: 'floor-checker', slot: 'floor', name: 'משבצות שחמט', price: 35, emoji: '♟️' },
  { id: 'rug-teal', slot: 'rug', name: 'שטיח טורקיז עגול', price: 20, emoji: '🟢' },
  { id: 'rug-royal', slot: 'rug', name: 'שטיח מלכותי', price: 50, emoji: '🟥' },
  { id: 'lamp-desk', slot: 'lamp', name: 'מנורת קריאה', price: 25, emoji: '💡' },
  { id: 'lamp-chandelier', slot: 'lamp', name: 'נברשת זהב', price: 70, emoji: '🕯️' },
  { id: 'plant-cactus-mini', slot: 'plant', name: 'קקטוס קטן', price: 20, emoji: '🌵' },
  { id: 'plant-monstera', slot: 'plant', name: 'מונסטרה', price: 35, emoji: '🪴' },
  { id: 'poster-vault', slot: 'poster', name: 'פוסטר כספת', price: 30, emoji: '🖼️' },
  { id: 'poster-notes', slot: 'poster', name: 'פוסטר תווים', price: 30, emoji: '🎼' },
  { id: 'shelf-trophy', slot: 'shelf', name: 'מדף גביעים', price: 45, emoji: '🏆' },
  { id: 'window-city', slot: 'window', name: 'חלון לעיר בלילה', price: 40, emoji: '🌃' },
  { id: 'window-sea', slot: 'window', name: 'חלון לים', price: 40, emoji: '🌊' },
]

export const itemById = (id: string) => ROOM_ITEMS.find((i) => i.id === id)
