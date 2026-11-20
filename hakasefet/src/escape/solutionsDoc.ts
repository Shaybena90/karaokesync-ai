import { COLLECTION } from './rooms'
import { PAIR_PUZZLES } from '../pair/logic'
import { PAIR_ROOM } from '../pair/meta'
import { CONTENT_VERSION } from './validate'
import type { WalkStep } from './types'

const step = (w: WalkStep): string => {
  if ('take' in w) return `לקחת: ${w.take}`
  if ('solve' in w) return `לפתור ${w.solve} ← \`${w.input}\``
  if ('use' in w) return `להשתמש ב־${w.item} על ${w.use}`
  if ('reveal' in w) return `לחשוף (עדשה): ${w.reveal}`
  if ('read' in w) return `לקרוא: ${w.read}`
  if ('act' in w) return `פעולה: ${w.act}`
  if ('combine' in w) return `לשלב: ${w.combine[0]} + ${w.combine[1]}`
  return `לחכות לדקה ${w.waitUntil} בלולאה`
}

/** The developer solutions document (docs/ESCAPE_SOLUTIONS.md). Never shown in the app. */
export function solutionsMarkdown(): string {
  const out: string[] = [
    '# פתרונות חדרי הבריחה — למפתחים בלבד',
    '',
    `> ⚠️ ספוילרים מלאים. המסמך נוצר אוטומטית מתוכן החדרים (גרסת תוכן ${CONTENT_VERSION}) ונבדק בבדיקות — לא עורכים אותו ידנית.`,
    '> לעדכון: `UPDATE_DOCS=1 npx vitest run src/escape/solutionsDoc.test.ts`',
    '',
  ]
  for (const r of COLLECTION) {
    out.push(`## ${r.emoji} ${r.title} (\`${r.id}\`)`, '', `**מטרה:** ${r.goal}`, '')
    if (r.timer) out.push(`**שעון:** ${r.timer.minutes} דקות (יש גם מצב אימון בלי שעון).`, '')
    if (r.loop) out.push(`**לולאה:** ${r.loop.minutes} דקות. נשמר בין לולאות: ${r.loop.persist.join(', ')} + כל דגל \`k:\` + המחברת.`, '')
    r.puzzles!.forEach((p, i) => {
      out.push(`### ${i + 1}. ${p.name} (\`${p.id}\`)`, '')
      out.push(`- **מה רואים:** ${p.sees}`)
      if (p.availableWhen?.length) out.push(`- **נפתח כש:** \`${p.availableWhen.join(' & ')}\``)
      out.push(`- **נפתר כש:** \`${p.doneWhen}\``)
      out.push(`- **פתרון:** ${p.solution}`)
      out.push(`- **הסבר:** ${p.explanation}`)
      out.push(`- **רמזים:** (1) ${p.hints[0]} (2) ${p.hints[1]} (3) ${p.hints[2]}`)
      out.push(`- **אחרי:** ${p.after}`)
      out.push(`- **תשובה שגויה:** ${p.wrong}`, '')
    })
    out.push('**מסלול פתרון מלא:**', '')
    r.walkthrough.forEach((w, i) => out.push(`${i + 1}. ${step(w)}`))
    out.push('')
  }
  out.push(`## ${PAIR_ROOM.emoji} ${PAIR_ROOM.title} (\`pair\`) — שני שחקנים`, '', `**מטרה:** ${PAIR_ROOM.goal}`, '')
  PAIR_PUZZLES.forEach((p, i) => {
    out.push(`### ${i + 1}. ${p.name} (\`${p.id}\`) — עונה: ${p.actor === 'both' ? 'שני הצדדים' : p.actor === 'A' ? 'צד א׳' : 'צד ב׳'}`, '')
    out.push(`- **פתרון:** ${p.solution}`)
    out.push(`- **הסבר:** ${p.explanation}`)
    out.push(`- **רמזים:** (1) ${p.hints[0]} (2) ${p.hints[1]} (3) ${p.hints[2]}`, '')
  })
  return out.join('\n')
}
