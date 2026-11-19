import { Link, useSearchParams } from 'react-router-dom'
import { parseChallenge } from '../engine/challenge'
import { useApp } from '../state/AppState'
import { ErrorBox } from '../ui/kit'
import { VaultIntro } from './VaultIntro'

export function ChallengeLanding() {
  const { today } = useApp()
  const [params] = useSearchParams()
  const r = parseChallenge(params, today)
  if (!r.ok) {
    const text =
      r.reason === 'unknown-version'
        ? 'הקישור שייך לגרסת תוכן שלא זמינה במכשיר הזה. אולי צריך לעדכן את המשחק — או לשחק בכספת של היום.'
        : r.reason === 'future'
          ? 'הכספת בקישור עוד לא נפתחה. בינתיים אפשר לשחק בכספת של היום.'
          : 'הקישור לא תקין או שנקטע בהעתקה.'
    return <ErrorBox title="לא הצלחנו לפתוח את האתגר" text={text} action={<Link className="btn btn-gold" to="/">לכספת של היום</Link>} />
  }
  return <VaultIntro challenge={r.challenge} />
}
