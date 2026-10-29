import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { SetupNotice } from '../components/SetupNotice'
import { Alert, Button, Card } from '../components/ui'
import { useI18n } from '../i18n/I18nProvider'
import { googleAuthEnabled, supabase } from '../lib/supabase'

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset'

const inputClass =
  'mt-1.5 block min-h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-base text-white placeholder:text-white/30 focus:border-violet-400 focus:outline-none'

export function AuthPage({ mode }: { mode: AuthMode }) {
  const { t } = useI18n()
  const { session, recovering } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const requestedFrom = (location.state as { from?: string } | null)?.from
  const from = requestedFrom ?? '/upload'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const sb = supabase
  if (!sb) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <SetupNotice />
      </div>
    )
  }
  if (session && mode !== 'reset' && !recovering) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const origin = window.location.origin
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate(from, { replace: true })
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/login` },
        })
        if (error) throw error
        if (data.session) navigate(from, { replace: true })
        else setNotice(t('auth.signup.sent'))
      } else if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` })
        if (error) throw error
        setNotice(t('auth.forgot.sent'))
      } else {
        const { error } = await sb.auth.updateUser({ password })
        if (error) throw error
        setNotice(t('auth.reset.done'))
        setTimeout(() => navigate('/projects', { replace: true }), 1200)
      }
    } catch (err) {
      // Supabase Auth messages are in English; they are shown as-is.
      setError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${from}` },
    })
    if (error) setError(error.message)
  }

  const titles = {
    login: 'auth.login.title',
    signup: 'auth.signup.title',
    forgot: 'auth.forgot.title',
    reset: 'auth.reset.title',
  } as const
  const submits = {
    login: 'auth.login.submit',
    signup: 'auth.signup.submit',
    forgot: 'auth.forgot.submit',
    reset: 'auth.reset.submit',
  } as const

  return (
    <div className="mx-auto max-w-md pt-10 sm:pt-16">
      <Card>
        <h1 className="font-display text-2xl font-bold">{t(titles[mode])}</h1>
        {requestedFrom === '/upload' && mode === 'login' && <p className="mt-2 text-sm text-white/60">{t('upload.loginRequired')}</p>}

        {googleAuthEnabled && (mode === 'login' || mode === 'signup') && (
          <>
            <Button variant="ghost" className="mt-6 w-full" onClick={google} type="button">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12Z" />
              </svg>
              {t('auth.google')}
            </Button>
            <div className="my-5 flex items-center gap-3 text-xs text-white/40">
              <span className="h-px flex-1 bg-white/10" />
              {t('auth.or')}
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}

        <form onSubmit={submit} className={`space-y-4 ${googleAuthEnabled ? '' : 'mt-6'}`}>
          {mode !== 'reset' && (
            <label className="block text-sm font-medium">
              {t('auth.email')}
              <input
                type="email"
                required
                autoComplete="email"
                dir="ltr"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== 'forgot' && (
            <label className="block text-sm font-medium">
              {mode === 'reset' ? t('auth.newPassword') : t('auth.password')}
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                dir="ltr"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode !== 'login' && <span className="mt-1 block text-xs text-white/40">{t('auth.passwordHint')}</span>}
            </label>
          )}

          {error && <Alert>{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}

          <Button type="submit" className="w-full" disabled={busy}>
            {t(submits[mode])}
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-2 text-center text-sm">
          {mode === 'login' && (
            <>
              <Link className="inline-flex min-h-11 items-center justify-center text-violet-300 hover:underline" to="/forgot-password" state={location.state}>
                {t('auth.toForgot')}
              </Link>
              <Link className="inline-flex min-h-11 items-center justify-center text-violet-300 hover:underline" to="/signup" state={location.state}>
                {t('auth.toSignup')}
              </Link>
            </>
          )}
          {(mode === 'signup' || mode === 'forgot') && (
            <Link className="inline-flex min-h-11 items-center justify-center text-violet-300 hover:underline" to="/login" state={location.state}>
              {t('auth.toLogin')}
            </Link>
          )}
        </div>
      </Card>
    </div>
  )
}
