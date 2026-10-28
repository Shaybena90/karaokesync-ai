import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { he, type MessageKey } from './he'
import { en } from './en'

export type Locale = 'he' | 'en'
type Params = Record<string, string | number>

const dictionaries: Record<Locale, Record<MessageKey, string>> = { he, en }
const STORAGE_KEY = 'ks.locale'

interface I18nValue {
  locale: Locale
  dir: 'rtl' | 'ltr'
  setLocale: (l: Locale) => void
  t: (key: MessageKey, params?: Params) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function format(template: string, params?: Params): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`))
}

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'he' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  return 'he'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
  }, [locale, dir])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const t = useCallback(
    (key: MessageKey, params?: Params) => format(dictionaries[locale][key] ?? key, params),
    [locale],
  )

  const value = useMemo(() => ({ locale, dir, setLocale, t }) as I18nValue, [locale, dir, setLocale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(he, key)
}

/** Translate a machine error code coming from the API/worker, with a safe fallback. */
export function errorKey(code: string | null | undefined): MessageKey {
  const key = `error.${code ?? 'generic'}`
  return isMessageKey(key) ? key : 'error.generic'
}
