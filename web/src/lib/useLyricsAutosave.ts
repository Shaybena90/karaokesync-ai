import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isValidDoc, toSavePayload, type LyricsDoc } from './lyricsDoc'
import { supabase } from './supabase'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'offline' | 'conflict' | 'invalid'

const DEBOUNCE_MS = 800
const MAX_RETRY_MS = 30000

/**
 * Saves the lyrics document automatically shortly after every change.
 *
 * - one save in flight at a time; changes made meanwhile are saved right after
 * - transient failures retry with back-off (also when the device comes back online)
 * - a version conflict (edited in another tab, or re-processed) stops saving
 *   so nothing is overwritten
 * - pending changes are flushed when leaving the page
 */
export function useLyricsAutosave(projectId: string, initialVersion: number, doc: LyricsDoc | null) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const version = useRef(initialVersion)
  const savedDoc = useRef<LyricsDoc | null>(doc)
  const latest = useRef<LyricsDoc | null>(doc)
  const inFlight = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelay = useRef(2000)
  const stopped = useRef(false)
  const saveRef = useRef<() => Promise<void>>(async () => undefined)

  useLayoutEffect(() => {
    latest.current = doc
  }, [doc])

  const save = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const current = latest.current
    if (!supabase || !current || stopped.current || inFlight.current || current === savedDoc.current) return
    if (!isValidDoc(current)) return setStatus('invalid')
    if (!navigator.onLine) return setStatus('offline')

    inFlight.current = true
    setStatus('saving')
    const { data, error } = await supabase.rpc('save_lyrics', {
      p_project_id: projectId,
      p_expected_version: version.current,
      p_lines: toSavePayload(current),
    })
    inFlight.current = false

    if (error) {
      if (error.message === 'version_conflict' || error.message === 'not_editable') {
        stopped.current = true
        return setStatus('conflict')
      }
      if (error.message === 'invalid_lyrics') return setStatus('invalid')
      setStatus(navigator.onLine ? 'error' : 'offline')
      timer.current = setTimeout(() => void saveRef.current(), retryDelay.current)
      retryDelay.current = Math.min(retryDelay.current * 2, MAX_RETRY_MS)
      return
    }

    version.current = data as number
    savedDoc.current = current
    retryDelay.current = 2000
    if (latest.current !== current) {
      setStatus('pending')
      void saveRef.current() // changes arrived while saving
    } else {
      setStatus('saved')
    }
  }, [projectId])

  useLayoutEffect(() => {
    saveRef.current = save
  }, [save])

  // Debounced save after each change.
  useEffect(() => {
    if (!doc || doc === savedDoc.current || stopped.current) return
    setStatus('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS)
  }, [doc, save])

  // Retry when the connection returns; warn before closing with unsaved changes.
  useEffect(() => {
    const onOnline = () => void save()
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (latest.current !== savedDoc.current && !stopped.current) {
        void save()
        e.preventDefault()
      }
    }
    const onHide = () => document.visibilityState === 'hidden' && void save()
    window.addEventListener('online', onOnline)
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [save])

  // Flush when the editor is closed inside the app.
  useEffect(() => () => void save(), [save])

  /** Call after loading a fresh document (e.g. initial load). */
  const markSaved = useCallback((d: LyricsDoc, v: number) => {
    savedDoc.current = d
    latest.current = d
    version.current = v
    stopped.current = false
    setStatus('saved')
  }, [])

  return { status, saveNow: save, markSaved }
}
