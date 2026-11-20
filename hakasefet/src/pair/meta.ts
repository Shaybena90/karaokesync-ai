/** Catalog info for the two-player room (its logic lives in ./logic.ts and runs on the pair server). */
export const PAIR_ROOM = {
  id: 'pair',
  title: 'שני צדדים של הדלת',
  emoji: '🚪',
  blurb: 'שניכם נעולים — כל אחד בצד אחר של אותה דלת. מה שאתם רואים, השני צריך לדעת.',
  story: 'שני חדרים, דלת אחת ביניהם. בצד א׳ יש מפה, טבלאות ומדים; בצד ב׳ — מקרא, קלפים ומתגים. אף אחד לא יכול לפתור לבד: מדברים, מתארים ומשלבים.',
  goal: 'לפתור יחד שישה שלבים, לקבל כל אחד קוד לצד של השני — ולפתוח את הדלת ביחד.',
  difficultyLabel: 'בינונית',
  length: '25–35 דקות',
  players: 2 as const,
}
